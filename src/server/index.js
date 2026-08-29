/**
 * ============================================================
 *  Bubbly - WebSocket 信令服务器
 * ============================================================
 *  启动方式: npm run server
 *  默认监听端口: 8080
 *
 *  通信协议（JSON格式）:
 *    客户端 → 服务器:
 *      {"type": "join", "id": "用户ID"}
 *      {"type": "message", "id": "用户ID", "text": "消息内容"}
 *      {"type": "dnd-status", "id": "用户ID", "dnd": true/false}
 *      {"type": "leave", "id": "用户ID"}
 *
 *    服务器 → 客户端:
 *      {"type": "welcome", "id": "用户ID"}
 *      {"type": "message", "from": "对方ID", "text": "消息内容"}
 *      {"type": "dnd-status", "from": "对方ID", "dnd": true/false}
 *      {"type": "error", "msg": "错误信息"}
 *      {"type": "peer-disconnected", "id": "对方ID"}
 *
 *  局域网连接: ws://<局域网IP>:8080
 *  公网连接:   ws://<公网IP或域名>:8080 (需配置端口转发)
 * ============================================================
 */

const { WebSocketServer } = require('ws');
const http = require('http');
const {
  clients,
  handleJoin,
  handleMessage,
  handleDndStatus,
  handleLeave,
  leaveRoom
} = require('./handlers');

// ============================================================
// 常量
// ============================================================
const PORT = 8080;
const MAX_PAYLOAD = 64 * 1024;
const HEARTBEAT_INTERVAL = 30000;

// 创建HTTP服务器（仅用于承载WebSocket，不提供HTTP页面）
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bubbly 服务器运行中 ✓');
});

// 创建WebSocket服务器
const wss = new WebSocketServer({ server: httpServer, maxPayload: MAX_PAYLOAD });

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach(client => {
    if (!client.isAlive) return client.terminate();
    client.isAlive = false;
    client.ping();
  });
}, HEARTBEAT_INTERVAL);

// ============================================================
// WebSocket 连接处理
// ============================================================
wss.on('connection', (ws, req) => {
  let userId = null;
  let notifiedDisconnect = false;

  console.log(`[连接] 新客户端连接: ${req.socket.remoteAddress}`);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (rawData) => {
    let msg;
    try {
      msg = JSON.parse(rawData.toString());
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', msg: '无效的消息格式' }));
      return;
    }

    // 根据消息类型分发处理
    switch (msg.type) {

      // ---------- 加入 ----------
      case 'join':
        handleJoin(ws, msg, (id) => {
          userId = id;
        });
        break;

      // ---------- 发送消息 ----------
      case 'message':
        handleMessage(ws, msg, userId);
        break;

      // ---------- 勿扰状态同步 ----------
      case 'dnd-status':
        handleDndStatus(ws, msg, userId);
        break;

      // ---------- 离开 ----------
      case 'leave':
        handleLeave(ws, msg, userId, () => {
          notifiedDisconnect = true; // 已主动通知对方，close 事件不再重复发送
          userId = null;
        });
        break;

      default:
        ws.send(JSON.stringify({ type: 'error', msg: `未知的消息类型: ${msg.type}` }));
    }
  });

  // 客户端断开连接时的清理
  ws.on('close', () => {
    if (userId && !notifiedDisconnect) {
      notifiedDisconnect = true;
      console.log(`[断开] 用户 ${userId} 断开连接`);
      leaveRoom(userId, ws);

      // 通知对方（仅发送一次）
      clients.forEach(client => {
        if (client.id !== userId) {
          client.ws.send(JSON.stringify({
            type: 'peer-disconnected',
            id: userId
          }));
        }
      });
    }
  });

  // 处理WebSocket错误
  ws.on('error', (err) => {
    console.error(`[错误] WebSocket错误:`, err.message);
  });
});

// ============================================================
// 启动服务器
// ============================================================
httpServer.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('  💕  Bubbly 服务器已启动  💕');
  console.log('='.repeat(50));
  console.log(`  端口: ${PORT}`);
  console.log(`  局域网连接地址: ws://<你的局域网IP>:${PORT}`);
  console.log(`  本机连接地址:   ws://localhost:${PORT}`);
  console.log('='.repeat(50));
  console.log('  客户端连接后即可配对聊天\n');
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n[服务器] 正在关闭...');
  clearInterval(heartbeatInterval);
  wss.clients.forEach(client => {
    client.close();
  });
  httpServer.close(() => {
    console.log('[服务器] 已关闭');
    process.exit(0);
  });
});
