// @ts-check
import { COMPUTE_REST_HOURS, Heatmap, MUSCLE_MAP } from './claude.store.js';
import { DB } from './db.js';
import { esc, haptic } from './shared/utils.js';
import { toUserMessage } from './shared/errors-ui.js';
import { State as WorkoutState } from './workout.store.js';
import { Toast } from './shell.js';
import { on } from './events.js';
import { flag } from './flags.js';

on('claude:dismissFAB', (el, e) => { e.stopPropagation(); window.Claude?.dismissFAB(); });

const ICON_SND_ON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>`;
const ICON_SND_OFF = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/><line x1="16" y1="9" x2="22" y2="15"/><line x1="22" y1="9" x2="16" y2="15"/></svg>`;

on('claude:toggleSound', (el, e) => {
  e.stopPropagation();
  const v = document.getElementById('claude-fab-video');
  if (!(v instanceof HTMLVideoElement)) return;
  haptic(10);
  v.muted = !v.muted;
  v.volume = 1;
  v.play().catch(() => {});
  el.innerHTML = v.muted ? ICON_SND_OFF : ICON_SND_ON;
  el.classList.toggle('on', !v.muted);
  el.setAttribute('aria-pressed', v.muted ? 'false' : 'true');
});

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

    const videoMode = flag('fab-video');

    container.innerHTML = `
      <div style="position:relative; pointer-events:auto">
        <div class="fab-close-btn" data-action="claude:dismissFAB" title="Hide Assistant" style="opacity:1; transform:scale(1); top:-10px; right:-10px; pointer-events:auto">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </div>
        ${videoMode ? `<button type="button" class="fab-sound-btn" data-action="claude:toggleSound" title="Sound" aria-label="Toggle sound" aria-pressed="false" style="top:-10px; left:-10px">${ICON_SND_OFF}</button>` : ''}
        <button id="claude-fab" class="claude-fab ${isGemini ? 'gemini-mode' : ''} ${glowClass} ${videoMode ? 'video-mode' : ''}" aria-label="AI Assistant" style="margin:0">
          <div class="ai-status-wrap">
            <span class="ai-indicator ${hasKey ? 'active' : 'missing'}"></span>
          </div>
          <div class="fab-content">
          </div>
        </button>
      </div>
    `;

      const fab = container.querySelector('#claude-fab');
      const content = container.querySelector('.fab-content');
      if (content) {
        if (videoMode) {
          content.innerHTML = `<video id="claude-fab-video" class="fab-video" autoplay loop muted playsinline preload="auto" src="assets/panda-voice.mp4" aria-hidden="true"></video>`;
        } else {
          content.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="24" height="24">
            <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2z"/><path d="M12 8v4"/><path d="M12 16h.01"/>
          </svg>`;
        }
      }

    fab.addEventListener('click', open);
    document.body.appendChild(container);
    if (videoMode) _initFabVideo(container);

    _initDraggable(container);
    _snapFAB(container);
    window.addEventListener('resize', () => _snapFAB(container));

    window.addEventListener('ap-nav-change', (e) => {
      // @ts-ignore
      if (e.detail && e.detail.id === 's-intel') {
        container.style.display = 'none';
      } else {
        container.style.display = '';
      }
    });
  }

  function _snapFAB(el) {
    const nav = document.getElementById('nav');
    const app = document.getElementById('app');
    if (!nav || !el) return;
    // DOM Reads
    const navH = nav.offsetHeight;
    const isAppWide = app && window.innerWidth > app.offsetWidth + 8;
    const rectRight = isAppWide ? app.getBoundingClientRect().right : 0;
    // DOM Writes
    el.style.bottom = navH + 14 + 'px';
    if (isAppWide) {
      el.style.right = (window.innerWidth - rectRight + 14) + 'px';
    } else {
      el.style.right = '14px';
    }
  }

  /**
   * Live panda mode (flag 'fab-video'): timecode-driven zoom + background pause.
   * The zoom follows video.currentTime, so it stays in sync with the voiceover
   * even across pause/resume. GPU transform only — no relayout.
   */
  function _initFabVideo(container) {
    const v = container.querySelector('#claude-fab-video');
    if (!(v instanceof HTMLVideoElement)) return;
    v.play().catch(() => { /* autoplay blocked (e.g. Low Power Mode) — gradient plate stays */ });

    const onVis = () => {
      if (!container.isConnected) { document.removeEventListener('visibilitychange', onVis); return; }
      if (document.hidden) v.pause();
      else v.play().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVis);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ZOOM_START = 4.5, ZOOM_SCALE = 1.35, IN_DUR = 1.2, OUT_DUR = 0.8;
    const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    let last = '';
    const tick = () => {
      if (!container.isConnected) return;
      requestAnimationFrame(tick);
      if (v.readyState < 2) return;
      const dur = v.duration || 10;
      const t = v.currentTime;
      let s = 1;
      if (t >= ZOOM_START) {
        const holdEnd = dur - OUT_DUR;
        if (t < ZOOM_START + IN_DUR) s = 1 + (ZOOM_SCALE - 1) * ease((t - ZOOM_START) / IN_DUR);
        else if (t < holdEnd) s = ZOOM_SCALE;
        else s = 1 + (ZOOM_SCALE - 1) * (1 - ease(Math.min(1, (t - holdEnd) / OUT_DUR)));
      }
      const next = `translateZ(0) scale(${s.toFixed(4)})`;
      if (last !== next) { last = next; v.style.transform = next; }
    };
    requestAnimationFrame(tick);
  }

  function _initDraggable(el) {
    let startX = 0, startY = 0;
    let moved = false;

    el.onpointerdown = (e) => {
      if (e.target.closest('.fab-close-btn') || e.target.closest('.fab-sound-btn')) return;
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
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        
        // 5px threshold to prevent swallowing taps on mobile due to finger jitter
        if (!moved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
          moved = true;
        }
        
        if (moved) {
          el.style.transform = `translate(${baseOffsetX + dx}px, ${baseOffsetY + dy}px)`;
        }
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
    // Redirection to the new Neural Command Center
    window.Nav.go('s-intel');
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
        onError: (err) => { aiBubble.innerHTML = `<div class="ai-error">${esc(toUserMessage(err))}</div>`; }
      }, { history: ClaudeState.chatHistory });
    } catch (e) {
      aiBubble.innerHTML = `<div class="ai-error">${esc(toUserMessage(e))}</div>`;
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
    return esc(text).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
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
      <path d="M50,112 Q65,116 80,112 L82,124 Q65,129 48,124 Z" fill="${f('quad')}" stroke="currentColor" stroke-width="1.5"/>
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
