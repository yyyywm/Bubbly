/**
 * ============================================================
 *  Bubbly - 信令服务器 · handlers 单元测试
 * ============================================================
 *  运行: npm test
 *  覆盖: join / message / dnd-status / leave / leaveRoom
 *  的参数校验、房间容量、消息投递与状态广播逻辑。
 * ============================================================
 */

const { test, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  clients,
  handleJoin,
  handleMessage,
  handleDndStatus,
  handleLeave,
  leaveRoom
} = require('../../src/server/handlers');

/**
 * 构造 mock WebSocket 连接。
 * send() 收到的 JSON 消息会推入返回的 sent 数组，便于断言。
 */
function mockWs(readyState = 1) {
  const sent = [];
  return {
    ws: {
      readyState,
      send: (data) => sent.push(JSON.parse(data))
    },
    sent
  };
}

/** 重置共享房间状态（handlers 导出的是同一个数组引用） */
beforeEach(() => {
  clients.splice(0, clients.length);
});

describe('handleJoin', () => {
  test('缺少用户ID时拒绝加入', () => {
    const a = mockWs();
    handleJoin(a.ws, {}, () => {
      assert.fail('不应触发 onJoined 回调');
    });
    assert.deepEqual(a.sent, [{ type: 'error', msg: '缺少用户ID' }]);
    assert.equal(clients.length, 0);
  });

  test('正常加入：回复 welcome 并触发回调', () => {
    const a = mockWs();
    let joinedId = null;
    handleJoin(a.ws, { id: 'alice' }, (id) => { joinedId = id; });
    assert.deepEqual(a.sent, [{ type: 'welcome', id: 'alice' }]);
    assert.equal(joinedId, 'alice');
    assert.equal(clients.length, 1);
  });

  test('同一ID重复加入幂等：只回复 welcome 不重复入房', () => {
    const a1 = mockWs();
    const a2 = mockWs();
    handleJoin(a1.ws, { id: 'alice' }, () => {});
    handleJoin(a2.ws, { id: 'alice' }, () => {});
    assert.deepEqual(a2.sent, [{ type: 'welcome', id: 'alice' }]);
    assert.equal(clients.length, 1, '不应重复加入');
    assert.equal(clients[0].ws, a1.ws, '保留原连接');
  });

  test('同一连接换ID加入被拒绝', () => {
    const a = mockWs();
    handleJoin(a.ws, { id: 'alice' }, () => {});
    handleJoin(a.ws, { id: 'bob' }, () => {
      assert.fail('换ID不应加入成功');
    });
    assert.deepEqual(a.sent, [
      { type: 'welcome', id: 'alice' },
      { type: 'error', msg: '当前连接已加入' }
    ]);
    assert.equal(clients.length, 1);
  });

  test('房满（2人）后新连接被拒绝', () => {
    const a = mockWs();
    const b = mockWs();
    const c = mockWs();
    handleJoin(a.ws, { id: 'alice' }, () => {});
    handleJoin(b.ws, { id: 'bob' }, () => {});
    handleJoin(c.ws, { id: 'carol' }, () => {
      assert.fail('房满不应加入成功');
    });
    assert.deepEqual(c.sent, [{
      type: 'error',
      msg: '连接已满（最多 2 人），请稍后再试'
    }]);
    assert.equal(clients.length, 2);
  });

  test('加入时通知房间内其他成员 peer-joined', () => {
    const a = mockWs();
    const b = mockWs();
    handleJoin(a.ws, { id: 'alice' }, () => {});
    handleJoin(b.ws, { id: 'bob' }, () => {});
    assert.deepEqual(a.sent, [
      { type: 'welcome', id: 'alice' },
      { type: 'peer-joined', id: 'bob' }
    ]);
  });
});

