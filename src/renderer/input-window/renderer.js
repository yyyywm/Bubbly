/**
 * Bubbly - 独立悬浮输入窗口（renderer）
 *
 * 职责：渲染一个轻量输入条，Enter 发送 / 点击发送 / Esc 关闭。
 * 发送后通过 preload 的 electronAPI.sendAndClose(text) 把消息回传给主进程，
 * 主进程再转发给主窗口渲染进程，经 WebSocket 发出。
 */

const msgInput = document.getElementById('msg-input');
const btnSend  = document.getElementById('btn-send');

function sendAndClose() {
  const text = String(msgInput.value || '').trim();
  if (!text) return;
  // 清空输入框后再发送，blur 检测空框时判定已发送
  msgInput.value = '';
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

// 失焦自动隐藏：用户点击桌面其他地方时立即关闭窗口，无需等待。
// 用 setTimeout 让 click/sendAndClose 等同步事件先完成，避免点击发送按钮时
// blur 抢先触发关闭窗口导致消息发不出去。
msgInput.addEventListener('blur', () => {
  setTimeout(() => {
    if (!msgInput.value.trim()) {
      window.electronAPI.close();
    }
  }, 60);
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
