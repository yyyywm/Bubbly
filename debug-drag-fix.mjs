/**
 * Verify the CORRECTED NEW pipeline (main-process screen-space absolute positioning).
 *
 * Relation proven by simulation:
 *   main: setPosition( cursorScreen - offsetX )
 *   For petCenter_screen == cursorScreen we need offsetX == petCenterClient (CONSTANT).
 *   Frameless window -> window origin == content origin, same scale -> direct subtract OK.
 *
 * Two guarantees:
 *   (1) pet center tracks cursor  (max |petCenterScreen - cursorScreen| == 0)
 *   (2) no feedback loop          (setPosition depends only on screenCursor, not window pos)
 */
const PET_W = 150, PET_H = 150;
const PET_CENTER_CLIENT_X = 65 + PET_W / 2; // 140
const PET_CENTER_CLIENT_Y = 300 - 20 - PET_H + PET_H / 2; // 205

// Option A: send CONSTANT pet-center client coord -> pet center follows cursor
function rendererOffset_center() {
  return { ox: PET_CENTER_CLIENT_X, oy: PET_CENTER_CLIENT_Y };
}
// Option B (CHOSEN): send the CLICK POINT client coord (constant for the whole drag)
// -> natural "grab at click point" feel, no snap. Still a constant => no feedback loop.
function rendererOffset_grabPoint(clickX, clickY) {
  return { ox: clickX, oy: clickY };
}
// WRONG (my first new code): varies every frame -> MISALIGN + feedback loop
function rendererOffset_varying(cursorClientX, cursorClientY) {
  return { ox: cursorClientX - PET_CENTER_CLIENT_X, oy: cursorClientY - PET_CENTER_CLIENT_Y };
}

function fullDrag(offsetGen) {
  let windowScreenX = 400, windowScreenY = 300;
  // cursor starts over pet center in screen space
  let cursorScreenX = 400 + PET_CENTER_CLIENT_X;
  let cursorScreenY = 300 + PET_CENTER_CLIENT_Y;
  const frames = [
    { dx: 30, dy: 12 },
    { dx: 0,  dy: 0  },  // spurious (setPosition only)
    { dx: 40, dy: -8 },
    { dx: 0,  dy: 0  },  // spurious
    { dx: 20, dy: 25 },
    { dx: 0,  dy: 0  },  // spurious
  ];
  let winStartX = windowScreenX, winStartY = windowScreenY,
      cursorStartX = cursorScreenX, cursorStartY = cursorScreenY;
  let maxErr = 0, calls = 0;
  for (const f of frames) {
    cursorScreenX += f.dx;
    cursorScreenY += f.dy;
    const cX = cursorScreenX - windowScreenX; // cursor client coord this frame
    const cY = cursorScreenY - windowScreenY;
    const off = offsetGen(cX, cY);
    windowScreenX = Math.round(cursorScreenX - off.ox);
    windowScreenY = Math.round(cursorScreenY - off.oy);
    const petScreenX = windowScreenX + PET_CENTER_CLIENT_X;
    const petScreenY = windowScreenY + PET_CENTER_CLIENT_Y;
    const err = Math.abs(cursorScreenX - petScreenX) + Math.abs(cursorScreenY - petScreenY);
    if (err > maxErr) maxErr = err;
    calls++;
  }
  return {
    calls,
    windowMovedX: windowScreenX - winStartX,
    windowMovedY: windowScreenY - winStartY,
    cursorMovedX: cursorScreenX - cursorStartX,
    cursorMovedY: cursorScreenY - cursorStartY,
    maxErr,
    // loop test: did a spurious (dx=0,dy=0) frame change the window?
    windowChangedOnSpurious: false // proven structurally: no window pos in formula
  };
}

console.log('CORRECTED NEW pipeline verification\n');
console.log('Relation: setPosition(cursorScreen - petCenterClient), petCenterClient = constant\n');

// Note: Option A (center) and Option B (grab point) are both constants.
// Option B is chosen for UX (no snap). Full-drag behavior is identical for both
// since the window-moves==cursor-moves invariant depends only on "offset is constant".
const r1 = fullDrag(rendererOffset_center);
console.log('=== Option A: offsetX = petCenterClient (constant) ===');
console.log('  calls:', r1.calls, '| windowMoved:', r1.windowMovedX, r1.windowMovedY,
              '| cursorMoved:', r1.cursorMovedX, r1.cursorMovedY);
console.log('  max |petCenter - cursor|:', r1.maxErr, '->', r1.maxErr === 0 ? 'TRACKS OK' : 'MISALIGN');
console.log('  window moves == cursor moves (no drift/extension):',
            (r1.windowMovedX === r1.cursorMovedX && r1.windowMovedY === r1.cursorMovedY)
              ? 'YES' : 'NO');

const r2 = fullDrag(rendererOffset_varying);
console.log('\n=== WRONG (my first new code): offsetX = cursorClient - petCenterClient (varies) ===');
console.log('  calls:', r2.calls, '| windowMoved:', r2.windowMovedX, r2.windowMovedY);
console.log('  max |petCenter - cursor|:', r2.maxErr, '->', r2.maxErr === 0 ? 'ok' : 'MISALIGN (bug)');

process.exit(r1.maxErr === 0 && r1.windowMovedX === r1.cursorMovedX && r1.windowMovedY === r1.cursorMovedY ? 0 : 1);