/**
 * ============================================================
 *  Bubbly - 服务器通信测试
 * ============================================================
 */

const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('ws').WebSocket;

const server = spawn('node', [path.join(__dirname, 'server.js')], {
  stdio: ['ignore', 'ignore', 'ignore']
});

const results = { passed: 0, failed: 0, errors: [] };

function pass(name) {
  results.passed++;
  console.log(`  ✅ ${name}`);
}

function fail(name, reason) {
  results.failed++;
  results.errors.push({ test: name, reason });
  console.log(`  ❌ ${name} — ${reason}`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ============================================================
// 创建测试客户端（Promise 等待连接建立）
// ============================================================
function makeClient() {
  const ws = new WebSocket('ws://localhost:8080');
  const messages = [];

  // 返回一个 Promise，连接建立后 resolve
  const ready = new Promise((resolve, reject) => {
    ws.on('open', () => resolve());
    ws.on('error', reject);
  });

  ws.on('message', (data) => {
    messages.push(JSON.parse(data.toString()));
  });

  return {
    ws,
    ready,
    messages,
    async join(room, id) {
      await this.ready;
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'join', room, id }));
      }
    },
    async send(room, id, text) {
      await this.ready;
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'message', room, id, text }));
      }
    },
    findMsg(type, matcher) {
      return messages.find(m => {
        if (m.type !== type) return false;
        if (typeof matcher === 'string') return m.text === matcher;
        if (typeof matcher === 'function') return matcher(m);
        return true;
      });
    },
    findError() {
      return messages.find(m => m.type === 'error');
    },
    close() {
      if (ws.readyState === 1) ws.close();
    }
  };
}

