/**
 * ============================================================
 *  Bubbly - 信令服务器 · 业务逻辑处理
 * ============================================================
 *  join / message / dnd-status / leave 的消息处理函数。
 *  配对状态（clients）与相关常量集中在此模块并导出，
 *  index.js 通过解构复用；函数体逐字迁移自原根目录 server.js
 *  （见 git 历史，删除前最后一个版本为 commit d8b217b）。
 * ============================================================
 */

// ============================================================
// 常量
// ============================================================
const MAX_CLIENTS = 2;
const WS_READY_OPEN = 1;

// ============================================================
// 房间管理: 全局单房间，最多2人
// clients: [{ws, id}]
// ============================================================
let clients = [];

// ============================================================
// 业务逻辑函数
// ============================================================

/**
 * 处理加入请求
 */
function handleJoin(ws, msg, onJoined) {
  const id = msg.id;

  // 参数校验
  if (!id) {
    ws.send(JSON.stringify({ type: 'error', msg: '缺少用户ID' }));
    return;
  }

  // 检查是否已在连接中（防止重复加入）
  for (const client of clients) {
    if (client.id === id) {
      ws.send(JSON.stringify({ type: 'welcome', id }));
      onJoined(id);
      return;
    }
    // 检查是否是同一个WebSocket连接换了ID
    if (client.ws === ws) {
      ws.send(JSON.stringify({ type: 'error', msg: '当前连接已加入' }));
      return;
    }
  }

  // 全局人数上限为 MAX_CLIENTS
  if (clients.length >= MAX_CLIENTS) {
    ws.send(JSON.stringify({
      type: 'error',
      msg: `连接已满（最多 ${MAX_CLIENTS} 人），请稍后再试`
    }));
    return;
  }

  // 加入
  clients.push({ ws, id });

  console.log(`[加入] 用户 ${id} 已连接（当前人数: ${clients.length}）`);

  // 通知对方有新成员加入
  clients.forEach(client => {
    if (client.id !== id) {
      client.ws.send(JSON.stringify({
        type: 'peer-joined',
        id: id
      }));
    }
  });

  // 回复当前用户加入成功
  ws.send(JSON.stringify({ type: 'welcome', id }));
  onJoined(id);
}

/**
 * 处理消息发送
 */
function handleMessage(ws, msg, userId) {
  if (!userId) {
    ws.send(JSON.stringify({ type: 'error', msg: '请先连接' }));
    return;
  }

  const text = msg.text;
  if (!text || !text.trim()) {
    ws.send(JSON.stringify({ type: 'error', msg: '消息内容不能为空' }));
    return;
  }

  console.log(`[消息] ${userId}: ${text.trim()}`);

  const msgToSend = JSON.stringify({
    type: 'message',
    from: userId,
    text: text.trim()
  });

  let delivered = false;
  for (const client of clients) {
    if (client.id !== userId) {
      if (client.ws.readyState === WS_READY_OPEN) {
        client.ws.send(msgToSend);
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
 * 收到后将当前用户的 DND 状态广播给对方
 */
function handleDndStatus(ws, msg, userId) {
  if (!userId) {
    ws.send(JSON.stringify({ type: 'error', msg: '请先连接' }));
    return;
  }

  const dnd = msg.dnd === true;

  console.log(`[勿扰] ${userId} 设置勿扰=${dnd}`);

  const dndMsg = JSON.stringify({
    type: 'dnd-status',
    from: userId,
    dnd
  });

  for (const client of clients) {
    if (client.id !== userId && client.ws.readyState === WS_READY_OPEN) {
      client.ws.send(dndMsg);
    }
  }
}

/**
 * 处理离开
 */
function handleLeave(ws, msg, userId, onLeft) {
  if (userId) {
    console.log(`[离开] 用户 ${userId} 主动断开`);
    leaveRoom(userId, ws);

    // 通知对方（主动离开时发送，close 事件不再重复发送）
    clients.forEach(client => {
      if (client.id !== userId && client.ws.readyState === WS_READY_OPEN) {
        client.ws.send(JSON.stringify({
          type: 'peer-disconnected',
          id: userId
        }));
      }
    });
  }
  onLeft();
}

/**
 * 从连接列表中移除用户
 */
function leaveRoom(userId, ws) {
  const index = clients.findIndex(c => c.id === userId);
  if (index !== -1) {
    clients.splice(index, 1);
  }
}

module.exports = {
  clients,
  handleJoin,
  handleMessage,
  handleDndStatus,
  handleLeave,
  leaveRoom
};
