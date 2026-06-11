const fs = require('fs');
const path = 'C:/PROJECTS/athlete-pro/js/onboarding.js';
let content = fs.readFileSync(path, 'utf8');

const renderRepl = `function _render() {
  const ru = false; // Default to English for first-run
  _overlay.innerHTML = \`
    <div style="width:100%; max-width:420px; display:flex; flex-direction:column; gap:var(--sp-4); padding-top:20px; position:relative; z-index:1;">
      <!-- Progress Bar -->
      <div style="display:flex; gap:4px; padding: 0 var(--sp-2);">
        \${Array.from({length: STEPS}).map((_, i) => \`
          <div style="height:3px; border-radius:1.5px; flex:1; background:\${i + 1 <= _step ? 'var(--c-accent)' : 'rgba(255,255,255,0.05)'}; transition: background 0.4s ease, box-shadow 0.4s ease; \${i + 1 === _step ? 'box-shadow: 0 0 8px var(--c-accent);' : ''}"></div>
        \`).join('')}
      </div>

      <!-- Step Content -->
      <div style="padding: 0 var(--sp-2);">
        \${_buildStep(ru)}
      </div>
    </div>
  \`;
}`;

const stepGoalRepl = `function _stepGoal(ru) {
  return \`
    <div class="animate-in" style="display:flex; flex-direction:column; min-height: 70vh;">
      <div style="margin-bottom: 40px; position: relative;">
        <!-- Premium Hero Background Glow -->
        <div style="position:absolute; top:-20px; left:-20px; right:-20px; bottom:-20px; background: radial-gradient(circle at top left, rgba(0,230,118,0.12), transparent 70%); filter:blur(30px); z-index:-1; pointer-events:none;"></div>
        
        <h1 style="font-size:36px; font-weight:900; letter-spacing:-0.05em; color:var(--c-text-1); margin-bottom:12px; line-height:1.1;">
          \${ru ? 'Твоя цель?' : "What's your goal?"}
        </h1>
        <p style="font-size:15px; font-weight:500; color:var(--c-text-3); line-height:1.5; max-width:90%;">
          \${ru ? 'Выбери фокус. Мы настроим ИИ-коуча и подберем нужные алгоритмы.' : "Choose your focus. We'll calibrate the AI coach and algorithms."}
        </p>
      </div>
      
      <div style="display:flex; flex-direction:column; gap:12px; flex:1;">
        \${_choiceCard('strength', SVG.strength, ru ? 'Сила' : 'Strength', ru ? 'Максимальные веса, 1-5 повторений.' : 'Maximal weight, 1–5 reps.', 'var(--c-accent)')}
        \${_choiceCard('hypertrophy', SVG.hypertrophy, ru ? 'Масса' : 'Hypertrophy', ru ? 'Объем и рост мышц, 6-12 повторений.' : 'Muscle size and volume, 6–12 reps.', 'var(--c-purple)')}
        \${_choiceCard('endurance', SVG.endurance, ru ? 'Выносливость' : 'Endurance', ru ? 'Кондиции и тонус, 15+ повторений.' : 'Conditioning and stamina, 15+ reps.', 'var(--c-blue)')}
      </div>
      
      <!-- Elegant Fast Skip -->
      <div style="margin-top:32px; text-align:center;">
        <button onclick="window._obQuickStart()" class="ob-fast-skip-btn"
                style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); color:var(--c-text-3); font-size:13px; font-weight:600; cursor:pointer; padding:12px 24px; border-radius:24px; transition:all 0.2s ease; display:inline-flex; align-items:center; gap:8px;">
          <span style="opacity:0.8;">\${ru ? 'Пропустить настройку' : 'Skip & Quick Start'}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="opacity:0.6"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
        </button>
      </div>
    </div>
    <div style="margin-top:24px;">
      \${_navButtons(ru, !!_data.goal)}
    </div>
  \`;
}`;

