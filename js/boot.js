/**
 * Boot chain logger & crash handler
 * Extracted from index.html to satisfy CSP inline-script restrictions.
 */
import { toUserMessage } from './shared/errors-ui.js';

window.addEventListener('error', (e) => {
  console.error(e.error || e.message);
  window.Toast && window.Toast.show(toUserMessage(e.error || e.message), 'error', 5000);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  window.Toast && window.Toast.show(toUserMessage(e.reason), 'error', 5000);
});
