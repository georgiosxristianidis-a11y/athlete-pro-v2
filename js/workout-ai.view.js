// @ts-check
/* ════════════════════════════════════════════════════════
   workout-ai.view.js — In-workout AI view layer
   AI bubble, mini chat overlay, quick actions
   ════════════════════════════════════════════════════════ */

import { ClaudeState, fetchCoach } from './claude.store.js';
import { State as WorkoutState } from './workout.store.js';
import { DB } from './db.js';

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
  _checkProactiveTrigger();
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
  bubble.onclick = toggle;
  bubble.innerHTML = '<span class="bubble-icon">✨</span>';

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
      <span class="chat-title">Coach</span>
      <button class="btn-icon-sm" onclick="window.WorkoutAI.toggle()">✕</button>
    </div>
    <div class="chat-messages" id="workout-ai-messages"></div>
    <div class="chat-input-row">
      <input
        type="text"
        id="workout-ai-input"
        class="chat-input"
        placeholder="Ask about this set..."
        onkeydown="window.WorkoutAI.handleKey(event)"
      />
      <button class="btn-icon-sm" onclick="window.WorkoutAI.send()">➤</button>
    </div>
    <div class="quick-actions">
      <button class="quick-action-chip" onclick="window.WorkoutAI.quickAsk('weight')">🏋️ Weight</button>
      <button class="quick-action-chip" onclick="window.WorkoutAI.quickAsk('form')">📋 Form</button>
      <button class="quick-action-chip" onclick="window.WorkoutAI.quickAsk('rest')">⏱️ Rest</button>
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
      suggestion = `💪 Starting **${ex.name}** today! Focus on controlled tempo — 3s down, 1s pause, explosive up.`;
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
          suggestion = `📊 You've hit **${firstExercise}** at the same weight for 3 sessions. Want to try a deload or technique variation?`;
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
        👋 Hey! I'm your Coach. Ask me anything about this workout!
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
    // Load context
    const [workouts, orms] = await Promise.all([
      DB.Workouts.getAll(),
      DB.OneRM.getAll()
    ]);

    // Build context for AI
    const context = {
      workouts: workouts.slice(0, 3).map(w => ({
        type: w.type,
        hoursAgo: Math.round((Date.now() - w.timestamp) / 3600000),
        tonnageKg: Math.round(w.tonnage || 0),
        exercises: (w.exercises || []).slice(0, 3).map(e => ({
          name: e.name,
          sets: (e.sets || []).filter(s => s.done).length
        }))
      })),
      topLifts: orms.slice(0, 3).map(o => ({ exercise: o.id, oneRM: o.value })),
      messages: [..._chatHistory]
    };

    // Create AI message div
    const aiDiv = document.createElement('div');
    aiDiv.className = 'chat-message ai';
    document.getElementById('workout-ai-messages')?.appendChild(aiDiv);

    // Stream response
    await fetchCoach(message, {
      onText: (text) => {
        aiDiv.innerHTML = _markdownToHtml(text);
        const container = document.getElementById('workout-ai-messages');
        if (container) container.scrollTop = container.scrollHeight;
      },
      onDone: (text) => {
        _chatHistory.push({ role: 'assistant', content: text });
        _streaming = false;
      },
      onError: (err) => {
        aiDiv.innerHTML = `⚠️ Error: ${err}`;
        _streaming = false;
      }
    }, context);
  } catch (err) {
    addMessage(`⚠️ Error: ${err.message}`, 'ai');
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
  return text
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
