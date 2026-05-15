'use strict';
require('dotenv').config();
const express = require('express');
const path = require('path');
const { correlationMiddleware, logWarn } = require('./lib/logger');

const app = express();
app.use(correlationMiddleware);
app.use(express.json());
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    logWarn(req, 'json_parse_error', 'Invalid JSON body', { type: err.type });
    return res.status(400).json({
      error: 'Invalid JSON body',
      requestId: req.correlationId,
    });
  }
  next(err);
});
app.use(express.static(path.join(__dirname), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  },
}));

app.use('/api', require('./routes/coach'));
app.use('/api', require('./routes/integrations'));

function startServer(port = process.env.PORT || 3000) {
  return new Promise((resolve) => {
    const server = app.listen(port, '127.0.0.1', () => {
      if (port !== 0) console.log(`\n  Athlete Pro  →  http://localhost:${server.address().port}\n`);
      resolve(server);
    });
  });
}

module.exports = { app, startServer };

if (require.main === module) {
  startServer();
}
