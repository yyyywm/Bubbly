/**
 * ============================================================
 *  Bubbly - 信令服务器 · 端到端集成测试
 * ============================================================
 *  运行: npm test
 *  以子进程启动真实服务器（随机端口），通过真实 WebSocket
 *  客户端验证：配对、消息投递、勿扰广播、房满拒绝、
 *  主动离开、健康检查端点等完整链路。
 *
 *  服务器是全局单房间（最多 2 人），因此每个用例结束后
 *  强制清理全部连接并等待房间清空，保证用例间相互隔离。
 * ============================================================
 */

const { test, before, after, afterEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { once } = require('node:events');
const WebSocket = require('ws');

// 随机高位端口，避免与其他服务冲突
const PORT = 20000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
let server;

/** 本用例建立的所有连接，afterEach 统一回收 */
let sockets = [];

/**
 * 建立真实 WebSocket 客户端并完成 join 握手。
 * 返回 { ws, waitFor, send }；waitFor 可等待满足条件的下一条推送。
 */
function connect(id) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    sockets.push(ws);
    const waiters = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      const idx = waiters.findIndex(w => w.match(msg));
      if (idx !== -1) {
        waiters.splice(idx, 1)[0].resolve(msg);
      }
    });
    ws.on('error', reject);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'join', id }));
      resolve({ ws, waitFor, send: (m) => ws.send(JSON.stringify(m)) });
    });

    /** 等待满足条件的下一条消息（超时 5s） */
    function waitFor(match) {
      return new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error(`等待消息超时: ${id}`)), 5000);
        waiters.push({
          match,
          resolve: (msg) => { clearTimeout(timer); res(msg); }
        });
      });
    }
  });
}

/** 轮询 /health 直到服务器就绪 */
async function waitHealthy(timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return await res.json();
    } catch { /* 服务器尚未就绪，继续重试 */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('服务器未在时限内就绪');
}

/** 轮询 /health 直到房间人数达到期望值 */
async function waitClients(expected, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const body = await (await fetch(`${BASE}/health`)).json();
      if (body.clients === expected) return body;
    } catch { /* 忽略瞬时错误 */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`房间人数未达到 ${expected}`);
}

describe('服务器端到端集成', () => {
  before(async () => {
    server = spawn(process.execPath, [path.join(__dirname, '..', '..', 'src', 'server', 'index.js')], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'ignore', 'ignore']
    });
    server.on('error', (err) => { throw err; });
    await waitHealthy();
  });

  afterEach(async () => {
    // 强制断开本用例建立的所有连接，并等待服务器清空房间，
    // 保证全局单房间在用例之间完全隔离
    sockets.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.terminate();
      }
    });
    sockets = [];
    await waitClients(0);
  });

  after(() => {
    if (server && server.exitCode === null) {
      server.kill();
    }
  });

  test('/health 返回健康信息', async () => {
    const res = await fetch(`${BASE}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(typeof body.version, 'string');
    assert.equal(typeof body.uptime, 'number');
    assert.equal(typeof body.clients, 'number');
  });

  test('双方配对：后加入方触发对方 peer-joined', async () => {
    const a = await connect('alice');
    const peerJoined = a.waitFor(m => m.type === 'peer-joined');
    const b = await connect('bob');

    assert.equal((await peerJoined).id, 'bob');
    await waitClients(2);
    b.ws.close();
  });

  test('消息与勿扰状态在配对双方之间传递', async () => {
    const a = await connect('alice');
    const b = await connect('bob');
    const gotMsg = b.waitFor(m => m.type === 'message');
    const gotDnd = b.waitFor(m => m.type === 'dnd-status');

    a.send({ type: 'message', id: 'alice', text: '  想你了～  ' });
    a.send({ type: 'dnd-status', id: 'alice', dnd: true });

    assert.deepEqual(await gotMsg, { type: 'message', from: 'alice', text: '想你了～' });
    assert.deepEqual(await gotDnd, { type: 'dnd-status', from: 'alice', dnd: true });
    await waitClients(2);
  });

  test('房满后第三方被拒绝', async () => {
    const a = await connect('alice');
    const b = await connect('bob');

    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    await once(ws, 'open');
    const rejected = new Promise((resolve) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'error') resolve(msg);
      });
    });
    ws.send(JSON.stringify({ type: 'join', id: 'carol' }));
    assert.match((await rejected).msg, /连接已满/);
    ws.close();
    a.ws.close();
    b.ws.close();
  });

  test('主动离开后对方收到 peer-disconnected', async () => {
    const a = await connect('alice');
    const b = await connect('bob');
    const disconnected = a.waitFor(m => m.type === 'peer-disconnected');

    b.send({ type: 'leave', id: 'bob' });
    assert.equal((await disconnected).id, 'bob');
    await waitClients(1);
  });

  test('异常断开后服务器自动清理房间', async () => {
    const a = await connect('alice');
    const b = await connect('bob');
    const disconnected = a.waitFor(m => m.type === 'peer-disconnected');

    b.ws.terminate(); // 不握手直接断开，模拟断网
    await disconnected;
    await waitClients(1);
  });

  test('非 JSON 消息返回错误但不崩溃', async () => {
    const a = await connect('alice');
    const err = a.waitFor(m => m.type === 'error');
    a.ws.send('not-a-json');
    assert.equal((await err).msg, '无效的消息格式');
    a.ws.close();
  });
});
