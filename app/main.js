// Boot: register tabs in the order they appear in the tab bar, then start the shell.
// Add a tab by importing its module and placing it in TABS. Nothing else to wire.

import { Shell } from './shell.js';
import { TABS } from './tabs/index.js';

function boot() {
  window.emf = new Shell(TABS);
  // If KaTeX arrives after the first paint, typeset the panel once more.
  window.addEventListener('load', () => { if (window.katex) window.emf.renderEquations(); }, { once: true });
}

// KaTeX is loaded with `defer`; wait for it so the first equation render is typeset,
// but don't block on it if the CDN is unreachable (the panel falls back to raw TeX).
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
