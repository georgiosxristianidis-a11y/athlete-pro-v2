require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Security & Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://www.gstatic.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://api.anthropic.com", "https://*.supabase.co"],
      imgSrc: ["'self'", "data:", "blob:"],
      workerSrc: ["'self'", "blob:"],
      mediaSrc: ["'self'"]
    }
  }
}));
app.use(cors());
app.use(express.json());

// Static files
app.use(express.static(path.join(__dirname, '.')));

// Routes
app.use('/api', require('./routes/coach'));
app.use('/api', require('./routes/integrations'));

// Fallback for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Athlete Pro server running on port ${PORT}`);
});
