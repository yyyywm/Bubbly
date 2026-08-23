/**
 * ============================================================
 *  Bubbly - WebSocket 信令服务器
 * ============================================================
 *  启动方式: node server.js
 *  默认监听端口: 8080
 *
 *  通信协议（JSON格式）:
 *    客户端 → 服务器:
 *      {"type": "join", "room": "房间号", "id": "用户ID"}
 *      {"type": "message", "room": "房间号", "id": "用户ID", "text": "消息内容"}
 *      {"type": "dnd-status", "room": "房间号", "id": "用户ID", "dnd": true/false}
 *      {"type": "leave", "room": "房间号", "id": "用户ID"}
 *
 *    服务器 → 客户端:
 *      {"type": "welcome", "room": "房间号", "id": "用户ID"}
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

// ============================================================
// 常量
// ============================================================
const PORT = 8080;
const MAX_ROOM_SIZE = 2;
const MAX_PAYLOAD = 64 * 1024;
const HEARTBEAT_INTERVAL = 30000;
const WS_READY_OPEN = 1;

// ============================================================
// 房间管理: 每个房间最多2人
// rooms: Map<room号, [{ws, id}]>
// ============================================================
const rooms = new Map();

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
  let currentRoom = null;
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

      // ---------- 加入房间 ----------
      case 'join':
        handleJoin(ws, msg, (room, id) => {
          currentRoom = room;
          userId = id;
        });
        break;

      // ---------- 发送消息 ----------
      case 'message':
        handleMessage(ws, msg, currentRoom, userId);
        break;

      // ---------- 勿扰状态同步 ----------
      case 'dnd-status':
        handleDndStatus(ws, msg, currentRoom, userId);
        break;

      // ---------- 离开房间 ----------
      case 'leave':
        handleLeave(ws, msg, currentRoom, userId, () => {
          notifiedDisconnect = true; // 已主动通知对方，close 事件不再重复发送
          currentRoom = null;
          userId = null;
        });
        break;

      default:
        ws.send(JSON.stringify({ type: 'error', msg: `未知的消息类型: ${msg.type}` }));
    }
  });

  // 客户端断开连接时的清理
  ws.on('close', () => {
    if (currentRoom && userId && !notifiedDisconnect) {
      notifiedDisconnect = true;
      console.log(`[断开] 用户 ${userId} 离开房间 ${currentRoom}`);
      leaveRoom(currentRoom, userId, ws);

      // 通知房间内其他用户（仅发送一次）
      const members = rooms.get(currentRoom);
      if (members) {
        members.forEach(member => {
          if (member.id !== userId) {
            member.ws.send(JSON.stringify({
              type: 'peer-disconnected',
              id: userId
            }));
          }
        });
      }
    }
  });

  // 处理WebSocket错误
  ws.on('error', (err) => {
    console.error(`[错误] WebSocket错误:`, err.message);
  });
});

// ============================================================
// 业务逻辑函数
// ============================================================

/**
 * 处理加入房间请求
 */
function handleJoin(ws, msg, onJoined) {
  const room = msg.room;
  const id = msg.id;

  // 参数校验
  if (!room || !id) {
    ws.send(JSON.stringify({ type: 'error', msg: '缺少房间号或用户ID' }));
    return;
  }

  // 检查是否已在房间中（防止重复加入）
  const members = rooms.get(room);
  if (members) {
    for (const member of members) {
      if (member.id === id) {
        ws.send(JSON.stringify({ type: 'welcome', room, id }));
        onJoined(room, id);
        return;
      }
      // 检查是否是同一个WebSocket连接换了ID
      if (member.ws === ws) {
        ws.send(JSON.stringify({ type: 'error', msg: '当前连接已加入房间' }));
        return;
      }
    }
  }

  // 房间人数上限为 MAX_ROOM_SIZE
  if (members && members.length >= MAX_ROOM_SIZE) {
    ws.send(JSON.stringify({
      type: 'error',
      msg: `房间已满（最多 ${MAX_ROOM_SIZE} 人），请换一个房间号`
    }));
    return;
  }

  // 加入房间
  if (!members) {
    rooms.set(room, []);
  }
  rooms.get(room).push({ ws, id });

  console.log(`[加入] 用户 ${id} 加入房间 ${room}（当前人数: ${rooms.get(room).length}）`);

  // 通知房间内其他用户有新成员加入
  const updatedMembers = rooms.get(room);
  updatedMembers.forEach(member => {
    if (member.id !== id) {
      member.ws.send(JSON.stringify({
        type: 'peer-joined',
        id: id
      }));
    }
  });

  // 回复当前用户加入成功
  ws.send(JSON.stringify({ type: 'welcome', room, id }));
  onJoined(room, id);
}

