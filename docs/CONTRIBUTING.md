# Contributing to Athlete Pro

## Development Setup

1. **Clone and install:**
   ```bash
   git clone <repository-url>
   cd athlete-pro
   npm install
   ```

2. **Environment setup:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys (optional)
   ```

3. **Run locally:**
   ```bash
   npm run dev  # Full mode with backend
   # OR
   python -m http.server 8080  # Static mode (frontend only)
   ```

## Code Style

### JavaScript

- **ES Modules** for frontend (`import`/`export`)
- **CommonJS** for backend (`require`/`module.exports`)
- **4-space indentation**
- **Single quotes** for strings (enforced by Prettier)
- **Semicolons** required
- **JSDoc comments** for public APIs and complex functions

### File Naming

- `kebab-case.js` for all JavaScript files
- `*.store.js` for state management modules
- `*.view.js` for DOM rendering modules
- `*.css` for stylesheets matching their JS counterparts

### Module Organization

Frontend modules follow the Store/View pattern:
- **Store** (`*.store.js`): State, data layer, business logic, no DOM manipulation
- **View** (`*.view.js`): DOM rendering, event handlers, UI updates, imports from store

## Commit Message Format

Follow conventional commits style:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat` - New feature
- `fix` - Bug fix
- `refactor` - Code refactoring (no functional changes)
- `style` - Formatting, missing semicolons, etc.
- `perf` - Performance improvements
- `test` - Adding or updating tests
- `docs` - Documentation changes
- `chore` - Maintenance tasks

### Scopes

- `frontend` - Client-side code (js/, css/)
- `backend` - Server code (server.js, routes/)
- `pwa` - Service worker, manifest
- `db` - IndexedDB layer
- `ui` - Design system, styling
- `coach` - AI coach integration

### Examples

```
feat(frontend): add rest timer component

Implements countdown timer with haptic feedback and audio alerts.
Integrates with workout session state.

feat(coach): add muscle fatigue context to AI prompts

fix(pwa): correct service worker cache invalidation

refactor(db): simplify IndexedDB transaction handling

style(ui): update button colors to match design system
```

## Pre-Commit Checklist

Before committing, run:

```bash
npm run format && npm run lint && npm test
```

Or individually:
- `npm run format` - Auto-format with Prettier
- `npm run lint` - Check for ESLint errors
- `npm test` - Run all tests

## Testing Requirements

- **All new features** must include tests
- **Bug fixes** should include regression tests
- Tests use Node.js built-in test runner
- Test files go in `test/` directory

### Test Types

1. **Smoke tests** - Basic server health checks
2. **PWA tests** - Service worker and manifest validation
3. **Performance tests** - Load time and bundle size checks

### Running Tests

```bash
npm test                    # Run all tests
node --test test/smoke.test.js  # Run specific test
```

## Pull Request Process

1. **Create a feature branch:**
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** following code style guidelines

3. **Run pre-commit checks:**
   ```bash
   npm run format && npm run lint && npm test
   ```

4. **Commit with conventional format:**
   ```bash
   git commit -m "feat(scope): description"
   ```

5. **Push and create PR:**
   ```bash
   git push origin feat/your-feature-name
   ```

6. **PR description should include:**
   - Summary of changes
   - Motivation and context
   - Screenshots (for UI changes)
   - Testing performed
   - Related issues

## Architecture Guidelines

### Frontend

- **No frameworks** - Vanilla JavaScript only
- **Lazy loading** - Heavy modules load on-demand
- **Offline-first** - IndexedDB as primary storage
- **Mobile-first** - Responsive design with desktop enhancements

### Backend

- **Minimal API surface** - Only essential endpoints
- **Streaming responses** - Use SSE for AI coach
- **No authentication** - Client-side only app
- **Environment-based config** - All secrets in .env

### Design System

- **Obsidian theme** - See CLAUDE.md § Design for full specs
- **No opaque borders** - Glass hairlines via tokens (`--c-border` / `--c-border-h`)
- **Design tokens** - CSS variables for all colors/spacing
- **Accessibility** - WCAG 2.1 AA compliance

## Common Pitfalls to Avoid

1. **Don't modify completed phases** - See .planning/STATE.md
2. **Don't expose API keys** - All AI calls through backend
3. **Don't skip IndexedDB versioning** - Increment DB_VERSION on schema changes
4. **Don't use frameworks** - Keep it vanilla
5. **Don't forget devicePixelRatio** - Canvas rendering must account for DPI
6. **Don't hardcode routes** - Use suffix-only paths in route files

## Questions or Issues?

- Check [CLAUDE.md](CLAUDE.md) for development guidance
- Check [README.md](README.md) for project overview
- Open an issue for bugs or feature requests
