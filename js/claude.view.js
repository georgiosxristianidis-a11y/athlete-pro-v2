// @ts-check
/* ════════════════════════════════════════════════════════
   claude.view.js — Claude AI view layer
   FAB, panel DOM, SVG body rendering, chat UI
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';
import { MUSCLE_MAP, Heatmap, ClaudeState, fetchCoach } from './claude.store.js';

/* ══════════════════════════════════════════════
   SVG BODY — front + back inline SVG
   Each muscle group has data-muscle attribute
   ══════════════════════════════════════════════ */

/**
 * Build an SVG body diagram with colored muscle groups.
 * @param {Object<string, number>} scores — muscle fatigue scores
 * @returns {string} SVG HTML string
 */
export function buildBodySVG(scores) {
  const f = (m) => Heatmap.scoreColor(scores[m]) || 'rgba(255,255,255,0.08)';
  const s = (m) => {
    const c = Heatmap.scoreColor(scores[m]);
    return c ? c.replace(/,[\d.]+\)$/, ',0.9)') : 'rgba(255,255,255,0.15)';
  };
  const bg = 'rgba(255,255,255,0.06)';
  const bs = 'rgba(255,255,255,0.13)';

  return `
  <svg class="body-svg" viewBox="0 0 260 430" fill="none" xmlns="http://www.w3.org/2000/svg">

  <!-- ═══ FRONT ═══ -->
  <text x="65" y="11" text-anchor="middle" font-size="7" font-weight="700"
    letter-spacing="0.12em" fill="rgba(100,115,140,0.8)">FRONT</text>

  <!-- Body silhouette front -->
  <path d="M60,6 Q49,9 47,20 Q44,31 50,40 Q53,44 60,46
           L60,54 Q53,55 49,58 Q41,62 36,68 Q32,74 33,82
           L32,112 Q33,116 36,118 L36,132 Q34,142 35,156
           Q36,164 41,168 L39,192 Q37,204 38,218
           Q40,226 46,230 L54,230 Q58,226 59,222
           L62,186 L68,186 L71,222 Q72,226 76,230
           L84,230 Q90,226 92,218 Q93,204 91,192
           L89,168 Q94,164 95,156 Q96,142 94,132
           L94,118 Q97,116 98,112 L97,82 Q98,74 94,68
           Q89,62 81,58 Q77,55 70,54 L70,46
           Q77,44 80,40 Q86,31 83,20 Q81,9 70,6 Q65,4 60,6 Z"
    fill="${bg}" stroke="${bs}" stroke-width="0.9"/>

  <!-- Head front -->
  <ellipse cx="65" cy="27" rx="15" ry="20" fill="${bg}" stroke="${bs}" stroke-width="0.8"/>

  <!-- Neck front -->
  <rect x="59.5" y="44" width="11" height="11" rx="4.5"
    fill="${bg}" stroke="${bs}" stroke-width="0.7"/>

  <!-- Upper trap / clavicle front -->
  <path d="M50,55 Q65,51 80,55 L80,62 Q65,58 50,62 Z"
    fill="${f('upper-trap')}" stroke="${s('upper-trap')}" stroke-width="0.7"/>

  <!-- Left pec -->
  <path d="M50,62 Q52,59 65,58 L65,80 Q56,84 49,77 Q47,71 50,62 Z"
    fill="${f('chest')}" stroke="${s('chest')}" stroke-width="0.7"/>
  <!-- Right pec -->
  <path d="M80,62 Q78,59 65,58 L65,80 Q74,84 81,77 Q83,71 80,62 Z"
    fill="${f('chest')}" stroke="${s('chest')}" stroke-width="0.7"/>
  <!-- Upper chest highlight -->
  <path d="M50,62 Q65,58 80,62 L80,65 Q65,61 50,65 Z"
    fill="${f('upper-chest')}" stroke="${s('upper-chest')}" stroke-width="0.6"/>

  <!-- Left front delt -->
  <path d="M50,62 Q42,57 37,65 Q34,73 39,80 Q45,83 50,76 Z"
    fill="${f('front-delt')}" stroke="${s('front-delt')}" stroke-width="0.7"/>
  <!-- Right front delt -->
  <path d="M80,62 Q88,57 93,65 Q96,73 91,80 Q85,83 80,76 Z"
    fill="${f('front-delt')}" stroke="${s('front-delt')}" stroke-width="0.7"/>

  <!-- Left lateral delt -->
  <path d="M37,65 Q32,70 32,79 Q33,85 38,87 Q41,83 39,80 Q34,73 37,65 Z"
    fill="${f('mid-delt')}" stroke="${s('mid-delt')}" stroke-width="0.7"/>
  <!-- Right lateral delt -->
  <path d="M93,65 Q98,70 98,79 Q97,85 92,87 Q89,83 91,80 Q96,73 93,65 Z"
    fill="${f('mid-delt')}" stroke="${s('mid-delt')}" stroke-width="0.7"/>

  <!-- Abs 6-pack -->
  <rect x="57" y="80" width="7" height="7" rx="2.5" fill="${bg}" stroke="rgba(255,255,255,0.11)" stroke-width="0.6"/>
  <rect x="66" y="80" width="7" height="7" rx="2.5" fill="${bg}" stroke="rgba(255,255,255,0.11)" stroke-width="0.6"/>
  <rect x="57" y="89" width="7" height="7" rx="2.5" fill="${bg}" stroke="rgba(255,255,255,0.10)" stroke-width="0.6"/>
  <rect x="66" y="89" width="7" height="7" rx="2.5" fill="${bg}" stroke="rgba(255,255,255,0.10)" stroke-width="0.6"/>
  <rect x="57" y="98" width="7" height="7" rx="2.5" fill="${bg}" stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/>
  <rect x="66" y="98" width="7" height="7" rx="2.5" fill="${bg}" stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/>

  <!-- Left bicep -->
  <path d="M39,80 Q34,91 35,103 Q37,111 43,112 Q50,112 52,103 Q52,90 48,80 Z"
    fill="${f('bicep')}" stroke="${s('bicep')}" stroke-width="0.7"/>
  <!-- Right bicep -->
  <path d="M91,80 Q96,91 95,103 Q93,111 87,112 Q80,112 78,103 Q78,90 82,80 Z"
    fill="${f('bicep')}" stroke="${s('bicep')}" stroke-width="0.7"/>

  <!-- Left forearm -->
  <path d="M35,103 Q32,116 33,128 Q35,134 41,135 Q47,135 50,128 Q52,116 52,103 Z"
    fill="${bg}" stroke="rgba(255,255,255,0.09)" stroke-width="0.7"/>
  <!-- Right forearm -->
  <path d="M95,103 Q98,116 97,128 Q95,134 89,135 Q83,135 80,128 Q78,116 78,103 Z"
    fill="${bg}" stroke="rgba(255,255,255,0.09)" stroke-width="0.7"/>

  <!-- Hip front -->
  <path d="M50,112 Q65,116 80,112 L82,124 Q65,129 48,124 Z"
    fill="${bg}" stroke="${bs}" stroke-width="0.7"/>

  <!-- Left quad -->
  <path d="M48,124 Q41,135 41,158 Q43,170 51,171 Q59,171 61,160 Q63,147 63,124 Z"
    fill="${f('quad')}" stroke="${s('quad')}" stroke-width="0.7"/>
  <!-- Right quad -->
  <path d="M82,124 Q89,135 89,158 Q87,170 79,171 Q71,171 69,160 Q67,147 67,124 Z"
    fill="${f('quad')}" stroke="${s('quad')}" stroke-width="0.7"/>

  <!-- Knee L/R -->
  <ellipse cx="52" cy="175" rx="9" ry="6" fill="${bg}" stroke="${bs}" stroke-width="0.7"/>
  <ellipse cx="78" cy="175" rx="9" ry="6" fill="${bg}" stroke="${bs}" stroke-width="0.7"/>

  <!-- Left calf front -->
  <path d="M43,181 Q40,197 41,214 Q43,222 51,223 Q58,223 60,214 Q61,197 61,181 Z"
    fill="${f('calf')}" stroke="${s('calf')}" stroke-width="0.7"/>
  <!-- Right calf front -->
  <path d="M87,181 Q90,197 89,214 Q87,222 79,223 Q72,223 70,214 Q69,197 69,181 Z"
    fill="${f('calf')}" stroke="${s('calf')}" stroke-width="0.7"/>

  <!-- ═══ BACK (offset +130) ═══ -->
  <text x="195" y="11" text-anchor="middle" font-size="7" font-weight="700"
    letter-spacing="0.12em" fill="rgba(100,115,140,0.8)">BACK</text>

  <!-- Body silhouette back -->
  <path d="M190,6 Q179,9 177,20 Q174,31 180,40 Q183,44 190,46
           L190,54 Q183,55 179,58 Q171,62 166,68 Q162,74 163,82
           L162,112 Q163,116 166,118 L166,132 Q164,142 165,156
           Q166,164 171,168 L169,192 Q167,204 168,218
           Q170,226 176,230 L184,230 Q188,226 189,222
           L192,186 L198,186 L201,222 Q202,226 206,230
           L214,230 Q220,226 222,218 Q223,204 221,192
           L219,168 Q224,164 225,156 Q226,142 224,132
           L224,118 Q227,116 228,112 L227,82 Q228,74 224,68
           Q219,62 211,58 Q207,55 200,54 L200,46
           Q207,44 210,40 Q216,31 213,20 Q211,9 200,6 Q195,4 190,6 Z"
    fill="${bg}" stroke="${bs}" stroke-width="0.9"/>

  <!-- Head back -->
  <ellipse cx="195" cy="27" rx="15" ry="20" fill="${bg}" stroke="${bs}" stroke-width="0.8"/>
  <!-- Neck back -->
  <rect x="189.5" y="44" width="11" height="11" rx="4.5"
    fill="${bg}" stroke="${bs}" stroke-width="0.7"/>

  <!-- Upper trap back (diamond) -->
  <path d="M181,55 Q195,49 209,55 L208,67 Q195,62 182,67 Z"
    fill="${f('upper-trap')}" stroke="${s('upper-trap')}" stroke-width="0.7"/>
  <!-- Mid trap -->
  <path d="M182,67 Q195,62 208,67 L207,78 Q195,74 183,78 Z"
    fill="${f('mid-trap')}" stroke="${s('mid-trap')}" stroke-width="0.7"/>

  <!-- Left rear delt -->
  <path d="M181,63 Q173,58 168,66 Q165,74 170,81 Q176,84 181,77 Z"
    fill="${f('rear-delt')}" stroke="${s('rear-delt')}" stroke-width="0.7"/>
  <!-- Right rear delt -->
  <path d="M209,63 Q217,58 222,66 Q225,74 220,81 Q214,84 209,77 Z"
    fill="${f('rear-delt')}" stroke="${s('rear-delt')}" stroke-width="0.7"/>

  <!-- Left lat (wing) -->
  <path d="M182,67 Q172,81 171,98 Q174,108 183,109 L184,78 Z"
    fill="${f('lat')}" stroke="${s('lat')}" stroke-width="0.7"/>
  <!-- Right lat (wing) -->
  <path d="M208,67 Q218,81 219,98 Q216,108 207,109 L206,78 Z"
    fill="${f('lat')}" stroke="${s('lat')}" stroke-width="0.7"/>

  <!-- Lower back / erector spinae -->
  <rect x="189" y="96" width="5.5" height="19" rx="2.5"
    fill="${f('lower-back')}" stroke="${s('lower-back')}" stroke-width="0.7"/>
  <rect x="196" y="96" width="5.5" height="19" rx="2.5"
    fill="${f('lower-back')}" stroke="${s('lower-back')}" stroke-width="0.7"/>

  <!-- Left tricep -->
  <path d="M170,81 Q165,92 166,105 Q168,113 174,114 Q180,114 182,105 Q182,92 178,81 Z"
    fill="${f('tricep')}" stroke="${s('tricep')}" stroke-width="0.7"/>
  <!-- Right tricep -->
  <path d="M220,81 Q225,92 224,105 Q222,113 216,114 Q210,114 208,105 Q208,92 212,81 Z"
    fill="${f('tricep')}" stroke="${s('tricep')}" stroke-width="0.7"/>

  <!-- Left forearm back -->
  <path d="M166,105 Q163,118 164,130 Q166,136 172,137 Q178,137 180,130 Q182,118 182,105 Z"
    fill="${bg}" stroke="rgba(255,255,255,0.09)" stroke-width="0.7"/>
  <!-- Right forearm back -->
  <path d="M224,105 Q227,118 226,130 Q224,136 218,137 Q212,137 210,130 Q208,118 208,105 Z"
    fill="${bg}" stroke="rgba(255,255,255,0.09)" stroke-width="0.7"/>

  <!-- Hip back -->
  <path d="M180,112 Q195,116 210,112 L212,124 Q195,129 178,124 Z"
    fill="${bg}" stroke="${bs}" stroke-width="0.7"/>

  <!-- Left glute -->
  <path d="M178,124 Q170,135 171,150 Q173,161 181,161 Q189,161 189,150 Q188,135 188,124 Z"
    fill="${f('glute')}" stroke="${s('glute')}" stroke-width="0.7"/>
  <!-- Right glute -->
  <path d="M212,124 Q220,135 219,150 Q217,161 209,161 Q201,161 201,150 Q201,135 202,124 Z"
    fill="${f('glute')}" stroke="${s('glute')}" stroke-width="0.7"/>

  <!-- Left hamstring -->
  <path d="M181,161 Q174,172 174,187 Q175,198 182,199 Q189,199 190,187 Q190,172 188,161 Z"
    fill="${f('hamstring')}" stroke="${s('hamstring')}" stroke-width="0.7"/>
  <!-- Right hamstring -->
  <path d="M209,161 Q216,172 216,187 Q215,198 208,199 Q201,199 200,187 Q200,172 202,161 Z"
    fill="${f('hamstring')}" stroke="${s('hamstring')}" stroke-width="0.7"/>

  <!-- Knee back L/R -->
  <ellipse cx="182" cy="203" rx="9" ry="6" fill="${bg}" stroke="${bs}" stroke-width="0.7"/>
  <ellipse cx="208" cy="203" rx="9" ry="6" fill="${bg}" stroke="${bs}" stroke-width="0.7"/>

  <!-- Left gastrocnemius (calf back) -->
  <path d="M174,209 Q170,225 171,238 Q173,246 181,246 Q188,246 190,238 Q191,225 190,209 Z"
    fill="${f('calf')}" stroke="${s('calf')}" stroke-width="0.7"/>
  <!-- Right gastrocnemius -->
  <path d="M216,209 Q220,225 219,238 Q217,246 209,246 Q202,246 200,238 Q199,225 200,209 Z"
    fill="${f('calf')}" stroke="${s('calf')}" stroke-width="0.7"/>

  </svg>`;
}

