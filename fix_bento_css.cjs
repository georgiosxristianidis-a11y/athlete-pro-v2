const fs = require('fs');
let css = fs.readFileSync('C:/PROJECTS/athlete-pro/css/profile.css', 'utf8');

// Remove duplicate .pp-bento blocks
css = css.replace(/\.pp-bento\s*\{[\s\S]*?\}/g, '');
css = css.replace(/\.pp-bento::before\s*\{[\s\S]*?\}/g, '');

const newBentoCSS = `
/* ── Bento 2x2 ── */
.pp-bento {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px; /* Philosophy of Air (x2 spacing) */
  margin-bottom: 24px;
}
.pp-bento::before {
  content: '';
  position: absolute;
  inset: -10px;
  background: radial-gradient(circle at center, rgba(139, 92, 246, 0.08) 0%, transparent 60%);
  filter: blur(20px);
  z-index: -1;
  pointer-events: none;
}
`;
css = css.replace(/\/\* ── Bento 2x2 ── \*\//, newBentoCSS);

const oldCellCSSRegex = /\.pp-bento-cell\s*\{[\s\S]*?min-height:\s*88px;\s*justify-content:\s*center;\s*\}/g;
const newCellCSS = `
.pp-bento-cell {
  background: var(--c-surface);
  border-radius: var(--r-l);
  padding: 12px; /* Slightly decreased padding for smaller blocks */
  display: flex;
  flex-direction: column;
  gap: 3px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: box-shadow var(--t-normal), background var(--t-normal);
  min-height: 76px; /* Slightly decreased height */
  justify-content: center;
}
`;
css = css.replace(oldCellCSSRegex, newCellCSS);

fs.writeFileSync('C:/PROJECTS/athlete-pro/css/profile.css', css, 'utf8');
