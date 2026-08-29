// ============================================================
// 自定义图片管理
// ============================================================
function loadCustomImages() {
  try {
    const saved = localStorage.getItem('bubbly_images');
    if (!saved) return;
    const s = JSON.parse(saved);
    if (s.default) customImages['default'] = s.default;
    if (s.message) customImages['message'] = s.message;
    updateImagePreviews();
  } catch (e) {
    console.warn('加载自定义图片失败:', e);
  }
}

function saveCustomImages() {
  try {
    localStorage.setItem('bubbly_images', JSON.stringify(customImages));
  } catch (e) {
    console.warn('保存自定义图片失败:', e);
    // localStorage 空间不足时清除最大项
    if (e instanceof QuotaExceededError) {
      if (customImages['default'] && customImages['message']) {
        const dLen = customImages['default'].length;
        const mLen = customImages['message'].length;
        if (dLen > mLen) {
          customImages['default'] = null;
        } else {
          customImages['message'] = null;
        }
        updateImagePreviews();
        try { localStorage.setItem('bubbly_images', JSON.stringify(customImages)); }
        catch (_) { console.warn('localStorage 已满，请清除图片后重试'); }
      }
    }
  }
}

function updateImagePreviews() {
  if (defaultPreview && customImages['default']) {
    defaultPreview.classList.add('has-image');
    let img = defaultPreview.querySelector('img');
    if (!img) { img = document.createElement('img'); defaultPreview.appendChild(img); }
    img.src = customImages['default'];
  } else if (defaultPreview) {
    defaultPreview.classList.remove('has-image');
    const img = defaultPreview.querySelector('img');
    if (img) img.remove();
  }

  if (messagePreview && customImages['message']) {
    messagePreview.classList.add('has-image');
    let img = messagePreview.querySelector('img');
    if (!img) { img = document.createElement('img'); messagePreview.appendChild(img); }
    img.src = customImages['message'];
  } else if (messagePreview) {
    messagePreview.classList.remove('has-image');
    const img = messagePreview.querySelector('img');
    if (img) img.remove();
  }
}

function updatePetDisplay() {
  if (!petBody || !petImage) return;

  if (customImages['default']) {
    petBody.classList.add('hidden');
    petImage.classList.add('visible');
    petImage.src = customImages['default'];
  } else {
    petBody.classList.remove('hidden');
    petImage.classList.remove('visible');
  }
}

function switchPetImage(action) {
  if (!customImages['default']) return;  // CSS 桌宠模式，无需切换

  if (action === 'message' && customImages['message']) {
    petImage.src = customImages['message'];
  } else if (action === 'default') {
    petImage.src = customImages['default'];
  }
}

function handleImageUpload(target, file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    setStatus('⚠️ 请选择图片文件', '#f44336');
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    setStatus('⚠️ 图片文件不能超过 2MB', '#f44336');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    customImages[target] = e.target.result;
    saveCustomImages();
    updateImagePreviews();
    if (petArea && petArea.style.display === 'block') {
      updatePetDisplay();
    }
  };
  reader.onerror = () => {
    setStatus('⚠️ 图片读取失败', '#f44336');
  };
  reader.readAsDataURL(file);
}

function resetImage(target) {
  customImages[target] = null;
  saveCustomImages();
  updateImagePreviews();
  if (petArea && petArea.style.display === 'block') {
    updatePetDisplay();
  }
}

