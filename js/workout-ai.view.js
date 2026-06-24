// @ts-check
/* ════════════════════════════════════════════════════════
   workout-ai.view.js — In-workout AI view layer
   AI bubble, mini chat overlay, quick actions
   ════════════════════════════════════════════════════════ */

import { fetchCoach, Heatmap } from './claude.store.js';
import { State as WorkoutState } from './workout.store.js';
import { DB } from './db.js';
import { esc } from './shared/utils.js';
import { toUserMessage } from './shared/errors-ui.js';
import { on, onKeydown } from './events.js';

on('wai:toggle',     () => toggle());
on('wai:hideBubble', (el, e) => { e.stopPropagation(); hideBubble(); });
on('wai:quickAsk',   (el) => quickAsk(el.dataset.q));
on('wai:send',       () => send());
onKeydown('wai:key', (el, e) => handleKey(e));

/* ══════════════════════════════════════════════
   STATE
   ══════════════════════════════════════════════ */

let _chatOpen = false;
let _chatHistory = [];
let _streaming = false;

/* ══════════════════════════════════════════════
   QUICK QUESTIONS
   ══════════════════════════════════════════════ */

const QUICK_QUESTIONS = {
  weight: 'What weight should I use for this set?',
  form: 'Give me form cues for this exercise',
  rest: 'How long should I rest between sets?',
  plateau: 'I\'m stuck at the same weight — what should I do?'
};

/* ══════════════════════════════════════════════
   INITIALIZATION
   ══════════════════════════════════════════════ */

/**
 * Initialize in-workout AI — render bubble and chat overlay.
 */
export function init() {
  _renderBubble();
  _renderChatOverlay();
  // _checkProactiveTrigger() — TODO: proactive AI suggestions (not implemented yet)
}

/**
 * Render AI bubble (hidden by default).
 */
function _renderBubble() {
  if (document.getElementById('workout-ai-bubble')) return;

  const bubble = document.createElement('div');
  bubble.id = 'workout-ai-bubble';
  bubble.className = 'workout-ai-bubble';
  bubble.hidden = true;
  bubble.innerHTML = `
    <button class="bubble-main" data-action="wai:toggle" aria-label="Open AI coach">
      <svg class="bubble-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
        <path d="M12 2L13.5 7.5L19 9L13.5 10.5L12 16L10.5 10.5L5 9L10.5 7.5L12 2Z"/>
        <path d="M19 14L19.7 16L21.5 16.5L19.7 17L19 19L18.3 17L16.5 16.5L18.3 16L19 14Z"/>
      </svg>
    </button>
    <button class="bubble-close" aria-label="Dismiss coach"
      data-action="wai:hideBubble">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
           stroke-linecap="round" width="9" height="9">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>`;

  document.body.appendChild(bubble);
}

/**
 * Render mini chat overlay.
 */
function _renderChatOverlay() {
  if (document.getElementById('workout-ai-chat')) return;

  const chat = document.createElement('div');
  chat.id = 'workout-ai-chat';
  chat.className = 'workout-ai-chat';
  chat.hidden = true;

  chat.innerHTML = `
    <div class="chat-header">
      <span class="chat-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
             stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
          <path d="M12 2L13.5 7.5L19 9L13.5 10.5L12 16L10.5 10.5L5 9L10.5 7.5L12 2Z"/>
        </svg>
        Coach
      </span>
      <button class="btn-icon-sm" data-action="wai:toggle" aria-label="Close coach">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
             stroke-linecap="round" width="16" height="16">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div class="chat-messages" id="workout-ai-messages"></div>
    <div class="quick-actions">
      <button class="quick-action-chip" data-action="wai:quickAsk" data-q="weight">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
             stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
          <line x1="6.5" y1="12" x2="17.5" y2="12"/>
          <rect x="3" y="9" width="3" height="6" rx="1"/>
          <rect x="18" y="9" width="3" height="6" rx="1"/>
        </svg>
        Weight
      </button>
      <button class="quick-action-chip" data-action="wai:quickAsk" data-q="form">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
             stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
          <rect x="5" y="3" width="14" height="18" rx="2"/>
          <line x1="9" y1="9" x2="15" y2="9"/>
          <line x1="9" y1="13" x2="15" y2="13"/>
          <line x1="9" y1="17" x2="13" y2="17"/>
        </svg>
        Form
      </button>
      <button class="quick-action-chip" data-action="wai:quickAsk" data-q="rest">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
             stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
          <circle cx="12" cy="12" r="9"/>
          <polyline points="12 7 12 12 15 14"/>
        </svg>
        Rest
      </button>
    </div>
    <div class="chat-input-row">
      <input
        type="text"
        id="workout-ai-input"
        class="chat-input"
        placeholder="Ask about this set..."
        data-keydown="wai:key"
      />
      <button class="btn-icon-sm" data-action="wai:send" aria-label="Send">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
          <line x1="12" y1="19" x2="12" y2="5"/>
          <polyline points="5 12 12 5 19 12"/>
        </svg>
      </button>
    </div>
  `;

  document.body.appendChild(chat);
}

