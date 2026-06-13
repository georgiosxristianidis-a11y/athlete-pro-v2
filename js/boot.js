/**
 * Boot chain logger & crash handler
 * Extracted from index.html to satisfy CSP inline-script restrictions.
 */
window.addEventListener('error', (e) => {
  window.Toast && window.Toast.show('ERR: ' + e.message, 'error', 5000);
});

window.addEventListener('unhandledrejection', (e) => {
  window.Toast && window.Toast.show('REJ: ' + e.reason, 'error', 5000);
});
