/**
 * ============================================================
 *  Bubbly - GitHub Webhook 自动部署监听器
 * ============================================================
 *  运行: npm run webhook
 *
 *  部署在服务器【宿主机】上的轻量监听服务（零依赖，仅 Node 内置模块）。
 *  必须跑在宿主机而非容器内：它需要操作宿主机的仓库目录与进程管理器
 *  （Docker / PM2 / systemctl，取决于部署方式）。
 *
 *  工作流程（GitHub push 到跟踪分支时自动触发）：
 *    1. 校验 X-Hub-Signature-256 签名（HMAC-SHA256，防伪造请求）
 *    2. 仅响应 push 事件且分支为 WEBHOOK_BRANCH（默认 main），其余忽略
 *    3. git fetch origin <branch> && git reset --hard origin/<branch>
 *    4. 重启服务（默认 docker compose up -d --build，可用 WEBHOOK_DEPLOY_CMD 替换）
 *    5. 轮询 /health 直到新版本就绪
 *
 *  部署请求先回 202 再后台执行（GitHub 仅要求 10 秒内响应）；
 *  部署进行中再次收到 push 会排队，完成后自动补跑一次（合并连续推送）。
 *
 *  环境变量（详见 deploy/webhook.env.example）：
 *    WEBHOOK_SECRET      必填，与 GitHub Webhook Secret 一致，缺失时拒绝启动
 *    WEBHOOK_PORT        监听端口，默认 9000
 *    BUBBLY_DIR          仓库目录，默认脚本所在仓库根目录
 *    WEBHOOK_BRANCH      跟踪分支，默认 main
 *    WEBHOOK_HEALTH_URL  部署后健康检查地址，默认 http://127.0.0.1:8080/health
 *    WEBHOOK_DEPLOY_CMD  覆盖默认部署命令（无 Docker 场景：宝塔/PM2/裸机 systemd）
 *                        执行时额外注入 DEPLOY_OLD_COMMIT / DEPLOY_NEW_COMMIT
 *                        环境变量，便于按变更范围条件执行
 *                        （如 lockfile 变化才 npm ci）
 * ============================================================
 */

'use strict';

const http = require('node:http');
const { URL } = require('node:url');
const crypto = require('node:crypto');
const path = require('node:path');
const { execFile, exec } = require('node:child_process');

// ============================================================
// 常量
// ============================================================
// 脚本位于 <仓库根>/scripts/ 下，据此推导默认仓库目录
const REPO_ROOT = path.resolve(__dirname, '..');
// GitHub webhook payload 体积上限为 25MB，超限直接拒绝
const MAX_BODY_BYTES = 25 * 1024 * 1024;

// ============================================================
// 工具函数
// ============================================================
function log(message) {
  console.log(`[${new Date().toISOString()}] [webhook] ${message}`);
}

/** 统一 JSON 响应 */
function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

/** 读取请求体（Buffer），超过 maxBytes 立即中断连接 */
function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        const err = new Error('payload too large');
        err.code = 'PAYLOAD_TOO_LARGE';
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ============================================================
// 配置
// ============================================================
function loadConfig(env = process.env) {
  return {
    port: Number.parseInt(env.WEBHOOK_PORT, 10) || 9000,
    secret: env.WEBHOOK_SECRET || '',
    repoDir: env.BUBBLY_DIR ? path.resolve(env.BUBBLY_DIR) : REPO_ROOT,
    branch: env.WEBHOOK_BRANCH || 'main',
    healthUrl: env.WEBHOOK_HEALTH_URL || 'http://127.0.0.1:8080/health',
    deployCmd: env.WEBHOOK_DEPLOY_CMD || ''
  };
}

// ============================================================
// 签名校验与事件过滤（纯函数，便于测试）
// ============================================================

/**
 * 校验 GitHub 的 X-Hub-Signature-256 请求头。
 * 使用 timingSafeEqual 防时序攻击；任何格式异常一律返回 false。
 * @param {string} secret 共享密钥
 * @param {Buffer|string} rawBody 原始请求体
 * @param {string|undefined} signatureHeader 请求头原文，如 "sha256=abcd..."
 * @returns {boolean}
 */
