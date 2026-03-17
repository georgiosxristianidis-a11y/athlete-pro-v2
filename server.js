'use strict';
require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.use('/api', require('./routes/coach'));
app.use('/api', require('./routes/integrations'));

function startServer(port = process.env.PORT || 3000) {
  return app.listen(port, () => {
    console.log(`\n  Athlete Pro  →  http://localhost:${port}\n`);
  });
}

module.exports = { app, startServer };

if (require.main === module) {
  startServer();
}
