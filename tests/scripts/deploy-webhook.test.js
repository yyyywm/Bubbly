/**
 * ============================================================
 *  Bubbly - 自动部署 Webhook 监听器 · 单元测试
 * ============================================================
 *  运行: npm test
 *  覆盖: 签名校验（防伪造/防篡改）、事件过滤（分支/事件类型）、
 *        部署器命令序列（fetch → reset → 重建 → 健康检查）、
 *        HTTP 端点行为（202 受理、排队合并、401/400/404）。
 *  说明: 命令执行与健康检查均为注入的 fake，不触达真实 git/docker。
 * ============================================================
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const path = require('node:path');

const {
  loadConfig,
  verifySignature,
  resolveAction,
  checkHealth,
  createDeployer,
  createServer
} = require('../../scripts/deploy-webhook');

const SECRET = 'test-secret';

/** 计算与 GitHub 一致的 X-Hub-Signature-256 签名 */
function sign(secret, body) {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

/** 构造按调用顺序吐出 stdout 的 fake 命令执行器，并记录调用序列 */
function fakeRunner(outputs) {
  const calls = [];
  const run = async (file, args) => {
    const index = calls.length; // 本次调用的序号（push 前取值）
    calls.push([file, ...args]);
    return outputs[index] !== undefined ? outputs[index] : 'sha';
  };
  return { run, calls };
}

/** 启动监听器到随机端口，返回 {port, ...harness}；测试结束后统一关闭 */
const harnesses = [];
async function startServer(config, deps) {
  const harness = createServer(config, deps);
  await new Promise((resolve, reject) => {
    harness.server.once('error', reject);
    harness.server.listen(0, '127.0.0.1', resolve);
  });
  harnesses.push(harness);
  return { ...harness, port: harness.server.address().port };
}

after(async () => {
  await Promise.all(
    harnesses.map(
      (h) => new Promise((resolve) => h.server.close(resolve))
    )
  );
});

/** 向监听器发送模拟 GitHub webhook 请求 */
function post(port, pathname, { event, body, secret = SECRET, raw } = {}) {
  const payload = raw !== undefined ? raw : JSON.stringify(body);
  const bodyBuffer = Buffer.from(payload);
  const headers = {
    'content-type': 'application/json',
    'x-hub-signature-256': sign(secret, bodyBuffer)
  };
  if (event !== undefined) headers['x-github-event'] = event;
  return fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: 'POST',
    headers,
    body: bodyBuffer
  });
}

describe('loadConfig', () => {
  test('缺省值：端口 9000、分支 main、健康地址指向本机 8080', () => {
    const config = loadConfig({});
    assert.equal(config.port, 9000);
    assert.equal(config.branch, 'main');
    assert.equal(config.secret, '');
    assert.equal(config.healthUrl, 'http://127.0.0.1:8080/health');
    assert.equal(config.deployCmd, '');
  });

  test('环境变量逐项覆盖默认值', () => {
    const config = loadConfig({
      WEBHOOK_PORT: '9443',
      WEBHOOK_SECRET: 's3cret',
      BUBBLY_DIR: '/srv/Bubbly',
      WEBHOOK_BRANCH: 'release',
      WEBHOOK_HEALTH_URL: 'http://127.0.0.1:9999/health',
      WEBHOOK_DEPLOY_CMD: 'make deploy'
    });
    assert.equal(config.port, 9443);
    assert.equal(config.secret, 's3cret');
    assert.equal(config.repoDir, path.resolve('/srv/Bubbly'));
    assert.equal(config.branch, 'release');
    assert.equal(config.healthUrl, 'http://127.0.0.1:9999/health');
    assert.equal(config.deployCmd, 'make deploy');
  });

  test('非法端口回退默认 9000', () => {
    assert.equal(loadConfig({ WEBHOOK_PORT: 'abc' }).port, 9000);
    assert.equal(loadConfig({ WEBHOOK_PORT: '' }).port, 9000);
  });
});

