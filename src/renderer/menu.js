// 菜单项 IPC 回调：发送消息（打开独立悬浮输入窗口）
window.electronAPI.onPetMenuSendMessage(() => {
  if (isConnected) window.electronAPI.showInputWindow();
});

// 菜单项 IPC 回调：返回设置
window.electronAPI.onPetMenuLeavePetMode(() => {
  if (isConnected) {
    ws.close();
    isConnected = false;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    reconnectVisible = false;
    window.electronAPI.leavePetMode();
    resetSetupWindowSize();
    petArea.style.display = 'none';
    setupPanel.style.display = 'flex';
    setStatus('已断开连接', '#f44336');
    btnConnect.disabled = false;
    messageQueue.length = 0;
    isShowing = false;
    bubbleContainer.innerHTML = '';
  }
});

// 构建当前桌宠右键菜单的模板（由主进程渲染）
function buildPetContextMenuTemplate() {
  const items = [];

  // 💌 发送消息
  items.push({ label: '💌', action: 'pet-menu-send-message' });

  items.push({ type: 'separator' });

  // 🌙 勿扰开关
  if (doNotDisturb) {
    items.push({ label: '🔔', action: 'pet-menu-toggle-dnd', enabled: true });
  } else {
    items.push({ label: '🌙', action: 'pet-menu-toggle-dnd', enabled: true });
  }

  // 历史记录（最多 MAX_MENU_HISTORY 条，最近优先）
  const histLen = dndQueue.length;
  if (histLen > 0) {
    items.push({ type: 'separator' });
    const preview = dndQueue.slice().reverse();
    for (let i = 0; i < preview.length; i++) {
      const raw = String(preview[i]);
      const display = raw.length > 20 ? raw.slice(0, 20) + '…' : raw;
      items.push({
        label: display,
        action: '',
        enabled: false
      });
    }
    if (histLen > MAX_MENU_HISTORY) {
      items.push({
        label: '…更早消息未保留',
        action: '',
        enabled: false
      });
    }
    items.push({ type: 'separator' });
    items.push({
      label: '▶ 立即重放全部 ' + histLen + ' 条',
      action: 'pet-menu-replay-queue'
    });
  }

  items.push({ type: 'separator' });

  // 🏠 返回设置
  items.push({ label: '🏠', action: 'pet-menu-leave-pet-mode' });
  // 🔄 重启应用
  items.push({ label: '🔄', action: 'pet-menu-relaunch' });
  // ❌ 退出
  items.push({ label: '❌', action: 'pet-menu-quit' });

  return items;
}

// 主进程请求菜单模板：构造后通过 contextBridge 回传
window.electronAPI.onContextMenuItems(() => {
  window.electronAPI.sendContextMenuItems(buildPetContextMenuTemplate());
});

// 菜单项 IPC 回调：重启应用
window.electronAPI.onPetMenuRelaunch(() => {
  window.electronAPI.petMenuRelaunch();
});

// 菜单项 IPC 回调：退出应用
window.electronAPI.onPetMenuQuit(() => {
  window.electronAPI.petMenuQuit();
});

// 菜单项 IPC 回调：切换勿扰模式
window.electronAPI.onPetMenuToggleDnd(() => {
  toggleDnd();
});

// 菜单项 IPC 回调：立即重放队列消息
window.electronAPI.onPetMenuReplayQueue(() => {
  replayDndQueue();
});

