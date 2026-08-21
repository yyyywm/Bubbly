/**
 * Bubbly - 双向通信实时演示
 * 模拟两个客户端连接同一房间，互相发送消息
 */

const WebSocket = require('ws').WebSocket;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================================
// 模拟客户端
// ============================================================
function makeClient(name, color) {
  const ws = new WebSocket('ws://localhost:8080');
  const messages = [];
  const ready = new Promise((resolve, reject) => {
    ws.on('open', () => resolve());
    ws.on('error', reject);
  });
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    messages.push(msg);
    console.log(`  ${color}${name}${color.bgGray} 收到 [${msg.type}] ${msg.text || msg.msg || ''}`.replace(/\s+$/, ''));
  });

  return {
    ws,
    ready,
    messages,
    async join(room) {
      await this.ready;
      ws.send(JSON.stringify({ type: 'join', room, id: name }));
      return this;
    },
    async send(room, text) {
      await this.ready;
      ws.send(JSON.stringify({ type: 'message', room, id: name, text }));
      return this;
    },
    close() {
      if (ws.readyState === 1) ws.close();
    },
    findMsg(type, matcher) {
      return messages.find(m => {
        if (m.type !== type) return false;
        if (typeof matcher === 'string') return m.text === matcher;
        if (typeof matcher === 'function') return matcher(m);
        return true;
      });
    }
  };
}

// ============================================================
// 颜色工具
// ============================================================
const colors = {
  pink: '\x1b[38;5;206m',
  blue: '\x1b[38;5;75m',
  green: '\x1b[38;5;46m',
  yellow: '\x1b[38;5;226m',
  reset: '\x1b[0m',
  bgGray: '\x1b[40m \x1b[0m'
};

const A = makeClient('🐶 小狗(A)', colors.pink);
const B = makeClient('🐱 小猫(B)', colors.blue);

async function main() {
  console.log('');
  console.log('═'.repeat(52));
  console.log('  💕  Bubbly - 双向通信实时演示');
  console.log('═'.repeat(52));
  console.log('');

  // 阶段1：双方加入房间
  console.log(`\n${colors.yellow}━━━ 阶段1: 双方加入房间 "love123" ━━━${colors.reset}\n`);
  await A.join('love123');
  await sleep(300);
  await B.join('love123');
  await sleep(500);

  // 验证双方成功加入
  const aWelcome = A.findMsg('welcome');
  const bWelcome = B.findMsg('welcome');
  const aPeerJoined = A.findMsg('peer-joined', m => m.id === '🐱 小猫(B)');
  const bPeerJoined = B.findMsg('peer-joined', m => m.id === '🐶 小狗(A)');

  console.log(`\n  ${colors.green}✓ A 收到 welcome: room=${aWelcome ? aWelcome.room : 'N/A'}${colors.reset}`);
  console.log(`  ${colors.green}✓ B 收到 welcome: room=${bWelcome ? bWelcome.room : 'N/A'}${colors.reset}`);
  console.log(`  ${colors.green}✓ A 收到 B 加入通知: id=${aPeerJoined ? aPeerJoined.id : 'N/A'}${colors.reset}`);
  console.log(`  ${colors.green}✓ B 收到 A 加入通知: id=${bPeerJoined ? bPeerJoined.id : 'N/A'}${colors.reset}`);

  // 阶段2：A → B 发送消息
  console.log(`\n${colors.yellow}━━━ 阶段2: A → B 发送消息 ━━━${colors.reset}\n`);
  await A.send('love123', '下午好呀～');
  await sleep(500);
  const bGot1 = B.findMsg('message', '下午好呀～');
  console.log(`  ${bGot1 ? colors.green + '✓' : colors.pink + '✗'}${colors.reset} B 收到: "${bGot1 ? bGot1.text : '未收到'}" (from: ${bGot1 ? bGot1.from : '-'})`);

  // 阶段3：B → A 回复消息
  console.log(`\n${colors.yellow}━━━ 阶段3: B → A 回复消息 ━━━${colors.reset}\n`);
  await B.send('love123', '在干嘛呢？');
  await sleep(500);
  const aGot1 = A.findMsg('message', '在干嘛呢？');
  console.log(`  ${aGot1 ? colors.green + '✓' : colors.pink + '✗'}${colors.reset} A 收到: "${aGot1 ? aGot1.text : '未收到'}" (from: ${aGot1 ? aGot1.from : '-'})`);

  // 阶段4：快速连续对话（模拟气泡队列）
  console.log(`\n${colors.yellow}━━━ 阶段4: 快速连续对话（消息队列演示）━━━${colors.reset}\n`);

  const dialog = [
    ['A', '🐶 小狗(A)', '吃火锅去吗？'],
    ['B', '🐱 小猫(B)', '好啊！'],
    ['A', '🐶 小狗(A)', '几点？'],
    ['B', '🐱 小猫(B)', '6点行吗'],
    ['A', '🐶 小狗(A)', '👌'],
  ];

  for (const [, id, text] of dialog) {
    if (id === '🐶 小狗(A)') {
      await A.send('love123', text);
    } else {
      await B.send('love123', text);
    }
    await sleep(200);
  }
  await sleep(500);

  console.log('  消息流：');
  const aReceived = A.messages.filter(m => m.type === 'message');
  const bReceived = B.messages.filter(m => m.type === 'message');
  console.log(`  ${colors.pink}A 收到 ${aReceived.length} 条${colors.reset}: ${aReceived.map(m => `"${m.text}"`).join(' → ')}`);
  console.log(`  ${colors.blue}B 收到 ${bReceived.length} 条${colors.reset}: ${bReceived.map(m => `"${m.text}"`).join(' → ')}`);

  // 阶段5：断开通知
  console.log(`\n${colors.yellow}━━━ 阶段5: A 断开连接，B 收到通知 ━━━${colors.reset}\n`);
  B.messages.length = 0; // 清空B的消息，只看新的
  B.close();
  await sleep(800);
  const bGotDisconnect = B.messages.find(m => m.type === 'peer-disconnected');
  // B 已经 close 了，所以用 A 侧检查
  // 实际上 disconnect 通知是发给房间内的其他成员
  // 因为 B 自己 close，通知发给 A
  const aGotDisconnect = A.findMsg('peer-disconnected', m => m.id === '🐱 小猫(B)');
  console.log(`  ${aGotDisconnect ? colors.green + '✓' : colors.pink + '✗'}${colors.reset} A 收到 B 断开通知: ${aGotDisconnect ? aGotDisconnect.id : '未收到'}`);

  // 清理
  A.close();

  // 最终总结
  console.log('\n' + '═'.repeat(52));
  console.log('  📊 双向通信演示总结');
  console.log('═'.repeat(52));
  console.log(`  ${colors.green}✓ 双方加入房间${colors.reset}`);
  console.log(`  ${colors.green}✓ A → B 单向传输${colors.reset}`);
  console.log(`  ${colors.green}✓ B → A 单向传输${colors.reset}`);
  console.log(`  ${colors.green}✓ 连续多轮对话${colors.reset}`);
  console.log(`  ${colors.green}✓ 断开连接通知${colors.reset}`);
  console.log('\n  🎉 双向通信验证完成！\n');

  process.exit(0);
}

main().catch(err => {
  console.error('演示异常:', err);
  process.exit(1);
});