describe('verifySignature', () => {
  const body = Buffer.from('{"ref":"refs/heads/main"}');

  test('合法签名通过', () => {
    assert.equal(verifySignature(SECRET, body, sign(SECRET, body)), true);
  });

  test('内容被篡改时签名校验失败（防伪造 payload）', () => {
    const tampered = Buffer.from('{"ref":"refs/heads/main","evil":true}');
    assert.equal(verifySignature(SECRET, tampered, sign(SECRET, body)), false);
  });

  test('密钥不一致时校验失败', () => {
    assert.equal(verifySignature('other-secret', body, sign(SECRET, body)), false);
  });

  test('格式非法的签名头一律拒绝', () => {
    assert.equal(verifySignature(SECRET, body, 'sha1=deadbeef'), false);
    assert.equal(verifySignature(SECRET, body, 'sha256=not-hex'), false);
    assert.equal(verifySignature(SECRET, body, 'sha256='), false);
    assert.equal(verifySignature(SECRET, body, ''), false);
    assert.equal(verifySignature(SECRET, body, undefined), false);
  });

  test('本端未配置密钥时一律拒绝（fail closed）', () => {
    assert.equal(verifySignature('', body, sign(SECRET, body)), false);
  });
});

describe('resolveAction', () => {
  test('push 到跟踪分支返回 deploy', () => {
    assert.equal(resolveAction('push', { ref: 'refs/heads/main' }, 'main'), 'deploy');
  });

  test('push 到其他分支被忽略', () => {
    assert.equal(resolveAction('push', { ref: 'refs/heads/develop' }, 'main'), 'ignore');
  });

  test('tag 推送被忽略', () => {
    assert.equal(resolveAction('push', { ref: 'refs/tags/v1.2.0' }, 'main'), 'ignore');
  });

  test('分支删除事件被忽略', () => {
    assert.equal(
      resolveAction('push', { ref: 'refs/heads/main', deleted: true }, 'main'),
      'ignore'
    );
  });

  test('ping 事件返回 ping（webhook 建立连通性探测）', () => {
    assert.equal(resolveAction('ping', { zen: 'x' }, 'main'), 'ping');
  });

  test('其他事件类型被忽略', () => {
    assert.equal(resolveAction('issues', { action: 'opened' }, 'main'), 'ignore');
    assert.equal(resolveAction('', null, 'main'), 'ignore');
  });

  test('自定义跟踪分支同样生效', () => {
    assert.equal(resolveAction('push', { ref: 'refs/heads/develop' }, 'develop'), 'deploy');
  });
});

