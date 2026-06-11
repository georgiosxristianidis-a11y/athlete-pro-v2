const fs = require('fs');
const path = 'C:/PROJECTS/athlete-pro/js/shared/athlete-room.js';
let content = fs.readFileSync(path, 'utf8');

const newPhotoLogic = `
  function handlePhotoSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result;
      if (base64) {
        _openCropModal(base64);
      }
    };
    reader.readAsDataURL(file);
    // Reset input so the same file can be selected again
    e.target.value = '';
  }

  function _openCropModal(base64) {
    const ru = (window.DB && window.DB.Settings && window.DB.Settings.getSync && window.DB.Settings.getSync('lang') === 'ru') || navigator.language.startsWith('ru');
    
    const modal = document.createElement('div');
    modal.className = 'ar-crop-modal';
    modal.innerHTML = \`
      <div class="ar-crop-card">
        <div class="ar-crop-header">
          <div class="ar-crop-title">\${ru ? 'Масштаб и положение' : 'Scale and position'}</div>
        </div>
        <div class="ar-crop-view-container">
          <div class="ar-crop-mask"></div>
          <img id="ar-crop-img" class="ar-crop-img" src="\${base64}" draggable="false">
        </div>
        <div class="ar-crop-controls">
          <div class="ar-crop-zoom-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <span>\${ru ? 'Масштаб' : 'Zoom'}</span>
          </div>
          <input type="range" id="ar-crop-zoom" min="1" max="4" step="0.05" value="1" class="ar-crop-slider">
        </div>
        <div class="ar-crop-actions">
          <button class="ar-btn-save" id="ar-crop-apply">\${ru ? 'Применить' : 'Apply'}</button>
          <button class="ar-btn-cancel" id="ar-crop-cancel">\${ru ? 'Отмена' : 'Cancel'}</button>
        </div>
      </div>
    \`;
    document.body.appendChild(modal);

    const img = modal.querySelector('#ar-crop-img');
    const zoomSlider = modal.querySelector('#ar-crop-zoom');
    const btnApply = modal.querySelector('#ar-crop-apply');
    const btnCancel = modal.querySelector('#ar-crop-cancel');

    let scale = 1, tx = 0, ty = 0;
    let isDragging = false, startX = 0, startY = 0;
    const BOX_SIZE = 180; // Size of the mask box

    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      if (ratio > 1) {
        img.height = BOX_SIZE;
        img.width = BOX_SIZE * ratio;
      } else {
        img.width = BOX_SIZE;
        img.height = BOX_SIZE / ratio;
      }
      img.style.width = img.width + 'px';
      img.style.height = img.height + 'px';
      _updateTransform();
    };

    function _updateTransform() {
      img.style.transform = \`translate(-50%, -50%) translate(\${tx}px, \${ty}px) scale(\${scale})\`;
    }

    const onPointerDown = (e) => {
      isDragging = true;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      startX = clientX - tx;
      startY = clientY - ty;
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      tx = clientX - startX;
      ty = clientY - startY;
      _updateTransform();
    };

    const onPointerUp = () => { isDragging = false; };

    img.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    img.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp);

    zoomSlider.addEventListener('input', (e) => {
      scale = parseFloat(e.target.value);
      _updateTransform();
    });

    const cleanup = () => {
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
      modal.remove();
    };

    btnCancel.onclick = cleanup;

    btnApply.onclick = async () => {
      const rectImg = img.getBoundingClientRect();
      const rectMask = img.parentElement.getBoundingClientRect();
      // Center of mask
      const cx = rectMask.left + rectMask.width / 2;
      const cy = rectMask.top + rectMask.height / 2;

      // Offset of mask top-left relative to image top-left
      const offX = (cx - BOX_SIZE / 2) - rectImg.left;
      const offY = (cy - BOX_SIZE / 2) - rectImg.top;

      // Calculate scale of natural image vs rendered image bounds
      const scaleX = img.naturalWidth / rectImg.width;
      const scaleY = img.naturalHeight / rectImg.height;

      const sx = offX * scaleX;
      const sy = offY * scaleY;
      const sWidth = BOX_SIZE * scaleX;
      const sHeight = BOX_SIZE * scaleY;

      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, 400, 400);
        const finalBase64 = canvas.toDataURL('image/jpeg', 0.9);
        await DB.Settings.set('athlete-photo', finalBase64);
        render();
        initAvatar();
        
        // Dynamic UI Refresh
        if (window.Dashboard?.load) window.Dashboard.load();
        const sProfile = document.getElementById('s-profile');
        if (sProfile && sProfile.classList.contains('active')) {
          const { renderProfile } = await import('../profile.view.js');
          renderProfile(sProfile);
        }
      }
      cleanup();
    };
  }
`;

content = content.replace(/function handlePhotoSelected[\s\S]*?reader\.readAsDataURL\(file\);\s*\}/m, newPhotoLogic);
fs.writeFileSync(path, content, 'utf8');