/**
 * 处理消息发送
 */
function handleMessage(ws, msg, room, userId) {
  if (!room || !userId) {
    ws.send(JSON.stringify({ type: 'error', msg: '请先加入房间' }));
    return;
  }

  const text = msg.text;
  if (!text || !text.trim()) {
    ws.send(JSON.stringify({ type: 'error', msg: '消息内容不能为空' }));
    return;
  }

  console.log(`[消息] [${room}] ${userId}: ${text.trim()}`);

  // 广播消息给房间内其他用户（不发送给消息发送者自己）
  const members = rooms.get(room);
  if (!members) {
    ws.send(JSON.stringify({ type: 'error', msg: '房间不存在' }));
    return;
  }

  const msgToSend = JSON.stringify({
    type: 'message',
    from: userId,
    text: text.trim()
  });

  let delivered = false;
  for (const member of members) {
    if (member.id !== userId) {
      if (member.ws.readyState === WS_READY_OPEN) {
        member.ws.send(msgToSend);
        delivered = true;
      }
    }
  }

  if (!delivered) {
    ws.send(JSON.stringify({
      type: 'error',
      msg: '对方不在线，消息未送达'
    }));
  }
}

/**
 * 处理勿扰状态同步
 * 收到后将当前用户的 DND 状态广播给房间内其他用户
 */
function handleDndStatus(ws, msg, room, userId) {
  if (!room || !userId) {
    ws.send(JSON.stringify({ type: 'error', msg: '请先加入房间' }));
    return;
  }

  const dnd = msg.dnd === true;

  console.log(`[勿扰] [${room}] ${userId} 设置勿扰=${dnd}`);

  const members = rooms.get(room);
  if (!members) return;

  const dndMsg = JSON.stringify({
    type: 'dnd-status',
    from: userId,
    dnd
  });

  for (const member of members) {
    if (member.id !== userId && member.ws.readyState === WS_READY_OPEN) {
      member.ws.send(dndMsg);
    }
  }
}

/**
 * 处理离开房间
 */
function handleLeave(ws, msg, room, userId, onLeft) {
  if (room && userId) {
    console.log(`[离开] 用户 ${userId} 主动离开房间 ${room}`);
    leaveRoom(room, userId, ws);

    // 通知对方（主动离开时发送，close 事件不再重复发送）
    const members = rooms.get(room);
    if (members) {
      members.forEach(member => {
        if (member.id !== userId && member.ws.readyState === WS_READY_OPEN) {
          member.ws.send(JSON.stringify({
            type: 'peer-disconnected',
            id: userId
          }));
        }
      });
    }
  }
  onLeft();
}

/**
 * 从房间中移除用户
 */
function leaveRoom(room, userId, ws) {
  const members = rooms.get(room);
  if (!members) return;

  const index = members.findIndex(m => m.id === userId);
  if (index !== -1) {
    members.splice(index, 1);
  }

  // 房间为空时清理
  if (members.length === 0) {
    rooms.delete(room);
  }
}

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
  console.log('  客户端连接后，双方输入相同的房间号即可配对\n');
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