describe('createDeployer', () => {
  const config = loadConfig({ BUBBLY_DIR: '/srv/Bubbly', WEBHOOK_SECRET: 's' });

  test('代码有更新：fetch → 比对 → reset → docker compose 重建 → 健康检查', async () => {
    // outputs[i] 对应第 i 次调用的 stdout：fetch / rev-parse HEAD / rev-parse origin/main
    const { run, calls } = fakeRunner(['unused-fetch', 'aaaa000', 'bbbb111']);
    const deploy = createDeployer(config, {
      run,
      checkHealth: async () => true,
      pollHealth: async (url, check) => check('unused')
    });

    const result = await deploy();
    assert.deepEqual(calls, [
      ['git', 'fetch', 'origin', 'main', '--prune'],
      ['git', 'rev-parse', 'HEAD'],
      ['git', 'rev-parse', 'origin/main'],
      ['git', 'reset', '--hard', 'bbbb111'],
      ['docker', 'compose', 'up', '-d', '--build']
    ]);
    assert.deepEqual(result, { updated: true, commit: 'bbbb111', healthy: true });
  });

  test('远端无新提交：仅 fetch 比对，不重置也不重建', async () => {
    const { run, calls } = fakeRunner(['unused-fetch', 'aaaa000', 'aaaa000']);
    const deploy = createDeployer(config, { run });

    const result = await deploy();
    assert.deepEqual(calls, [
      ['git', 'fetch', 'origin', 'main', '--prune'],
      ['git', 'rev-parse', 'HEAD'],
      ['git', 'rev-parse', 'origin/main']
    ]);
    assert.deepEqual(result, { updated: false, commit: 'aaaa000' });
  });

  test('配置 WEBHOOK_DEPLOY_CMD 时改走 shell 命令而非 docker compose', async () => {
    const { run, calls } = fakeRunner(['unused-fetch', 'aaaa000', 'bbbb111']);
    const shells = [];
    let shellOpts = null;
    const deploy = createDeployer(
      loadConfig({
        WEBHOOK_SECRET: 's',
        BUBBLY_DIR: '/srv/Bubbly',
        WEBHOOK_DEPLOY_CMD: 'npm ci --omit=dev'
      }),
      {
        run,
        runShell: async (cmd, opts) => {
          shells.push(cmd);
          shellOpts = opts;
        },
        checkHealth: async () => true,
        pollHealth: async (_url, check) => check('unused')
      }
    );

    await deploy();
    assert.deepEqual(shells, ['npm ci --omit=dev']);
    assert.ok(!calls.some((c) => c[0] === 'docker'), '不应调用 docker compose');
    // 注入新旧提交号，便于命令内按变更范围条件执行
    assert.equal(shellOpts.env.DEPLOY_OLD_COMMIT, 'aaaa000');
    assert.equal(shellOpts.env.DEPLOY_NEW_COMMIT, 'bbbb111');
  });

  test('健康检查未通过：部署结果标记 healthy: false', async () => {
    const { run } = fakeRunner(['unused-fetch', 'aaaa000', 'bbbb111']);
    const deploy = createDeployer(config, {
      run,
      pollHealth: async () => false
    });

    const result = await deploy();
    assert.equal(result.updated, true);
    assert.equal(result.healthy, false);
  });

  test('命令执行失败时向上抛出错误', async () => {
    const deploy = createDeployer(config, {
      run: async () => {
        throw new Error('git fetch 失败');
      }
    });
    await assert.rejects(deploy(), /git fetch 失败/);
  });
});