/* ══════════════════════════════════════════════
   RECOVERY LEGEND
   ══════════════════════════════════════════════ */

/**
 * Build HTML legend for the body heatmap.
 * @param {Object<string, number>} scores — muscle fatigue scores
 * @returns {string} HTML string
 */
export function buildLegend(scores) {
  const groups = [
    {
      label: 'Chest & Shoulders',
      muscles: ['chest', 'upper-chest', 'front-delt', 'mid-delt', 'rear-delt'],
    },
    { label: 'Back & Traps', muscles: ['lat', 'mid-trap', 'upper-trap', 'lower-back'] },
    { label: 'Arms', muscles: ['bicep', 'tricep', 'brachialis'] },
    { label: 'Legs', muscles: ['quad', 'hamstring', 'glute', 'calf'] },
  ];

  return groups
    .map((g) => {
      const max = Math.max(...g.muscles.map((m) => scores[m] || 0));
      const color = Heatmap.scoreColor(max);
      const label = Heatmap.scoreLabel(max);
      const hours = max > 0.05 ? Math.round((1 - max) * 72) + 'h to recover' : 'Ready';

      return `
      <div class="legend-row">
        <div class="legend-dot" style="background:${color || 'rgba(0,230,118,0.4)'}"></div>
        <div class="legend-info">
          <span class="legend-group">${g.label}</span>
          <span class="legend-status" style="color:${color || 'var(--c-accent)'}">
            ${label}
          </span>
        </div>
        <span class="legend-hours">${hours}</span>
      </div>`;
    })
    .join('');
}