describe('handleMessage', () => {
  test('未加入时拒绝发送', () => {
    const a = mockWs();
    handleMessage(a.ws, { text: 'hi' }, null);
    assert.deepEqual(a.sent, [{ type: 'error', msg: '请先连接' }]);
  });

  test('空消息内容被拒绝', () => {
    const a = mockWs();
    const b = mockWs();
    handleJoin(a.ws, { id: 'alice' }, () => {});
    handleJoin(b.ws, { id: 'bob' }, () => {});
    for (const text of [undefined, '', '   ']) {
      handleMessage(a.ws, { text }, 'alice');
    }
    assert.equal(a.sent.filter(m => m.type === 'error').length, 3);
    assert.ok(a.sent.every(m => !m.type || m.type !== 'message'));
  });

  test('消息投递给对方并去除首尾空白', () => {
    const a = mockWs();
    const b = mockWs();
    handleJoin(a.ws, { id: 'alice' }, () => {});
    handleJoin(b.ws, { id: 'bob' }, () => {});
    b.sent.length = 0; // 清掉 join 阶段的消息
    handleMessage(a.ws, { text: '  想你了～  ' }, 'alice');
    assert.deepEqual(b.sent, [{
      type: 'message',
      from: 'alice',
      text: '想你了～'
    }]);
  });

  test('对方不在线时报错且不投递', () => {
    const a = mockWs();
    handleJoin(a.ws, { id: 'alice' }, () => {});
    handleMessage(a.ws, { text: 'hello?' }, 'alice');
    assert.deepEqual(a.sent, [
      { type: 'welcome', id: 'alice' },
      { type: 'error', msg: '对方不在线，消息未送达' }
    ]);
  });

  test('对方连接非 OPEN 状态时不投递并报错', () => {
    const a = mockWs();
    const b = mockWs(0); // readyState: 0 (CONNECTING)
    handleJoin(a.ws, { id: 'alice' }, () => {});
    handleJoin(b.ws, { id: 'bob' }, () => {});
    handleMessage(a.ws, { text: 'hi' }, 'alice');
    assert.equal(b.sent.length, 1); // 仅 join 阶段的 peer-joined，无 message
    assert.deepEqual(a.sent.slice(-1), [{ type: 'error', msg: '对方不在线，消息未送达' }]);
  });
});

describe('handleDndStatus', () => {
  test('未加入时拒绝', () => {
    const a = mockWs();
    handleDndStatus(a.ws, { dnd: true }, null);
    assert.deepEqual(a.sent, [{ type: 'error', msg: '请先连接' }]);
  });

  test('勿扰状态广播给对方，dnd 强制布尔化', () => {
    const a = mockWs();
    const b = mockWs();
    handleJoin(a.ws, { id: 'alice' }, () => {});
    handleJoin(b.ws, { id: 'bob' }, () => {});
    b.sent.length = 0;
    handleDndStatus(a.ws, { dnd: 'yes' }, 'alice');
    assert.deepEqual(b.sent, [{
      type: 'dnd-status',
      from: 'alice',
      dnd: false // 非 true 值统一按 false 处理
    }]);
  });
});

describe('handleLeave / leaveRoom', () => {
  test('主动离开：移出房间并通知对方', () => {
    const a = mockWs();
    const b = mockWs();
    handleJoin(a.ws, { id: 'alice' }, () => {});
    handleJoin(b.ws, { id: 'bob' }, () => {});
    a.sent.length = 0;
    b.sent.length = 0;

    let left = false;
    handleLeave(a.ws, {}, 'alice', () => { left = true; });

    assert.equal(left, true);
    assert.equal(clients.length, 1);
    assert.deepEqual(b.sent, [{
      type: 'peer-disconnected',
      id: 'alice'
    }]);
  });

  test('未加入时离开：不产生任何通知', () => {
    const a = mockWs();
    let left = false;
    handleLeave(a.ws, {}, null, () => { left = true; });
    assert.equal(left, true);
    assert.equal(a.sent.length, 0);
    assert.equal(clients.length, 0);
  });

  test('leaveRoom 移除不存在的ID时保持静默', () => {
    leaveRoom('ghost', mockWs().ws);
    assert.equal(clients.length, 0);
  });
});
