// About tab: the site introduction, how to use it, and one section per tab with what it
// shows, what to look for, and its equations. Rendered as a scrollable page in the centre
// window; the side panels are left empty.

import { SITE, TAB_INFO, tabEquations } from '../about.js';
import { renderTeX, ui } from '../shell.js';

export default {
  id: 'about',
  title: 'About',
  phase: 5,
  available: true,
  hideField: true,
  summary: 'What each tab shows, how the numbers are computed, and the equations.',
  extent: [0, 1, 0, 1],
  axes: ['x', 'y'],
  layers: [],

  init(shell) {
    this.shell = shell;
    this.views = [{ id: 'about', label: 'About', page: true, mount: (el) => this.mount(el) }];
    const box = shell.controlsEl;
    box.appendChild(ui.el('h1', '', 'About'));
    box.appendChild(ui.el('p', 'lead', 'Contents'));
    const list = ui.el('div', 'placeholder');
    const link = (text, id) => { const a = document.createElement('a'); a.href = '#'; a.textContent = text; a.style.display = 'block'; a.addEventListener('click', (e) => { e.preventDefault(); this.scrollTo(id); }); return a; };
    list.append(link('What this is', 'about-intro'), link('How to use it', 'about-howto'), link('About the numbers', 'about-numerics'));
    list.appendChild(ui.el('p', 'hint', 'Tabs'));
    for (const t of shell.tabs) if (t.id !== 'about') list.appendChild(link(t.title, `about-${t.id}`));
    box.appendChild(list);
  },

  scrollTo(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  mount(el) {
    const page = ui.el('div', 'about-page');
    el.appendChild(page);
    const h = (tag, text, id) => { const e = ui.el(tag, '', text); if (id) e.id = id; page.appendChild(e); return e; };
    const p = (text) => page.appendChild(ui.el('p', '', text));
    const dl = (rows) => { const d = document.createElement('dl'); for (const [k, v] of rows) { d.appendChild(ui.el('dt', '', k)); d.appendChild(ui.el('dd', '', v)); } page.appendChild(d); };
    const ul = (items) => { const u = document.createElement('ul'); for (const t of items) u.appendChild(ui.el('li', '', t)); page.appendChild(u); };

    h('h1', SITE.title, 'about-intro');
    for (const t of SITE.intro) p(t);
    h('h2', 'How to use it', 'about-howto'); dl(SITE.howTo);
    h('h2', 'About the numbers', 'about-numerics'); dl(SITE.numerics);

    h('h2', 'The tabs');
    for (const t of this.shell.tabs) {
      if (t.id === 'about') continue;
      const info = TAB_INFO[t.id];
      const head = h('h3', t.title, `about-${t.id}`);
      const open = ui.button('Open', () => { this.shell.state = { tab: t.id }; this.shell.selectTab(t.id, { push: true }); }, 'btn btn-small');
      open.style.marginLeft = '10px'; head.appendChild(open);
      if (!info) { p(t.summary ?? ''); continue; }
      p(info.what);
      if (info.shows?.length) { page.appendChild(ui.el('p', 'about-sub', 'What it shows')); ul(info.shows); }
      if (info.lookFor?.length) { page.appendChild(ui.el('p', 'about-sub', 'What to look for')); ul(info.lookFor); }
      const eqs = tabEquations(t.id);
      if (eqs.length) {
        page.appendChild(ui.el('p', 'about-sub', 'Equations'));
        const grid = ui.el('div', 'about-eqs');
        for (const e of eqs) {
          const card = ui.el('div', `eq${e.zero ? ' eq-zero' : ''}`);
          card.appendChild(ui.el('div', 'eq-title', e.title));
          const tex = ui.el('div', 'eq-tex'); renderTeX(tex, e.tex); card.appendChild(tex);
          if (e.note) card.appendChild(ui.el('div', 'eq-note', e.note));
          grid.appendChild(card);
        }
        page.appendChild(grid);
      }
    }
    return { update() { /* static */ } };
  },

  statusText() { return ''; },
  getState() { return {}; },
};
