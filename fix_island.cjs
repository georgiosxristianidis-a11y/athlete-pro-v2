const fs = require('fs');
let text = fs.readFileSync('C:/PROJECTS/athlete-pro/js/shared/dynamic-island.js', 'utf8');

// Replace dblclick
text = text.replace(
  /_island\?\.addEventListener\('dblclick', \(e\) => \{\s*if \(_island\?\.classList\.contains\('mode-idle'\)\) window\.PrivacyRapid\?\.toggle\(\);\s*\}\);/,
  `_island?.addEventListener('dblclick', (e) => {
      window.PrivacyRapid?.toggle();
    });`
);

// Replace _onPointerUp
text = text.replace(
  /function _onPointerUp\(e\) \{[\s\S]*?setTimeout\(\(\) => \{ _movedPastThreshold = false; \}, 50\);\s*\}/,
  `function _onPointerUp(e) {
    if (_island?.classList.contains('mode-idle')) {
      window.PrivacyRapid?.cancelLongPress();
      // Allow swipe right/left in idle mode too
    }

    if (_currentX > 60) {
      window.PrivacyRapid?.enable();
    } else if (_currentX < -60) {
      window.PrivacyRapid?.disable();
    }

    if (!_isDragging) return;
    _isDragging = false;
    clearTimeout(_longPressTimer);
    _island?.style.setProperty('transition', 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)');
    
    // Snap back
    _currentX = 0;
    _currentY = 0;
    _applyTransform();
    
    setTimeout(() => { _movedPastThreshold = false; }, 50);
  }`
);

fs.writeFileSync('C:/PROJECTS/athlete-pro/js/shared/dynamic-island.js', text, 'utf8');