/* ══════════════════════════════════════════════
   CLAUDE ASSISTANT — AI Coach view layer
   ══════════════════════════════════════════════ */

export const Claude = (() => {
  /**
   * Render the floating action button for the AI coach.
   * @returns {void}
   */
  function renderFAB() {
    if (document.getElementById('claude-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'claude-fab';
    fab.className = 'claude-fab';
    fab.setAttribute('aria-label', 'AI Coach');

    // Try video first, fall back to static image, then icon
    const vid = document.createElement('video');
    vid.src = 'assets/panda-idle.mp4';
    vid.autoplay = true;
    vid.loop = true;
    vid.muted = true;
    vid.playsInline = true;
    vid.setAttribute('playsinline', '');
    vid.onerror = () => {
      // Fallback: try static image
      const img = document.createElement('img');
      img.src = 'assets/panda-idle.png';
      img.alt = 'AI Coach';
      img.onerror = () => {
        fab.innerHTML = _claudeIcon();
      };
      fab.innerHTML = '';
      fab.appendChild(img);
    };
    fab.appendChild(vid);

    fab.addEventListener('click', open);
    document.body.appendChild(fab);

    // Anchor FAB above nav bar — works in any window/fullscreen mode
    function _snapFAB() {
      const nav = document.getElementById('nav');
      if (!nav || !fab) return;
      const navH = nav.offsetHeight;
      fab.style.bottom = navH + 10 + 'px';
      fab.style.right = '16px';
    }
    _snapFAB();
    window.addEventListener('resize', _snapFAB);
    document.addEventListener('fullscreenchange', _snapFAB);
  }

  /**
   * Open the AI coach panel.
   * @returns {Promise<void>}
   */
  async function open() {
    if (ClaudeState.isOpen) return;
    ClaudeState.isOpen = true;
    ClaudeState.chatHistory = [];

    const [workouts, orms, scores] = await Promise.all([
      DB.Workouts.getLast(5),
      DB.OneRM.getAll(),
      Heatmap.compute(),
    ]);
    ClaudeState.context = { workouts, orms, scores };

    const overlay = document.createElement('div');
    overlay.id = 'claude-overlay';
    overlay.className = 'claude-overlay';

    overlay.innerHTML = `
      <div class="claude-sheet" id="claude-sheet">
        <div class="modal-handle"></div>

        <!-- Header -->
        <div class="claude-header">
          <div class="claude-logo-wrap">
            ${_claudeIcon(28)}
            <div>
              <div class="claude-title">Claude Coach</div>
              <div class="claude-sub">Powered by Claude Opus</div>
            </div>
          </div>
          <button class="btn-icon-sm" onclick="Claude.close()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.5" stroke-linecap="round" width="18" height="18">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Muscle Heatmap -->
        <div class="section-header" style="margin-top:var(--sp-2)">
          <span class="section-label">Muscle Recovery Map</span>
          <span class="badge badge-purple">72h window</span>
        </div>
        <div class="heatmap-card">
          ${buildBodySVG(scores)}
          <div class="heatmap-legend">
            ${buildLegend(scores)}
          </div>
        </div>

        <!-- Legend scale -->
        <div class="heat-scale">
          <div class="heat-scale-bar"></div>
          <div class="heat-scale-labels">
            <span>Fresh</span><span>Warm</span><span>Fatigued</span><span>Heavy</span>
          </div>
        </div>

        <!-- AI Coach recommendation -->
        <div class="section-header" style="margin-top:var(--sp-2)">
          <span class="section-label">AI Recommendation</span>
          <span class="badge badge-purple">Claude Opus</span>
        </div>
        <div class="coach-card" id="coach-card">
          <div class="ai-thinking" id="ai-thinking">
            <div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div>
          </div>
          <div class="ai-text" id="ai-text"></div>
        </div>

        <!-- Follow-up chat -->
        <div class="chat-history" id="chat-history"></div>

        <!-- Next session -->
        ${_buildNextSession(workouts, scores)}

        <!-- 1RM Progress -->
        ${orms.length ? _buildORMProgress(orms) : ''}

        <!-- Chat input -->
        <div class="chat-input-wrap">
          <input type="text" id="coach-input" class="chat-input"
                 placeholder="Ask your coach anything...">
          <button id="coach-send" class="chat-send-btn" onclick="Claude._sendChat()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                 width="15" height="15">
              <line x1="12" y1="19" x2="12" y2="5"/>
              <polyline points="5 12 12 5 19 12"/>
            </svg>
          </button>
        </div>

        <div style="height:var(--sp-3)"></div>
      </div>`;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    requestAnimationFrame(() => {
      overlay.classList.add('visible');
      // Start AI fetch after slide-up animation — null = initial load
      setTimeout(() => _doFetchCoach(null), 450);
    });

    // Enter key support for chat input
    setTimeout(() => {
      const inp = document.getElementById('coach-input');
      if (inp)
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') _sendChat();
        });
    }, 200);
  }

  /**
   * Close the AI coach panel.
   * @returns {void}
   */
  function close() {
    ClaudeState.isOpen = false;
    const overlay = document.getElementById('claude-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 350);
  }

  /**
   * Send a chat message (called from onclick in template HTML).
   * @returns {Promise<void>}
   */
  async function _sendChat() {
    const input = document.getElementById('coach-input');
    const sendBtn = document.getElementById('coach-send');
    if (!input || ClaudeState.isStreaming) return;

    const message = input.value.trim();
    if (!message) return;

    input.value = '';
    if (sendBtn) sendBtn.disabled = true;

    await _doFetchCoach(message);

    if (sendBtn) sendBtn.disabled = false;
    input.focus();
  }

  /**
   * Internal: orchestrate DOM updates and delegate streaming to fetchCoach store function.
   * @param {string|null} message — user message, or null for initial panel load
   * @returns {Promise<void>}
   */
  async function _doFetchCoach(message) {
    if (ClaudeState.isStreaming) return;

    /** @type {HTMLElement|null} */
    let targetEl = null;

    if (message === null) {
      // Initial load — stream into #ai-text
      const thinking = document.getElementById('ai-thinking');
      if (thinking) thinking.style.display = 'flex';
      targetEl = document.getElementById('ai-text');
    } else {
      // Follow-up — append bubbles to #chat-history
      const hist = document.getElementById('chat-history');
      if (!hist) return;

      const userBubble = document.createElement('div');
      userBubble.className = 'chat-msg user-msg';
      userBubble.textContent = message;
      hist.appendChild(userBubble);

      const aiBubble = document.createElement('div');
      aiBubble.className = 'chat-msg ai-msg thinking';
      aiBubble.innerHTML =
        '<div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div>';
      hist.appendChild(aiBubble);
      targetEl = aiBubble;

      const sheet = document.getElementById('claude-sheet');
      if (sheet) sheet.scrollTop = sheet.scrollHeight;
    }

    await fetchCoach(message, {
      onText: (text) => {
        if (!targetEl) return;
        targetEl.textContent += text;
        const sheet = document.getElementById('claude-sheet');
        if (sheet) sheet.scrollTop = sheet.scrollHeight;
      },
      onDone: (_fullText) => {
        // Clear thinking state for initial load
        if (message === null) {
          const thinking = document.getElementById('ai-thinking');
          if (thinking) thinking.style.display = 'none';
        } else if (targetEl) {
          targetEl.className = 'chat-msg ai-msg';
        }
      },
      onError: (errMessage) => {
        const isOffline =
          errMessage.includes('fetch') || errMessage.includes('Failed to fetch');
        const errHtml = isOffline
          ? `<span class="ai-error">Start the server to enable AI Coach: <code>npm start</code></span>`
          : `<span class="ai-error">Error: ${errMessage}</span>`;

        if (message === null) {
          const thinking = document.getElementById('ai-thinking');
          const textEl = document.getElementById('ai-text');
          if (thinking) thinking.style.display = 'none';
          if (textEl) textEl.innerHTML = errHtml;
        } else if (targetEl) {
          targetEl.className = 'chat-msg ai-msg';
          targetEl.innerHTML = errHtml;
        }
      },
    });

    // Restore thinking-cleared state for initial fetch on success
    if (message === null) {
      const thinking = document.getElementById('ai-thinking');
      if (thinking && thinking.style.display !== 'none') {
        thinking.style.display = 'none';
      }
    }
  }

  // Private helpers

  function _buildNextSession(workouts, scores) {
    if (!workouts.length) return '';

    const last = workouts[0];
    const nextType = { push: 'pull', pull: 'legs', legs: 'push' }[last?.type] || 'push';
    const plan = JSON.parse(localStorage.getItem('ap-custom-plan') || 'null');
    const exercises = plan?.[nextType] || [];

    if (!exercises.length) return '';

    return `
      <div class="section-header" style="margin-top:var(--sp-2)">
        <span class="section-label">Next Session Preview</span>
        <button class="btn-text" onclick="Claude.close();Nav.go('s-train')">Start</button>
      </div>
      <div class="next-session-card">
        ${exercises
          .slice(0, 4)
          .map(
            (ex) => `
          <div class="next-ex-row">
            <div class="next-ex-dot" style="background:${
              nextType === 'push'
                ? 'var(--c-accent)'
                : nextType === 'pull'
                  ? 'var(--c-purple)'
                  : 'var(--c-blue)'
            }"></div>
            <span class="next-ex-name">${ex.name}</span>
            <span class="next-ex-meta">${ex.sets}×${ex.reps} @ ${ex.weight}kg</span>
          </div>`
          )
          .join('')}
        ${exercises.length > 4 ? `<div class="next-ex-more">+${exercises.length - 4} more exercises</div>` : ''}
      </div>`;
  }

  function _buildORMProgress(orms) {
    const key3 = orms.sort((a, b) => b.value - a.value).slice(0, 3);
    return `
      <div class="section-header" style="margin-top:var(--sp-2)">
        <span class="section-label">Top Lifts</span>
        <span class="badge badge-purple">Estimated 1RM</span>
      </div>
      <div class="top-lifts-card">
        ${key3
          .map(
            (o, i) => `
          <div class="top-lift-row">
            <span class="top-lift-rank">#${i + 1}</span>
            <span class="top-lift-name">${o.id}</span>
            <span class="top-lift-val">${o.value} <span style="font-size:10px;color:var(--c-text-3)">kg</span></span>
          </div>`
          )
          .join('')}
      </div>`;
  }

  function _claudeIcon(size = 22) {
    return `<svg class="claude-icon" width="${size}" height="${size}"
      viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="12" fill="#CC785C"/>
      <path d="M13 27L20 13L27 27M16 22.5H24"
        stroke="white" stroke-width="2.2"
        stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  return { renderFAB, open, close, _sendChat };
})();