describe('createServer · HTTP 端点', () => {
  test('GET /health 返回监听器自身状态', async () => {
    const { port } = await startServer(loadConfig({ WEBHOOK_SECRET: SECRET }), {
      deploy: async () => ({ updated: true })
    });

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.deploying, false);
    assert.equal(data.pending, false);
    assert.equal(data.lastDeploy, null);
  });

  test('非 webhook 路径返回 404', async () => {
    const { port } = await startServer(loadConfig({ WEBHOOK_SECRET: SECRET }), {
      deploy: async () => ({})
    });

    const res = await fetch(`http://127.0.0.1:${port}/other`);
    assert.equal(res.status, 404);
  });

  test('main 分支 push：返回 202 受理并后台完成部署', async () => {
    let deployCalls = 0;
    const { port, state, waitForIdle } = await startServer(
      loadConfig({ WEBHOOK_SECRET: SECRET }),
      {
        deploy: async () => {
          deployCalls++;
          return { updated: true, commit: 'bbbb111' };
        }
      }
    );

    const res = await post(port, '/webhook', {
      event: 'push',
      body: { ref: 'refs/heads/main', head_commit: { id: 'bbbb111deadbeef' } }
    });
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { ok: true, action: 'deploy', status: 'started' });

    assert.equal(await waitForIdle(2000), true);
    assert.equal(deployCalls, 1);
    assert.equal(state.lastDeploy.ok, true);
    assert.equal(state.lastDeploy.commit, 'bbbb111');
  });

  test('非跟踪分支 push 返回 ignored，不触发部署', async () => {
    let deployCalls = 0;
    const { port } = await startServer(loadConfig({ WEBHOOK_SECRET: SECRET }), {
      deploy: async () => {
        deployCalls++;
        return {};
      }
    });

    const res = await post(port, '/webhook', {
      event: 'push',
      body: { ref: 'refs/heads/develop' }
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, action: 'ignored' });
    assert.equal(deployCalls, 0);
  });

  test('ping 事件回复 pong，不触发部署', async () => {
    let deployCalls = 0;
    const { port } = await startServer(loadConfig({ WEBHOOK_SECRET: SECRET }), {
      deploy: async () => {
        deployCalls++;
        return {};
      }
    });

    const res = await post(port, '/webhook', { event: 'ping', body: { zen: 'Keep it simple.' } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, action: 'ping' });
    assert.equal(deployCalls, 0);
  });

  test('签名不符返回 401（防伪造请求）', async () => {
    let deployCalls = 0;
    const { port } = await startServer(loadConfig({ WEBHOOK_SECRET: SECRET }), {
      deploy: async () => {
        deployCalls++;
        return {};
      }
    });

    const res = await post(port, '/webhook', {
      event: 'push',
      body: { ref: 'refs/heads/main' },
      secret: 'wrong-secret'
    });
    assert.equal(res.status, 401);
    assert.equal(deployCalls, 0);
  });

  test('缺少签名头返回 401', async () => {
    const { port } = await startServer(loadConfig({ WEBHOOK_SECRET: SECRET }), {
      deploy: async () => ({})
    });

    const res = await fetch(`http://127.0.0.1:${port}/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-github-event': 'push' },
      body: '{"ref":"refs/heads/main"}'
    });
    assert.equal(res.status, 401);
  });

  test('JSON 解析失败返回 400', async () => {
    const { port } = await startServer(loadConfig({ WEBHOOK_SECRET: SECRET }), {
      deploy: async () => ({})
    });

    const res = await post(port, '/webhook', { event: 'push', raw: '{not-json' });
    assert.equal(res.status, 400);
  });
});

describe('createServer · 部署排队', () => {
  test('部署进行中收到新 push 排队，结束后自动补跑一次', async () => {
    let releaseDeploy;
    const gate = new Promise((resolve) => { releaseDeploy = resolve; });
    let deployCalls = 0;
    const { port, state, waitForIdle } = await startServer(
      loadConfig({ WEBHOOK_SECRET: SECRET }),
      {
        deploy: async () => {
          deployCalls++;
          if (deployCalls === 1) await gate; // 第一次部署挂起，模拟构建耗时
          return { updated: true };
        }
      }
    );

    const r1 = await post(port, '/webhook', { event: 'push', body: { ref: 'refs/heads/main' } });
    assert.equal((await r1.json()).status, 'started');

    const r2 = await post(port, '/webhook', { event: 'push', body: { ref: 'refs/heads/main' } });
    assert.equal((await r2.json()).status, 'queued');
    assert.equal(state.deploying, true);
    assert.equal(state.pending, true);

    releaseDeploy();
    assert.equal(await waitForIdle(2000), true);
    assert.equal(deployCalls, 2, '排队请求应在部署完成后补跑一次');
    assert.equal(state.pending, false);
    assert.equal(state.lastDeploy.ok, true);
  });
});

describe('checkHealth', () => {
  test('2xx 响应视为健康', async () => {
    const server = http.createServer((req, res) => {
      res.statusCode = 200;
      res.end('{"status":"ok"}');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    try {
      assert.equal(await checkHealth(`http://127.0.0.1:${port}/health`, 1000), true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('非 2xx 响应视为不健康', async () => {
    const server = http.createServer((req, res) => {
      res.statusCode = 500;
      res.end('boom');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    try {
      assert.equal(await checkHealth(`http://127.0.0.1:${port}/health`, 1000), false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('连接拒绝视为不健康且不抛错', async () => {
    // 先借一个端口再立即释放，确保该端口无人监听
    const server = http.createServer(() => {});
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const deadPort = server.address().port;
    await new Promise((resolve) => server.close(resolve));

    assert.equal(await checkHealth(`http://127.0.0.1:${deadPort}/health`, 1000), false);
  });
});
