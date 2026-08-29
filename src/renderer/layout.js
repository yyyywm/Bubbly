// ============================================================
// 缩放 —— 单一数据源架构
// ============================================================
//
// 核心设计：computeLayout(scale) 是唯一计算入口，返回一个包含所有布局尺寸的纯对象。
// applyScale 只做两件事：① 设置 CSS 自定义属性（:root vars）→ CSS 自动生效；
//                        ② IPC 通知主进程更新窗口尺寸 → 主进程 setBounds / drag-move 用。
//
// 三处同步自动完成，修改桌宠大小/间距/气泡位置只需改 computeLayout 一个函数：
//   ┌──────────────┐   CSS var()    ┌──────────────┐
//   │ computeLayout │ ─────────────► │   styles.css │
//   │  (算一次)     │                │ (var 引用)   │
//   └──────┬───────┘                └──────────────┘
//          │
//          │ IPC set-window-size
//          ▼
//   ┌──────────────┐
//   │  main.js     │
//   │ winW/winH    │
//   └──────────────┘
//
// 不再需要：inline style 覆盖、CSS 硬编码数值、主进程猜测尺寸

/**
 * 计算桌宠布局的所有尺寸 —— 单一数据源（single source of truth）
 * 纯函数，输入 scale(%)，输出布局对象。
 * 返回值同时用于设置 CSS 自定义属性和 IPC 通知主进程。
 */
function computeLayout(scale) {
  const ratio = scale / 100;
  const petSize = Math.round(120 * ratio);
  const bubbleH = Math.round(42 * ratio);
  const inputH = Math.round(35 * ratio);
  const bodyScale = (ratio * 0.8).toFixed(4);

  const BUBBLE_TO_BAR_GAP = 4;
  const STATUS_BAR_H = 3;
  const BAR_TO_PET_GAP = 6;
  const PET_BOTTOM = 4;
  const INPUT_GAP = 4;
  const SIDE_MARGIN = 20;

  const inputSpace = INPUT_GAP + inputH;
  const barTop = bubbleH + BUBBLE_TO_BAR_GAP;
  const petTop = barTop + STATUS_BAR_H + BAR_TO_PET_GAP;
  const winW = petSize + SIDE_MARGIN * 2;
  const winH = petTop + petSize + PET_BOTTOM + inputSpace;

  return { winW, winH, petSize, petTop, barTop, bubbleH, bodyScale };
}

function applyScale(scale) {
  petScale = scale;
  const L = computeLayout(scale);
  const root = document.documentElement.style;

  // 通过 CSS 自定义属性驱动所有布局 — CSS 与 JS 自动同步，无需 inline style
  root.setProperty('--win-w', L.winW + 'px');
  root.setProperty('--win-h', L.winH + 'px');
  root.setProperty('--pet-top', L.petTop + 'px');
  root.setProperty('--pet-size', L.petSize + 'px');
  root.setProperty('--bubble-h', L.bubbleH + 'px');
  root.setProperty('--bar-top', L.barTop + 'px');
  root.setProperty('--body-scale', L.bodyScale);

  // 主进程用这个值做 setBounds / drag-move 定位，并据此计算输入窗口悬浮位置
  window.electronAPI.setWindowSize(L.winW, L.winH, L.petTop + L.petSize);
  saveSettings();
}

function resetSetupWindowSize() {
  window.electronAPI.setWindowSize(280, 340);
}

