/**
 * Boot chain logger & crash handler
 * Extracted from index.html to satisfy CSP inline-script restrictions.
 */
import { toUserMessage } from './shared/errors-ui.js';

// CSP-safe async-CSS activation. Non-critical stylesheets ship with
// media="print" (non-render-blocking) + data-lazy; we switch them to "all" here.
// The old inline onload="this.media='all'" is blocked by script-src-attr 'none'.
for (const link of document.querySelectorAll('link[data-lazy]')) link.media = 'all';

window.addEventListener('error', (e) => {
  console.error(e.error || e.message);
  window.Toast && window.Toast.show(toUserMessage(e.error || e.message), 'error', 5000);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  window.Toast && window.Toast.show(toUserMessage(e.reason), 'error', 5000);
});
