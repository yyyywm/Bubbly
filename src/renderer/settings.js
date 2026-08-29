// ============================================================
// 持久化设置
// ============================================================
function loadSettings() {
  try {
    const saved = localStorage.getItem('bubbly_settings');
    if (!saved) return;
    const s = JSON.parse(saved);
    if (s.serverUrl) inpServer.value = s.serverUrl;
    if (s.nickname) inpNickname.value = s.nickname;
    if (typeof s.scale === 'number') {
      petScale = s.scale;
      document.querySelectorAll('.scale-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.scale) === petScale);
      });
    }
    // 勿扰模式随会话记忆
    doNotDisturb = s.dnd === true;
  } catch (e) {
    console.warn('加载设置失败:', e);
  }
}

function saveSettings() {
  try {
    localStorage.setItem('bubbly_settings', JSON.stringify({
      serverUrl: inpServer.value,
      nickname: inpNickname.value,
      scale: petScale,
      dnd: doNotDisturb
    }));
  } catch (e) {
    console.warn('保存设置失败:', e);
  }
}