function verifySignature(secret, rawBody, signatureHeader) {
  if (!secret || typeof signatureHeader !== 'string') return false;
  const match = /^sha256=([0-9a-f]{64})$/i.exec(signatureHeader.trim());
  if (!match) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(match[1].toLowerCase(), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * 依据 GitHub 事件头与 payload 判定处理动作。
 * @param {string} event X-GitHub-Event 请求头
 * @param {object|null} payload 已解析的 JSON body
 * @param {string} watchBranch 跟踪分支名
 * @returns {'deploy'|'ping'|'ignore'}
 */
function resolveAction(event, payload, watchBranch) {
  if (event === 'ping') return 'ping';
  if (event !== 'push') return 'ignore';
  if (!payload || typeof payload !== 'object') return 'ignore';
  if (payload.deleted === true) return 'ignore'; // 分支被删除，非部署事件
  if (payload.ref !== `refs/heads/${watchBranch}`) return 'ignore';
  return 'deploy';
}

// ============================================================
// 命令执行与健康检查
// ============================================================

/** 执行单条命令，成功返回 stdout（已 trim），失败抛出含 stderr 的错误 */
function runCommand(file, args, options = {}) {
  const { cwd, timeoutMs = 120000 } = options;
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { cwd, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout, stderr) => {
        if (err) {
          err.message = `\`${file} ${args.join(' ')}\` 失败: ${err.message}${
            stderr ? `\n${String(stderr).trim()}` : ''
          }`;
          reject(err);
          return;
        }
        resolve(String(stdout).trim());
      }
    );
  });
}

/** 经 shell 执行自定义部署命令（仅在配置了 WEBHOOK_DEPLOY_CMD 时使用） */
function runShellCommand(command, options = {}) {
  const { cwd, timeoutMs = 600000, env } = options;
  return new Promise((resolve, reject) => {
    exec(
      command,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        encoding: 'utf8',
        env: env || process.env
      },
      (err, stdout, stderr) => {
        if (err) {
          err.message = `\`${command}\` 失败: ${err.message}${
            stderr ? `\n${String(stderr).trim()}` : ''
          }`;
          reject(err);
          return;
        }
        resolve(String(stdout).trim());
      }
    );
  });
}

/**
 * 单次健康检查：GET 目标 URL，2xx 视为存活。
 * 永不抛错，网络异常/超时一律返回 false。
 */