const stepQuickConfirmRepl = `function _stepQuickConfirm(ru) {
  return \`
    <div class="animate-in" style="display:flex; flex-direction:column; min-height: 70vh;">
      <div style="margin-bottom: 40px; position: relative;">
        <!-- Premium Hero Background Glow -->
        <div style="position:absolute; top:-20px; left:-20px; right:-20px; bottom:-20px; background: radial-gradient(circle at top left, rgba(139,92,246,0.15), transparent 70%); filter:blur(30px); z-index:-1; pointer-events:none;"></div>
        
        <h1 style="font-size:36px; font-weight:900; letter-spacing:-0.05em; color:var(--c-text-1); margin-bottom:12px; line-height:1.1;">
          \${ru ? 'Приватность' : 'Data Privacy'}
        </h1>
        <p style="font-size:15px; font-weight:500; color:var(--c-text-3); line-height:1.5; max-width:90%;">
          \${ru ? 'Выбери режим синхронизации. По умолчанию — локальный.' : 'Default: Full anonymity. Choose your sync engine.'}
        </p>
      </div>

      <div style="display:flex; flex-direction:column; gap:12px;">
        \${_choiceCard('airgap', SVG.shield, ru ? 'Анонимно (Off-line)' : 'Anonymous (Offline)', ru ? 'Данные только в телефоне. ИИ работает локально.' : 'All data stays on device. Zero tracking.', 'var(--c-accent)')}
        \${_choiceCard('cloud', SVG.cloud, ru ? 'Облако (Опционально)' : 'Cloud Sync (Optional)', ru ? 'Синхронизация между устройствами через облако.' : 'Encrypted sync across your devices.', 'var(--c-blue)')}
      </div>
      
      <p style="font-size:12px; font-weight:500; color:var(--c-text-3); margin-top:24px; text-align:center; line-height:1.4; opacity:0.6;">
        \${ru ? 'Остальные данные (вес, возраст) можно настроить в профиле.' : 'Other bio-metrics (weight, age) can be set in your profile.'}
      </p>
    </div>
    
    <div style="display:flex; gap:12px; margin-top:auto; padding-top:24px">
      <button onclick="window._obPrev()" 
              style="width:56px; height:56px; background:var(--c-surface); border:1px solid var(--c-border); border-radius:var(--r-m); color:var(--c-text-2); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.2s ease;">
        \${SVG.back}
      </button>
      <button id="ob-finish-btn" onclick="window._obFinish()" 
              style="flex:1; height:56px; background:var(--c-accent); color:#000; border:none; border-radius:var(--r-m); font-size:16px; font-weight:800; cursor:pointer; box-shadow:0 8px 24px rgba(0,230,118,0.25); transition:transform 0.2s ease;">
        \${ru ? 'Начать тренировку' : "Start Journey"}
      </button>
    </div>
  \`;
}`;

const choiceCardRepl = `function _choiceCard(key, icon, label, sub, color) {
  const active = _step === 1 ? _data.goal === key : _step === 2 ? _data.exp === key : _data.privacy === key;
  return \`
    <button class="ob-card \${active ? 'active' : ''}" data-key="\${key}" onclick="window._obSelect('\${key}')" 
            style="--active-c:\${color}; position:relative; display:flex; align-items:center; text-align:left; gap:20px; padding:20px 24px; background:var(--c-surface); border:1px solid \${active ? color : 'var(--c-border)'}; border-radius:var(--r-xl); cursor:pointer; width:100%; transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1); overflow:hidden; z-index:1;">
      \${active ? \`<div style="position:absolute; inset:0; background:radial-gradient(circle at left, \${color}20 0%, transparent 80%); z-index:-1;"></div>\` : ''}
      <div style="width:44px; height:44px; border-radius:14px; background:\${color}15; color:\${color}; display:flex; align-items:center; justify-content:center; flex-shrink:0; box-shadow: \${active ? \`0 0 16px \${color}40\` : 'none'}; transition:all 0.3s ease;">
        \${icon}
      </div>
      <div style="min-width:0; flex:1;">
        <div style="font-size:16px; font-weight:800; color:var(--c-text-1); letter-spacing:-0.01em; margin-bottom:2px;">\${label}</div>
        <div style="font-size:12px; font-weight:500; color:var(--c-text-3); line-height:1.3">\${sub}</div>
      </div>
    </button>\`;
}`;

content = content.replace(/function _render\(\) \{[\s\S]*?function _buildStep/m, renderRepl + '\n\nfunction _buildStep');
content = content.replace(/function _stepGoal\(ru\) \{[\s\S]*?function _stepQuickConfirm/m, stepGoalRepl + '\n\nfunction _stepQuickConfirm');
content = content.replace(/function _stepQuickConfirm\(ru\) \{[\s\S]*?function _stepExp/m, stepQuickConfirmRepl + '\n\nfunction _stepExp');
content = content.replace(/function _choiceCard\(key, icon, label, sub, color\) \{[\s\S]*?function _navButtons/m, choiceCardRepl + '\n\nfunction _navButtons');

fs.writeFileSync(path, content, 'utf8');
