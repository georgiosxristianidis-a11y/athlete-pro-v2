export const AI = {
  renderFAB: () => {
    const fab = document.createElement('div');
    fab.className = 'ai-fab';
    fab.innerHTML = '✨';
    Object.assign(fab.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      width: '56px',
      height: '56px',
      borderRadius: '28px',
      backgroundColor: 'var(--c-purple, #9b51e0)',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '24px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      cursor: 'pointer',
      zIndex: '1000'
    });
    fab.onclick = AI.openChat;
    document.body.appendChild(fab);
  },
  openChat: () => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'ai-chat-overlay';
    overlay.innerHTML = `
      <div class="modal-sheet" style="height: 80vh; display: flex; flex-direction: column;">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <div class="modal-title">Gemini Coach</div>
          <button class="btn-icon-sm" onclick="document.getElementById('ai-chat-overlay').remove()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div id="ai-chat-history" style="flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px;">
          <div style="background: var(--c-surface); padding: 12px; border-radius: 8px; align-self: flex-start; max-width: 85%;">
            Привет! Я твой ИИ-тренер Gemini. Как прошла последняя тренировка?
          </div>
        </div>
        <div style="padding: 15px; border-top: 1px solid var(--c-border); display: flex; gap: 10px;">
          <input type="text" id="ai-chat-input" placeholder="Спроси о тренировках..." style="flex: 1; padding: 12px; border-radius: 8px; border: 1px solid var(--c-border); background: var(--c-bg); color: var(--c-text-1);" onkeydown="if(event.key==='Enter') window.AI.sendMessage()">
          <button class="btn" onclick="window.AI.sendMessage()" style="background: var(--c-purple, #9b51e0);">Отправить</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => {
      document.getElementById('ai-chat-input')?.focus();
    }, 100);
  },
  sendMessage: async () => {
    const input = document.getElementById('ai-chat-input');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';

    const history = document.getElementById('ai-chat-history');
    history.innerHTML += `<div style="background: var(--c-purple, #9b51e0); color: white; padding: 12px; border-radius: 8px; align-self: flex-end; max-width: 85%;">${msg}</div>`;
    history.scrollTop = history.scrollHeight;

    // Fetch context
    const workouts = await window.DB.Workouts.getLast(5);

    try {
      const res = await fetch('/api/coach/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, context: workouts })
      });
      const data = await res.json();
      if (data.reply) {
        history.innerHTML += `<div style="background: var(--c-surface); padding: 12px; border-radius: 8px; align-self: flex-start; max-width: 85%;">${data.reply}</div>`;
      } else {
        history.innerHTML += `<div style="background: var(--c-accent); color: white; padding: 12px; border-radius: 8px; align-self: flex-start; max-width: 85%;">Ошибка: ${data.error || 'Неизвестная ошибка'}</div>`;
      }
    } catch (e) {
      history.innerHTML += `<div style="background: var(--c-accent); color: white; padding: 12px; border-radius: 8px; align-self: flex-start; max-width: 85%;">Ошибка соединения с Gemini.</div>`;
    }
    history.scrollTop = history.scrollHeight;
  }
};