function checkHealth(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume(); // 释放响应体
      resolve(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

/** 间隔轮询健康检查，直到通过或达到最大次数 */
async function pollHealth(url, checkHealthFn, { intervalMs = 2000, maxAttempts = 30 } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (await checkHealthFn(url, 5000)) return true;
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  return false;
}

// ============================================================
// 部署器
// ============================================================

/**
 * 创建部署函数：同步远端代码 → 重建并重启服务 → 健康检查。
 * 命令执行器可注入（deps），便于单元测试。
 * @returns {Promise<{updated: boolean, commit: string, healthy?: boolean}>}
 */
function createDeployer(config, deps = {}) {
  const run = deps.run || runCommand;
  const runShell = deps.runShell || runShellCommand;
  const check = deps.checkHealth || checkHealth;
  const poll = deps.pollHealth || pollHealth;

  return async function deploy() {
    const gitOpts = { cwd: config.repoDir, timeoutMs: 120000 };

    log(`开始部署: git fetch origin ${config.branch}`);
    await run('git', ['fetch', 'origin', config.branch, '--prune'], gitOpts);
    const localHead = await run('git', ['rev-parse', 'HEAD'], gitOpts);
    const remoteHead = await run('git', ['rev-parse', `origin/${config.branch}`], gitOpts);

    if (localHead === remoteHead) {
      log(`已是最新 (${localHead.slice(0, 7)})，跳过重建`);
      return { updated: false, commit: localHead };
    }

    log(`同步代码: ${localHead.slice(0, 7)} → ${remoteHead.slice(0, 7)} (reset --hard)`);
    await run('git', ['reset', '--hard', remoteHead], gitOpts);

    if (config.deployCmd) {
      log(`执行自定义部署命令: ${config.deployCmd}`);
      // 注入新旧提交号，便于命令内按变更范围条件执行（如 lockfile 变化才 npm ci）
      const deployEnv = {
        ...process.env,
        DEPLOY_OLD_COMMIT: localHead,
        DEPLOY_NEW_COMMIT: remoteHead
      };
      await runShell(config.deployCmd, {
        cwd: config.repoDir,
        timeoutMs: 600000,
        env: deployEnv
      });
    } else {
      log('重建并重启容器: docker compose up -d --build');
      await run('docker', ['compose', 'up', '-d', '--build'], {
        cwd: config.repoDir,
        timeoutMs: 600000
      });
    }

    log(`等待服务就绪: ${config.healthUrl}`);
    const healthy = await poll(config.healthUrl, check);
    if (healthy) {
      log('健康检查通过，新版本已就绪');
    } else {
      log(`警告: ${config.healthUrl} 在 60 秒内未通过健康检查，请人工确认服务状态`);
    }
    return { updated: true, commit: remoteHead, healthy };
  };
}

// ============================================================
// HTTP 服务
// ============================================================

/**
 * 创建监听器。
 * deps.deploy 可注入自定义部署函数（测试用）；其余依赖透传给 createDeployer。
 * @returns {{server: http.Server, state: object, runDeploy: Function, waitForIdle: Function}}
 */
function createServer(config, deps = {}) {
  const deploy = deps.deploy || createDeployer(config, deps);
  const state = {
    deploying: false, // 当前是否有部署在执行
    pending: false,   // 部署期间收到新 push，结束后补跑
    lastDeploy: null  // 最近一次部署结果 { at, ok, ... }
  };

  /** 执行一次部署；正在部署时仅标记 pending（合并连续 push） */
  async function runDeploy() {
    if (state.deploying) {
      state.pending = true;
      return;
    }
    state.deploying = true;
    const startedAt = new Date().toISOString();
    try {
      const result = await deploy();
      state.lastDeploy = { at: startedAt, ok: true, ...result };
      log(`部署完成: ${JSON.stringify(result)}`);
    } catch (err) {
      state.lastDeploy = { at: startedAt, ok: false, error: err.message };
      log(`部署失败: ${err.message}`);
    } finally {
      state.deploying = false;
    }
    if (state.pending) {
      state.pending = false;
      log('部署期间有新的 push，自动补跑一次部署');
      runDeploy(); // 异步补跑，不 await
    }
  }

  /** 等待所有部署（含补跑）结束，超时返回 false */
  async function waitForIdle(timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while ((state.deploying || state.pending) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return !state.deploying && !state.pending;
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');

    // 监听器自身健康检查（供 systemd/拨测使用）
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        deploying: state.deploying,
        pending: state.pending,
        lastDeploy: state.lastDeploy
      });
      return;
    }

    if (req.method !== 'POST' || url.pathname !== '/webhook') {
      sendJson(res, 404, { ok: false, error: 'not found' });
      return;
    }

    readBody(req, MAX_BODY_BYTES)
      .then((body) => {
        if (!verifySignature(config.secret, body, req.headers['x-hub-signature-256'])) {
          log('拒绝请求: 签名校验失败');
          sendJson(res, 401, { ok: false, error: 'invalid signature' });
          return;
        }

        let payload;
        try {
          payload = JSON.parse(body.toString('utf8'));
        } catch {
          sendJson(res, 400, { ok: false, error: 'invalid json' });
          return;
        }

        const event = req.headers['x-github-event'] || '';
        const action = resolveAction(event, payload, config.branch);

        if (action === 'ping') {
          log('收到 GitHub ping，Webhook 连接正常');
          sendJson(res, 200, { ok: true, action: 'ping' });
          return;
        }

        if (action !== 'deploy') {
          log(`忽略事件: ${event} ${payload && payload.ref ? payload.ref : ''}`);
          sendJson(res, 200, { ok: true, action: 'ignored' });
          return;
        }

        const head = payload.head_commit && payload.head_commit.id
          ? payload.head_commit.id.slice(0, 7)
          : '???????';
        const queued = state.deploying || state.pending;
        log(`收到 ${config.branch} push (${head})，${queued ? '已排队' : '开始部署'}`);
        runDeploy();
        sendJson(res, 202, {
          ok: true,
          action: 'deploy',
          status: queued ? 'queued' : 'started'
        });
      })
      .catch((err) => {
        log(`处理请求失败: ${err.message}`);
        const status = err.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
        sendJson(res, status, { ok: false, error: err.message });
      });
  });

  return { server, state, runDeploy, waitForIdle };
}

// ============================================================
// 入口
// ============================================================
if (require.main === module) {
  const config = loadConfig();
  if (!config.secret) {
    console.error('[webhook] 缺少 WEBHOOK_SECRET 环境变量，拒绝启动（防伪造部署）。');
    console.error('[webhook] 生成密钥: openssl rand -hex 32');
    console.error('[webhook] 配置方式见 deploy/webhook.env.example');
    process.exit(1);
  }

  const { server } = createServer(config);
  server.listen(config.port, () => {
    log(`监听器已启动: http://0.0.0.0:${config.port}/webhook`);
    log(`跟踪分支: ${config.branch}，仓库目录: ${config.repoDir}`);
  });

  const shutdown = () => {
    log('收到退出信号，正在关闭...');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref(); // 兜底强制退出
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = {
  loadConfig,
  verifySignature,
  resolveAction,
  runCommand,
  runShellCommand,
  checkHealth,
  pollHealth,
  createDeployer,
  createServer
};
