/**
 * Bubbly - 独立悬浮输入窗口（renderer）
 *
 * 职责：渲染一个轻量输入条，Enter 发送 / 点击发送 / Esc 关闭。
 * 发送后通过 preload 的 electronAPI.sendAndClose(text) 把消息回传给主进程，
 * 主进程再转发给桌宠渲染进程的 sendMessage()。
 */

const msgInput = document.getElementById('msg-input');
const btnSend  = document.getElementById('btn-send');

function sendAndClose() {
  const text = msgInput.value.trim();
  if (!text) return;
  window.electronAPI.sendAndClose(text);
}

btnSend.addEventListener('click', sendAndClose);

msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendAndClose();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    window.electronAPI.close();
  }
});

window.electronAPI.onClear(() => {
  msgInput.value = '';
  msgInput.focus();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    window.electronAPI.close();
  }
});

msgInput.focus();
