# Fit Elite — Production Deployment Guide

**Version:** 1.0.0
**Milestone:** Elite Foundation ✅ Complete
**Verification:** 21/21 tests passed (100%)

---

## 📋 Pre-Deployment Checklist

### Environment Setup

```bash
# 1. Verify Node.js version (v18+ recommended)
node --version

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env

# 4. Set ANTHROPIC_API_KEY in .env (required for AI features)
ANTHROPIC_API_KEY=your_api_key_here
PORT=3000
```

### Build Verification

```bash
# Run all tests
npm test

# Lint check
npm run lint

# Format check
npm run format:check

# Phase 4 verification tests
node test/phase4-verification.js
```

**Expected output:**
```
✅ All Phase 4 verification tests passed!
RESULTS: 21 passed, 0 failed
SUCCESS RATE: 100%
```

---

## 🚀 Deployment Options

### Option 1: Vercel (Recommended for Frontend + Serverless)

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Deploy:**
   ```bash
   vercel login
   vercel --prod
   ```

3. **Configure environment variables in Vercel dashboard:**
   - `ANTHROPIC_API_KEY`
   - `PORT` (auto-set by Vercel)

**Notes:**
- Vercel auto-detects Node.js server
- Serverless functions handle `/api/*` routes
- Static files served from root

---

### Option 2: Railway

1. **Connect GitHub repo to Railway**

2. **Add environment variables:**
   - `ANTHROPIC_API_KEY`
   - `PORT` (auto-set)

3. **Deploy automatically on push**

**Notes:**
- Railway auto-detects `package.json` start script
- Persistent server (not serverless)
- Free tier available

---

### Option 3: Render

1. **Create new Web Service on Render**

2. **Connect repository:**
   - Repository: `your-username/athlete-pro`
   - Root directory: `/`
   - Build command: `npm install`
   - Start command: `npm start`

3. **Add environment variables:**
   - `ANTHROPIC_API_KEY`
   - `PORT=3000`

**Notes:**
- Free tier: 750 hours/month
- Auto-deploy on git push
- Automatic HTTPS

---

### Option 4: Self-Hosted (VPS/Dedicated)

```bash
# 1. Clone repository
git clone https://github.com/your-username/athlete-pro.git
cd athlete-pro

# 2. Install dependencies
npm install --production

# 3. Setup environment
cp .env.example .env
# Edit .env with your API keys

# 4. Install PM2 (process manager)
npm install -g pm2

# 5. Start with PM2
pm2 start server.js --name fit-elite

# 6. Setup PM2 startup
pm2 startup
pm2 save
```

**Nginx reverse proxy configuration:**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 🔧 Post-Deployment Verification

### 1. Health Check

```bash
curl https://your-domain.com/
# Should return index.html

curl https://your-domain.com/api/supabase-status
# Should return JSON status (if Supabase configured)
```

### 2. PWA Verification

1. Open DevTools → Application
2. Check Manifest: Should show app name, icons
3. Check Service Worker: Should be active
4. Test offline mode: Should work without network

### 3. AI Features Test

1. **Program Generation (AI-1):**
   - Clear localStorage: `localStorage.removeItem('ap-custom-plan')`
   - Reload app
   - Should see plan preview modal within 5s

2. **In-Workout AI (AI-3):**
   - Start a Push workout
   - Complete first set
   - AI bubble (✨) should appear in top-right
   - Click bubble → chat overlay opens

3. **Progressive Overload (AI-4):**
   - Navigate to workout screen
   - Set cards should show inline suggestions
   - Look for 🟢/🔵/⚪ indicators

4. **Weekly Summary:**
   - Complete 2+ workouts
   - Navigate to Dashboard
   - Click "📈 This Week" chip
   - Modal should show PRs and plateau alerts

---

## 📊 Monitoring & Logging

### Production Logs

```bash
# Vercel
vercel logs

# Railway
# Dashboard → Deployments → Logs

# Render
# Dashboard → Logs

# PM2 (self-hosted)
pm2 logs fit-elite
```

### Error Tracking

Recommended integrations:
- **Sentry** — Frontend error tracking
- **LogRocket** — Session replay + errors
- **Better Uptime** — Monitoring + alerts

---

## 🔐 Security Checklist

- [ ] `ANTHROPIC_API_KEY` stored in environment variables (NOT in code)
- [ ] `.env` file in `.gitignore`
- [ ] HTTPS enabled (auto on Vercel/Railway/Render)
- [ ] CORS configured for production domain
- [ ] Rate limiting on `/api/*` endpoints (optional)

---

## 📈 Performance Targets

**Lighthouse Scores (mobile):**
- Performance: ≥ 90
- Accessibility: ≥ 90
- Best Practices: ≥ 90
- SEO: ≥ 90
- PWA: ✅ Pass

**Current:** 97/100 (verified Phase 2)

---

## 🔄 Rollback Procedure

```bash
# Vercel
vercel rollback

# Railway
# Dashboard → Deployments → Rollback to previous

# Render
# Dashboard → Manual Deploy → Select previous commit

# PM2
pm2 reload fit-elite --update-env
```

---

## 📞 Support

**Documentation:**
- `.planning/STATE.md` — Project state
- `CLAUDE.md` — Development guide
- `CHANGELOG.md` — Version history

**Issues:**
- GitHub Issues: https://github.com/your-username/athlete-pro/issues

---

## ✅ Deployment Sign-Off

**Pre-deployment:**
- [ ] All tests passing (21/21)
- [ ] Lint check passing
- [ ] Environment variables configured
- [ ] `.env` in `.gitignore`

**Post-deployment:**
- [ ] Health check passed
- [ ] PWA verified
- [ ] AI features tested
- [ ] No console errors

**Deployed by:** ________________
**Date:** ________________
**Version:** 1.0.0
**Status:** ✅ Production Ready
