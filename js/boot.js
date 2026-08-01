/**
 * Boot chain logger & crash handler
 * Extracted from index.html to satisfy CSP inline-script restrictions.
 */
import { toUserMessage, isBenignRejection } from './shared/errors-ui.js';

// CSP-safe async-CSS activation. Non-critical stylesheets ship with
// media="print" (non-render-blocking) + data-lazy; we switch them to "all" here.
// The old inline onload="this.media='all'" is blocked by script-src-attr 'none'.
for (const link of document.querySelectorAll('link[data-lazy]')) link.media = 'all';

window.addEventListener('error', (e) => {
  console.error(e.error || e.message);
  window.Toast && window.Toast.show(toUserMessage(e.error || e.message), 'error', 5000);
});

// The app's ONLY unhandled-rejection boundary. It lives here, not in app.js,
// because boot.js runs first: a rejection thrown while app.js's own import
// graph is still evaluating (stores, IDB init) would otherwise be reported by
// nobody. Classification is shared — see isBenignRejection.
window.addEventListener('unhandledrejection', (e) => {
  if (isBenignRejection(e.reason)) {
    e.preventDefault();                       // keep console + UI clean
    console.debug('[rejection:benign]', /** @type {any} */ (e.reason)?.name || e.reason);
    return;
  }
  console.error(e.reason);
  window.Toast && window.Toast.show(toUserMessage(e.reason), 'error', 5000);
});
