// ============================================================
// 消息气泡
// ============================================================
function enqueueBubble(text) {
  if (messageQueue.length >= MAX_QUEUE_SIZE) {
    messageQueue.shift();
  }
  messageQueue.push(text);
  showNextBubble();
}

function showNextBubble() {
  if (isShowing || messageQueue.length === 0) return;

  isShowing = true;
  const text = messageQueue.shift();
  switchPetImage('message');

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  bubbleContainer.appendChild(bubble);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => bubble.classList.add('show'));
  });

  setTimeout(() => {
    bubble.classList.remove('show');
    bubble.classList.add('hide');
  }, 2500);

  setTimeout(() => {
    bubble.remove();
    isShowing = false;
    if (messageQueue.length === 0) switchPetImage('default');
    showNextBubble();
  }, 2850);
}

