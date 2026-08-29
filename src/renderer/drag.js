// ============================================================
// 桌宠拖拽（绝对定位，无 timer）
// mousedown → 记录"鼠标按下点"的渲染器坐标（拖拽全程为常量）
// → mousemove 上报该常量点 → mouseup 结束
// -webkit-app-region: no-drag 确保 dblclick 和 contextmenu 正常触发
//
// 为何主进程用屏幕坐标(screen.getCursorScreenPoint)而非渲染器坐标：
//   渲染器里的所有坐标(pageX/clientX/movementX)都以窗口左上角为原点，
//   而窗口左上角恰恰是被 setPosition 不断改变的变量。当主进程 setPosition
//   后，静止的鼠标对渲染器而言"坐标变了"，下一次 mousemove 会再上报一个
//   伪位移 → 再 setPosition → 无限反馈循环，表现为拖拽时窗口延展变大。
//   屏幕坐标以显示器原点为基准，setPosition 不会改变它，因此定位绝对稳定。
//   渲染器只需上报一个拖拽全程不变的常量点(按下点)，主进程用屏幕坐标
//   反算窗口应处的绝对位置，一劳永逸。传常量是关键：一旦上报值随光标变化，
//   反馈循环仍会触发。
// ============================================================
let isDragging = false;
let wasDragging = false;
// 拖拽起始点的渲染器坐标（mousedown 时固定，整个拖拽过程为常量）。
// 主进程用屏幕坐标反算窗口绝对位置时，传一个"常量点"即可：
//   setPosition(cursorScreen - clickClient)
// 让 clickClient 这个点始终跟光标对齐，实现"按在哪、就在哪拖"的自然手感。
let dragClickX = 0;
let dragClickY = 0;
// 节流：每 FRAME_THROTTLE_MS 才上报一次，避免鼠标快速移动时每秒 150–300 次
// 跨进程 IPC 导致拖拽卡顿。因为 click 点是常量，丢帧不会造成定位偏差。
const FRAME_THROTTLE_MS = 16;
let lastDragSend = 0;

petContainer.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;  // 仅左键拖拽
  // 记录按下点的渲染器坐标（常量，鼠标移动时不更新；每次按下重新计算，
  // 缩放后容器尺寸/位置变化仍能正确取到新坐标系下的点）
  dragClickX = e.clientX;
  dragClickY = e.clientY;
  isDragging = true;
  wasDragging = false;
  e.preventDefault();
  petArea.style.cursor = 'grabbing';
  petContainer.style.cursor = 'grabbing';
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  wasDragging = true;
  // 节流上报：click 点是常量，丢帧不会造成定位偏差
  const now = Date.now();
  if (now - lastDragSend < FRAME_THROTTLE_MS) return;
  lastDragSend = now;
  window.electronAPI.dragMove(dragClickX, dragClickY);
});

document.addEventListener('mouseup', (e) => {
  if (!isDragging) return;
  isDragging = false;
  document.body.style.cursor = 'default';
  petContainer.style.cursor = 'grab';
});

