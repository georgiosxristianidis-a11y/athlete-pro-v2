export const Toast = {
  show: (message, type = 'info') => {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: type === 'error' ? 'var(--c-accent)' : 'var(--c-surface)',
      color: 'white',
      padding: '12px 24px',
      borderRadius: '8px',
      zIndex: '9999',
      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
      opacity: '0',
      transition: 'opacity 0.3s'
    });
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
    });
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
};

export const Nav = {
  goTo: (screenId) => {
    document.querySelectorAll('main > section').forEach(s => s.style.display = 'none');
    const screen = document.getElementById(screenId);
    if (screen) screen.style.display = 'block';
  }
};
