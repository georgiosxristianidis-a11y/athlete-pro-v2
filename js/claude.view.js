// @ts-check
import { COMPUTE_REST_HOURS, Heatmap, MUSCLE_MAP } from './claude.store.js';
import { DB } from './db.js';
import { esc, haptic } from './shared/utils.js';
import { State as WorkoutState } from './workout.store.js';
import { Toast } from './shell.js';

/**
 * AI Assistant view layer.
 * Handles the floating assistant (FAB), chat panel, and muscle recovery heatmap.
 */
export const Claude = (() => {
  const ClaudeState = {
    isOpen: false,
    chatHistory: [],
    context: null
  };

  /* ══════════════════════════════════════════════
     FLOATING ACTION BUTTON (FAB)
     ══════════════════════════════════════════════ */

  /**
   * Render the persistent AI Panda assistant button.
   */
  async function renderFAB() {
    const isHidden = await DB.Settings.get('ai-panda-hidden', false);
    if (isHidden) return;
    if (document.getElementById('claude-fab-container')) return;

    const engine = await DB.Settings.get('ai-engine').catch(() => 'anthropic') || 'anthropic';
    const isGemini = engine === 'gemini';
    const hasKey = isGemini ? !!(await DB.Settings.get('gemini-key')) : true;

    // ── Create Container ──
    const container = document.createElement('div');
    container.id = 'claude-fab-container';
    container.style.position = 'fixed';
    container.style.zIndex = '500';
    container.style.pointerEvents = 'none'; // Only children have pointers

    // Status Logic
    let glowClass = isGemini ? '' : 'ai-glow-selection';
    if (isGemini && !hasKey) glowClass = 'ai-glow-error';

    container.innerHTML = `
      <div style="position:relative; pointer-events:auto">
        <div class="fab-close-btn" onclick="event.stopPropagation(); Claude.dismissFAB()" title="Hide Assistant" style="opacity:1; transform:scale(1); top:-10px; right:-10px; pointer-events:auto">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </div>
        <button id="claude-fab" class="claude-fab ${isGemini ? 'gemini-mode' : ''} ${glowClass}" aria-label="AI Assistant" style="margin:0">
          <div class="ai-status-wrap">
            <span class="ai-indicator ${hasKey ? 'active' : 'missing'}"></span>
          </div>
          <div class="fab-content">
            ${isGemini ? _geminiIcon() : _claudeIcon()}
          </div>
        </button>
      </div>
    `;

    const fab = container.querySelector('#claude-fab');
    const vid = document.createElement('video');
    vid.preload = 'none';
    vid.src = 'assets/panda-idle.mp4';
    vid.loop = true; vid.muted = true; vid.playsInline = true;
    vid.setAttribute('playsinline', '');
    
    vid.oncanplay = () => {
      const content = container.querySelector('.fab-content');
      if (content) { content.innerHTML = ''; content.appendChild(vid); vid.play(); }
    };
    vid.onerror = () => {
        const content = container.querySelector('.fab-content');
        if (content) content.innerHTML = isGemini ? _geminiIcon() : _claudeIcon();
    };

    requestIdleCallback(() => vid.load(), { timeout: 3000 });

    fab.addEventListener('click', open);
    document.body.appendChild(container);

    _initDraggable(container);
    _snapFAB(container);
    window.addEventListener('resize', () => _snapFAB(container));
  }

  function _snapFAB(el) {
    const nav = document.getElementById('nav');
    const app = document.getElementById('app');
    if (!nav || !el) return;
    const navH = nav.offsetHeight;
    el.style.bottom = navH + 14 + 'px';
    if (app && window.innerWidth > app.offsetWidth + 8) {
      const rect = app.getBoundingClientRect();
      el.style.right = (window.innerWidth - rect.right + 14) + 'px';
    } else {
      el.style.right = '14px';
    }
  }

  function _initDraggable(el) {
    let x = 0, y = 0, startX = 0, startY = 0;
    let moved = false;
    
    el.onpointerdown = (e) => {
      if (e.target.closest('.fab-close-btn')) return;
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      const style = window.getComputedStyle(el);
      const initialTransform = style.transform !== 'none' ? style.transform : 'matrix(1, 0, 0, 1, 0, 0)';
      const matrix = new DOMMatrix(initialTransform);
      const baseOffsetX = matrix.m41;
      const baseOffsetY = matrix.m42;

      moved = false;
      document.onpointermove = (ev) => {
        moved = true;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        el.style.transform = `translate(${baseOffsetX + dx}px, ${baseOffsetY + dy}px)`;
      };
      document.onpointerup = () => {
        document.onpointermove = null;
        document.onpointerup = null;
      };
    };
    
    el.addEventListener('click', (e) => {
      if (moved) {
        e.stopImmediatePropagation();
        moved = false;
      }
    }, true);
  }

  async function dismissFAB() {
    haptic(15);
    const el = document.getElementById('claude-fab-container');
    if (el) {
      el.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
      el.style.transform = 'scale(0) rotate(-90deg)';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 400);
    }
    await DB.Settings.set('ai-panda-hidden', true);
    await DB.Settings.set('show-mascot', 'off');
    Toast.show('Assistant hidden. Enable in Profile.', 'info');
  }

  /**
   * Open the AI coach panel.
   */
  async function open() {
    if (ClaudeState.isOpen) return;
    ClaudeState.isOpen = true;
    ClaudeState.chatHistory = [];

    const [workouts, orms, scores, engine] = await Promise.all([
      DB.Workouts.getLast(5),
      DB.OneRM.getAll(),
      Heatmap.compute(),
      DB.Settings.get('ai-engine').catch(() => 'anthropic'),
    ]);
    const isGemini = (engine || 'anthropic') === 'gemini';
    ClaudeState.context = { workouts, orms, scores };

    const overlay = document.createElement('div');
    overlay.id = 'claude-overlay';
    overlay.className = 'claude-overlay';

    overlay.innerHTML = `
      <div class="claude-sheet" id="claude-sheet">
        <div class="modal-handle"></div>
        <div class="claude-header">
          <div class="claude-logo-wrap" onclick="Claude._toggleEngine()" style="cursor:pointer">
            ${isGemini ? _geminiIcon(28) : _claudeIcon(28)}
            <div>
              <div class="claude-title">${isGemini ? 'Gemini Coach' : 'Claude Coach'}</div>
              <div class="claude-sub">${isGemini ? 'Powered by Gemini 1.5 Pro' : 'Powered by Claude Opus'}</div>
            </div>
          </div>
          <button class="btn-icon-sm" aria-label="Close AI Coach" onclick="Claude.close()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>

        <div class="heatmap-card">${buildBodySVG(scores)}</div>

        <div class="coach-card" id="coach-card">
          <div class="ai-thinking" id="ai-thinking">
            <div class="sk-lines"><div class="sk-line sk"></div><div class="sk-line sk"></div><div class="sk-line sk"></div></div>
          </div>
          <div class="ai-text" id="ai-text"></div>
        </div>

        <div class="chat-history" id="chat-history"></div>

        <div class="chat-input-wrap">
          <input type="text" class="chat-input" id="chat-input" placeholder="Ask your coach..." autocomplete="off">
          <button class="chat-send-btn" id="chat-send" onclick="Claude._sendChat()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
          </button>
        </div>
        <div style="height:var(--sp-3)"></div>
      </div>`;

    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('visible'), 10);
    document.getElementById('chat-input')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') _sendChat(); });

    _initialGreeting();
  }

  async function _initialGreeting() {
    const { context } = ClaudeState;
    const msg = `Based on your recent ${context.workouts.length} workouts, I'm ready to help. What's on your mind?`;
    document.getElementById('ai-thinking')?.remove();
    const txt = document.getElementById('ai-text');
    if (txt) txt.textContent = msg;
  }

  async function _sendChat() {
    const input = /** @type {HTMLInputElement} */ (document.getElementById('chat-input'));
    const text = input?.value.trim();
    if (!text) return;
    input.value = '';
    haptic(10);

    const hist = document.getElementById('chat-history');
    const userMsg = document.createElement('div');
    userMsg.className = 'chat-msg user-msg';
    userMsg.textContent = text;
    hist?.appendChild(userMsg);
    hist?.scrollTo(0, hist.scrollHeight);

    const aiBubble = document.createElement('div');
    aiBubble.className = 'chat-msg ai-msg thinking';
    aiBubble.innerHTML = `<div class="sk-lines" style="gap:5px"><div class="sk-line sk" style="height:10px;width:100%"></div><div class="sk-line sk" style="height:10px;width:70%"></div></div>`;
    hist?.appendChild(aiBubble);

    try {
      const { fetchCoach } = await import('./claude.store.js');
      let aiText = '';
      await fetchCoach(text, {
        onText: (chunk) => {
          aiBubble.classList.remove('thinking');
          aiText += chunk;
          aiBubble.innerHTML = _markdownToHtml(aiText);
          hist?.scrollTo(0, hist.scrollHeight);
        },
        onDone: () => { ClaudeState.chatHistory.push({ role: 'user', content: text }, { role: 'assistant', content: aiText }); },
        onError: (err) => { aiBubble.innerHTML = `<div class="ai-error">${err}</div>`; }
      }, { history: ClaudeState.chatHistory });
    } catch (e) {
      aiBubble.innerHTML = '<div class="ai-error">Failed to connect to coach.</div>';
    }
  }

  function close() {
    const overlay = document.getElementById('claude-overlay');
    if (overlay) {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 350);
    }
    ClaudeState.isOpen = false;
  }

  function _markdownToHtml(text) {
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  }

  function _claudeIcon(size = 32) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none"><path d="M16 4L22 16L16 28L10 16L16 4Z" fill="var(--c-accent)"/></svg>`;
  }
  function _geminiIcon(size = 32) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none"><path d="M16 4L28 16L16 28L4 16L16 4Z" fill="#448aff"/></svg>`;
  }

  function buildBodySVG(scores) {
    const f = (m) => scores[m] > 50 ? 'rgba(232,132,140,0.8)' : (scores[m] > 20 ? 'rgba(255,179,0,0.6)' : 'rgba(0,230,118,0.3)');
    return `<svg class="body-svg" viewBox="0 0 260 240">
      <path d="M50,112 Q65,116 80,112 L82,124 Q65,129 48,124 Z" fill="${f('quad')}" stroke="currentColor" stroke-width="0.5"/>
      <text x="130" y="230" text-anchor="middle" font-size="10" fill="var(--c-text-3)">Recovery Heatmap</text>
    </svg>`;
  }

  async function _toggleEngine() {
    const isGem = (await DB.Settings.get('ai-engine')) === 'gemini';
    await DB.Settings.set('ai-engine', isGem ? 'anthropic' : 'gemini');
    haptic(10);
    close();
    setTimeout(renderFAB, 100);
  }

  return { renderFAB, open, close, _sendChat, _claudeIcon, _geminiIcon, dismissFAB, _snapFAB, _toggleEngine };
})();

window.Claude = Claude;