/* ══════════════════════════════════════════════
   PROACTIVE TRIGGER
   ══════════════════════════════════════════════ */

/**
 * Check if AI should show proactive suggestion.
 */
export async function checkProactiveTrigger() {
  if (WorkoutState.phase !== 'active' || !WorkoutState.plan) {
    hideBubble();
    return;
  }

  const plan = WorkoutState.plan;
  let suggestion = null;

  // Check for first set of first exercise
  for (const ex of plan) {
    const doneSets = (ex.sets || []).filter(s => s.done).length;
    if (doneSets === 0) {
      suggestion = `Starting **${ex.name}** today — focus on controlled tempo: 3s down, 1s pause, explosive up.`;
      break;
    }
  }

  // Check for plateau (same weight 3+ sessions)
  if (!suggestion) {
    const history = await DB.Workouts.getAll();
    const firstExercise = plan[0]?.name;
    if (firstExercise) {
      const sameExerciseHistory = history.filter(w =>
        (w.exercises || []).some(e => e.name === firstExercise)
      );

      if (sameExerciseHistory.length >= 3) {
        const lastWeights = sameExerciseHistory.slice(-3).map(w => {
          const ex = w.exercises.find(e => e.name === firstExercise);
          return ex?.sets?.[0]?.weight || 0;
        });

        const allSame = lastWeights.every((w, _, arr) => Math.abs(w - arr[0]) < 0.5);
        if (allSame) {
          suggestion = `You've hit **${firstExercise}** at the same weight for 3 sessions. Try a deload or technique variation?`;
        }
      }
    }
  }

  // Update bubble visibility
  const bubble = document.getElementById('workout-ai-bubble');
  if (bubble && suggestion) {
    bubble.hidden = false;
    bubble.style.opacity = '1';
    bubble.style.transform = 'scale(1)';
    // Store suggestion for chat
    _chatHistory = [{ role: 'assistant', content: suggestion }];
  } else if (bubble) {
    hideBubble();
  }
}

/* ══════════════════════════════════════════════
   BUBBLE VISIBILITY
   ══════════════════════════════════════════════ */

/**
 * Show AI bubble.
 */
export function showBubble() {
  const bubble = document.getElementById('workout-ai-bubble');
  if (bubble) {
    bubble.hidden = false;
    bubble.style.opacity = '1';
    bubble.style.transform = 'scale(1)';
  }
}

/**
 * Hide AI bubble.
 */
export function hideBubble() {
  const bubble = document.getElementById('workout-ai-bubble');
  if (bubble) {
    bubble.style.opacity = '0';
    bubble.style.transform = 'scale(0.8)';
    setTimeout(() => {
      bubble.hidden = true;
    }, 300);
  }
}

/* ══════════════════════════════════════════════
   CHAT TOGGLE
   ══════════════════════════════════════════════ */

/**
 * Toggle mini chat overlay.
 */
export function toggle() {
  const chat = document.getElementById('workout-ai-chat');
  if (!chat) return;

  _chatOpen = !chat.hidden;
  chat.hidden = !_chatOpen;

  if (_chatOpen) {
    // Opening — render chat
    _renderChat();
    // Focus input
    setTimeout(() => {
      document.getElementById('workout-ai-input')?.focus();
    }, 100);
  }
}

/* ══════════════════════════════════════════════
   CHAT RENDERING
   ══════════════════════════════════════════════ */

/**
 * Render chat messages.
 */
