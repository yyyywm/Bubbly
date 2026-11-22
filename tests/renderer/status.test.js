const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rendererDir = path.join(__dirname, '..', '..', 'src', 'renderer');

function createRenderer() {
  const context = vm.createContext({
    console: { log() {}, error() {} },
    isConnected: false,
    peerConnected: false,
    peerDoNotDisturb: false,
    doNotDisturb: false,
    reconnectVisible: false,
    reconnectTimer: null,
    ws: null,
    userId: 'alice',
    statusBarSelf: { className: '' },
    statusBarPeer: { className: '' },
    reconnectHint: { style: {} },
    setupPanel: { style: {} },
    petArea: { style: {} },
    window: { electronAPI: { enterPetMode() {}, onInputWindowMessage() {} } },
    applyScale() {},
    updatePetDisplay() {},
    broadcastDndStatus() {},
    petScale: 100
  });
  for (const name of ['status.js', 'connection.js']) {
    vm.runInContext(fs.readFileSync(path.join(rendererDir, name), 'utf8'), context, { filename: name });
  }
  return context;
}

test('独自连接服务器时状态灯为红色，配对后才变绿', () => {
  const renderer = createRenderer();
  renderer.handleMessage({ type: 'welcome', id: 'alice' });
  assert.equal(renderer.statusBarSelf.className, 'offline');
  assert.equal(renderer.statusBarPeer.className, 'offline');

  renderer.handleMessage({ type: 'peer-joined', id: 'bob' });
  assert.equal(renderer.statusBarSelf.className, 'online');
  assert.equal(renderer.statusBarPeer.className, 'online');

  renderer.handleMessage({ type: 'peer-disconnected', id: 'bob' });
  assert.equal(renderer.statusBarSelf.className, 'offline');
  assert.equal(renderer.statusBarPeer.className, 'offline');

  renderer.handleMessage({ type: 'peer-joined', id: 'carol' });
  assert.equal(renderer.statusBarSelf.className, 'online');
  assert.equal(renderer.statusBarPeer.className, 'online');
});

test('单人在线时即使开启勿扰，状态灯仍为红色', () => {
  const renderer = createRenderer();
  renderer.doNotDisturb = true;
  renderer.handleMessage({ type: 'welcome', id: 'alice' });
  assert.equal(renderer.statusBarSelf.className, 'offline');
  assert.equal(renderer.statusBarPeer.className, 'offline');
});

test('对方关闭勿扰后恢复绿色在线状态', () => {
  const renderer = createRenderer();
  renderer.handleMessage({ type: 'welcome', id: 'alice' });
  renderer.handleMessage({ type: 'peer-joined', id: 'bob' });
  renderer.handleMessage({ type: 'dnd-status', from: 'bob', dnd: true });
  assert.equal(renderer.statusBarPeer.className, 'dnd');
  renderer.handleMessage({ type: 'dnd-status', from: 'bob', dnd: false });
  assert.equal(renderer.statusBarPeer.className, 'online');
});
