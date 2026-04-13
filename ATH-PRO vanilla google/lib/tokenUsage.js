function record(endpoint, usage) {
  // Simple usage tracking
  console.log(`[Usage] ${endpoint}: ${JSON.stringify(usage)}`);
}

function getSessionSummary() { return {}; }
function resetSession() {}
function getLifetimeUsage() { return {}; }

module.exports = { record, getSessionSummary, resetSession, getLifetimeUsage };