function _renderChat() {
  const container = document.getElementById('workout-ai-messages');
  if (!container) return;

  if (_chatHistory.length === 0) {
    container.innerHTML = `
      <div class="chat-message ai">
        Hi! I'm your Coach. Ask me anything about this workout.
      </div>
    `;
  } else {
    container.innerHTML = _chatHistory.map(msg => `
      <div class="chat-message ${msg.role}">
        ${_markdownToHtml(msg.content)}
      </div>
    `).join('');
  }

  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

/**
 * Add message to chat.
 * @param {string} text — message text
 * @param {'user'|'ai'} role
 */
export function addMessage(text, role) {
  const container = document.getElementById('workout-ai-messages');
  if (!container) return;

  const div = document.createElement('div');
  div.className = `chat-message ${role}`;
  div.innerHTML = _markdownToHtml(text);
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

/* ══════════════════════════════════════════════
   SEND MESSAGE
   ══════════════════════════════════════════════ */

/**
 * Send user message to AI.
 */
export async function send() {
  const input = document.getElementById('workout-ai-input');
  if (!input) return;

  const message = input.value.trim();
  if (!message) return;

  // Clear input
  input.value = '';

  // Show user message
  addMessage(message, 'user');
  _chatHistory.push({ role: 'user', content: message });

  // Stream AI response
  await _streamMessage(message);
}

/**
 * Quick preset question.
 * @param {keyof typeof QUICK_QUESTIONS} type
 */
export async function quickAsk(type) {
  const question = QUICK_QUESTIONS[type];
  if (!question) return;

  // Add to chat
  addMessage(question, 'user');
  _chatHistory.push({ role: 'user', content: question });

  // Send to AI
  await _streamMessage(question);
}

/**
 * Stream message to AI coach.
 * @param {string} message
 */
async function _streamMessage(message) {
  if (_streaming) return;
  _streaming = true;

  try {
    // Load context (same shape as dashboard coach — see claude.store fetchCoach)
    const [workouts, orms, scores] = await Promise.all([
      DB.Workouts.getAll(),
      DB.OneRM.getAll(),
      Heatmap.compute(),
    ]);

    const context = {
      workouts,
      scores,
      orms,
      chatHistory: _chatHistory,
      skipPersistChatHistory: true,
    };

    // Create AI message div
    const aiDiv = document.createElement('div');
    aiDiv.className = 'chat-message ai';
    aiDiv.innerHTML = `
      <div class="sk-lines" style="gap:5px;width:120px;padding:4px 0">
        <div class="sk-line sk" style="height:10px;width:100%"></div>
        <div class="sk-line sk" style="height:10px;width:70%"></div>
      </div>`;
    document.getElementById('workout-ai-messages')?.appendChild(aiDiv);

    // Stream response
    let firstToken = true;
    await fetchCoach(message, {
      onText: (text) => {
        if (firstToken) { aiDiv.innerHTML = ''; firstToken = false; }
        aiDiv.innerHTML = _markdownToHtml(text);
        const container = document.getElementById('workout-ai-messages');
        if (container) container.scrollTop = container.scrollHeight;
      },
      onDone: (text) => {
        _chatHistory.push({ role: 'assistant', content: text });
        _streaming = false;
      },
      onError: (err) => {
        aiDiv.replaceChildren();
        const p = document.createElement('p');
        p.className = 'workout-ai-error';
        p.textContent = err;
        aiDiv.appendChild(p);
        _streaming = false;
      }
    }, context);
  } catch (err) {
    addMessage(toUserMessage(err), 'ai');
    _streaming = false;
  }
}

/**
 * Handle Enter key in input.
 * @param {KeyboardEvent} event
 */
export function handleKey(event) {
  if (event.key === 'Enter') {
    send();
  }
}

/* ══════════════════════════════════════════════
   UTILS
   ══════════════════════════════════════════════ */

/**
 * Simple markdown to HTML (bold only).
 * @param {string} text
 * @returns {string}
 */
function _markdownToHtml(text) {
  return esc(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

/* ══════════════════════════════════════════════
   EXPOSE TO WINDOW
   ══════════════════════════════════════════════ */

window.WorkoutAI = {
  init,
  toggle,
  send,
  handleKey,
  quickAsk,
  addMessage,
  showBubble,
  hideBubble
};