// ============================================================
// 主测试流程
// ============================================================
async function main() {
  console.log('\n🔬 Bubbly - 服务器通信测试\n');

  // 等待服务器就绪
  const ready = await new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const ws = new WebSocket('ws://localhost:8080');
      ws.on('open', () => { ws.close(); resolve(true); });
      ws.on('error', () => {
        if (Date.now() - start < 8000) {
          setTimeout(check, 300);
        } else {
          resolve(false);
        }
      });
    };
    check();
  });

  if (!ready) {
    fail('服务器启动', '端口 8080 未就绪');
    server.kill();
    process.exit(1);
  }
  pass('服务器在端口 8080 就绪');

  // ---------- 测试1: 加入房间 ----------
  console.log('\n▸ 测试1: 客户端加入房间');
  {
    const a = makeClient();
    await a.join('room1', 'alice');
    await sleep(400);

    if (a.findMsg('welcome')) {
      pass('客户端加入房间成功');
    } else {
      fail('客户端加入房间成功', `收到: ${JSON.stringify(a.messages)}`);
    }
    a.close();
  }

  await sleep(200);

  // ---------- 测试2: 消息 A→B ----------
  console.log('\n▸ 测试2: 消息 A → B 单向传输');
  {
    const a = makeClient();
    const b = makeClient();
    await Promise.all([a.join('room2', 'alice'), b.join('room2', 'bob')]);
    await sleep(500);

    if (a.findMsg('welcome') && b.findMsg('welcome')) {
      await a.send('room2', 'alice', '你好啊');
      await sleep(500);

      if (b.findMsg('message', '你好啊')) {
        pass('消息 A→B 传输成功');
      } else {
        fail('消息 A→B 传输成功', `B 收到: ${JSON.stringify(b.messages)}`);
      }
    } else {
      fail('消息 A→B 传输成功', `A: ${JSON.stringify(a.messages)}, B: ${JSON.stringify(b.messages)}`);
    }
    a.close();
    b.close();
  }

  await sleep(200);

  // ---------- 测试3: 消息 B→A ----------
  console.log('\n▸ 测试3: 消息 B → A 反向传输');
  {
    const a = makeClient();
    const b = makeClient();
    await Promise.all([a.join('room3', 'alice'), b.join('room3', 'bob')]);
    await sleep(500);

    if (a.findMsg('welcome') && b.findMsg('welcome')) {
      await b.send('room3', 'bob', '收到收到');
      await sleep(500);

      if (a.findMsg('message', '收到收到')) {
        pass('消息 B→A 传输成功');
      } else {
        fail('消息 B→A 传输成功', `A 收到: ${JSON.stringify(a.messages)}`);
      }
    } else {
      fail('消息 B→A 传输成功', '房间加入失败');
    }
    a.close();
    b.close();
  }

  await sleep(200);

  // ---------- 测试4: 连续多条消息 ----------
  console.log('\n▸ 测试4: 连续多条消息依次发送');
  {
    const a = makeClient();
    const b = makeClient();
    await Promise.all([a.join('room4', 'alice'), b.join('room4', 'bob')]);
    await sleep(500);

    if (a.findMsg('welcome') && b.findMsg('welcome')) {
      const texts = ['第1条', '第2条', '第3条', '第4条', '第5条'];
      for (const t of texts) {
        await a.send('room4', 'alice', t);
        await sleep(100);
      }
      await sleep(600);

      const received = b.messages
        .filter(m => m.type === 'message')
        .map(m => m.text);

      if (received.length === 5 && received.every((t, i) => t === texts[i])) {
        pass(`5条消息按序到达（${received.join(' | ')}）`);
      } else {
        fail('5条消息按序到达', `期望 ${texts.join(',')}, 实际 ${received.join(',')}`);
      }
    } else {
      fail('连续多条消息', '房间加入失败');
    }
    a.close();
    b.close();
  }

  await sleep(200);

  // ---------- 测试5: 房间满员拒绝 ----------
  console.log('\n▸ 测试5: 房间满员（2人上限）拒绝');
  {
    const a = makeClient();
    const b = makeClient();
    const c = makeClient();
    await Promise.all([a.join('full', 'u1'), b.join('full', 'u2')]);
    await sleep(500);

    if (a.findMsg('welcome') && b.findMsg('welcome')) {
      await c.join('full', 'u3');
      await sleep(500);

      const err = c.findError();
      if (err && err.msg.includes('已满')) {
        pass('第3人加入被拒绝');
      } else {
        fail('第3人加入被拒绝', `收到: ${JSON.stringify(c.messages)}`);
      }
    } else {
      fail('第3人加入被拒绝', '前两人加入失败');
    }
    a.close();
    b.close();
    c.close();
  }

  await sleep(200);

  // ---------- 测试6: 断开通知 ----------
  console.log('\n▸ 测试6: 客户端断开连接通知对方');
  {
    const a = makeClient();
    const b = makeClient();
    await Promise.all([a.join('dc', 'alice'), b.join('dc', 'bob')]);
    await sleep(500);

    if (a.findMsg('welcome') && b.findMsg('welcome')) {
      b.close();
      await sleep(800);

      if (a.findMsg('peer-disconnected', m => m.id === 'bob')) {
        pass('断开通知送达对方');
      } else {
        fail('断开通知送达对方', `A 收到: ${JSON.stringify(a.messages)}`);
      }
    } else {
      fail('断开通知', '房间加入失败');
    }
    a.close();
  }

  await sleep(200);

  // ---------- 测试7: 空消息拒绝 ----------
  console.log('\n▸ 测试7: 空消息被服务器拒绝');
  {
    const a = makeClient();
    await a.join('empty', 'alice');
    await sleep(500);

    if (a.findMsg('welcome')) {
      await a.send('empty', 'alice', '   ');
      await sleep(500);

      const err = a.findError();
      if (err && err.msg.includes('不能为空')) {
        pass('空消息被拒绝');
      } else {
        fail('空消息被拒绝', `收到: ${JSON.stringify(a.messages)}`);
      }
    } else {
      fail('空消息被拒绝', '加入失败');
    }
    a.close();
  }

  // ---------- 测试8: 新成员加入通知 ----------
  console.log('\n▸ 测试8: 新成员加入通知对方');
  {
    const a = makeClient();
    const b = makeClient();
    await a.join('notify', 'alice');
    await sleep(500);
    await b.join('notify', 'bob');
    await sleep(500);

    if (a.findMsg('peer-joined', m => m.id === 'bob')) {
      pass('新成员加入通知送达');
    } else {
      fail('新成员加入通知送达', `A 收到: ${JSON.stringify(a.messages)}`);
    }
    a.close();
    b.close();
  }

  // ============================================================
  // 汇总
  // ============================================================
  server.kill('SIGINT');
  await sleep(300);

  console.log('\n' + '═'.repeat(50));
  console.log(`  📊 测试结果`);
  console.log('═'.repeat(50));
  console.log(`  通过: ${results.passed}`);
  console.log(`  失败: ${results.failed}`);
  console.log(`  总计: ${results.passed + results.failed}`);
  console.log('═'.repeat(50));

  if (results.errors.length > 0) {
    console.log('\n❌ 失败详情:');
    results.errors.forEach(e => console.log(`  • ${e.test}: ${e.reason}`));
  }

  console.log(results.failed === 0 ? '\n🎉 全部测试通过！' : `\n⚠️  ${results.failed} 项失败\n`);
  process.exit(results.failed === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('测试异常:', err);
  server.kill();
  process.exit(1);
});
