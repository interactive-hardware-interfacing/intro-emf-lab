// The shared shell: tab bar, control panel, layered canvas stage, layer toggles, colour
// scale, probe, equation panel, export, share link. Tabs plug in through a small interface:
//
//   tab = {
//     id, title, phase, summary,
//     extent: [xmin, xmax, ymin, ymax],      // metres, square aspect
//     axes: ['x', 'y'],                       // probe labels (e.g. ['x', 'z'] or ['r', 'z'])
//     layers: [ { id, label, kind: 'scalar'|'vector'|'contour'|'info',
//                 unit?, signed?, log?, default?, styles?: ['arrows','lines'], available?: true } ],
//     init(shell)       -> build controls into shell.controlsEl, read shell.state
//     compute()         -> recompute whatever render() needs (may be async later)
//     render(layerId, ctx, view, opts) -> draw one layer; scalar layers return {min, max}
//     drawOverlay(ctx, view)           -> sources, geometry, labels (always on top)
//     probe(x, y)       -> [{ label, value, unit, note? }]
//     getState()        -> tab-specific URL params
//     csv()             -> text for "Field CSV"
//   }

import { Viewport, drawColorbar, drawProbeMarker } from '../core/render.js';
import { equationsFor } from './equations.js';
import { readState, writeState, getNum, getList, copyToClipboard, downloadText, num } from './state.js';

const CANVAS_PX = 640;

export class Shell {
  constructor(tabs) {
    this.tabs = tabs;
    this.state = readState();
    this.tab = null;
    this.canvases = new Map(); // layerId -> canvas
    this.layerOn = new Map();  // layerId -> boolean
    this.colorLayer = null;    // id of the scalar layer painted as the colour map
    this.vectorStyle = new Map(); // layerId -> 'arrows' | 'lines'
    this.probePt = [NaN, NaN];
    this.probeLog = [];
    this.solverRunning = false;

    this.$ = (id) => document.getElementById(id);
    this.controlsEl = this.$('controls');
    this.stackEl = this.$('canvas-stack');
    this.statusEl = this.$('status');

    this.buildTabBar();
    this.bindShared();
    const start = this.state.tab && tabs.find((t) => t.id === this.state.tab) ? this.state.tab : tabs[0].id;
    this.selectTab(start);
    window.addEventListener('popstate', () => { this.state = readState(); this.selectTab(this.state.tab ?? tabs[0].id); });
  }

  // ---------------------------------------------------------------- tabs

  buildTabBar() {
    const nav = this.$('tabs');
    nav.innerHTML = '';
    for (const t of this.tabs) {
      const b = document.createElement('button');
      b.className = 'tab';
      b.setAttribute('role', 'tab');
      b.dataset.id = t.id;
      b.innerHTML = `${t.title}${t.available === false ? `<span class="phase">P${t.phase}</span>` : ''}`;
      b.addEventListener('click', () => { this.state = { tab: t.id }; this.selectTab(t.id, { push: true }); });
      nav.appendChild(b);
    }
  }

  selectTab(id, { push = false } = {}) {
    const tab = this.tabs.find((t) => t.id === id) ?? this.tabs[0];
    if (this.tab?.destroy) this.tab.destroy();
    this.tab = tab;
    for (const b of this.$('tabs').children) b.setAttribute('aria-selected', String(b.dataset.id === tab.id));
    document.title = `${tab.title} · Intro EMF Lab`;
    this.$('foot-phase').textContent = tab.available === false ? `This tab arrives in Phase ${tab.phase}.` : `Phase ${tab.phase} tab.`;

    // Canvas stack: one canvas per layer plus an overlay, all CANVAS_PX square.
    this.stackEl.innerHTML = '';
    this.canvases.clear();
    this.layerOn.clear();
    this.vectorStyle.clear();
    const ext0 = tab.extent ?? [0, 1, 0, 1];
    const [cw, ch] = Shell.canvasSize(ext0);
    this.view = new Viewport(ext0, cw, ch);
    this.stackEl.style.aspectRatio = `${cw} / ${ch}`;
    for (const L of tab.layers ?? []) {
      if (L.kind === 'info') continue;
      const c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      c.dataset.layer = L.id;
      this.stackEl.appendChild(c);
      this.canvases.set(L.id, c);
      if (L.kind === 'vector') this.vectorStyle.set(L.id, L.styles?.[0] ?? 'arrows');
    }
    const ov = document.createElement('canvas');
    ov.width = cw; ov.height = ch; ov.dataset.layer = '_overlay';
    this.stackEl.appendChild(ov);
    this.canvases.set('_overlay', ov);
    if (tab.available === false) {
      const note = document.createElement('div');
      note.className = 'overlay-note';
      note.textContent = `${tab.title}: coming in Phase ${tab.phase}. The equation panel on the right already shows what this tab will solve.`;
      this.stackEl.appendChild(note);
    }

    // Layer state from URL or defaults
    const scalars = (tab.layers ?? []).filter((L) => L.kind === 'scalar' && L.available !== false);
    const urlColor = this.state.color;
    this.colorLayer = scalars.find((L) => L.id === urlColor)?.id ?? scalars.find((L) => L.default)?.id ?? scalars[0]?.id ?? null;
    const urlOv = getList(this.state, 'ov', null);
    for (const L of tab.layers ?? []) {
      if (L.kind === 'scalar') continue;
      const on = urlOv ? urlOv.includes(L.id) : !!L.default;
      this.layerOn.set(L.id, on && L.available !== false);
      const st = this.state[`st_${L.id}`];
      if (L.kind === 'vector' && st && L.styles?.includes(st)) this.vectorStyle.set(L.id, st);
    }
    this.$('cmap').value = this.state.cmap ?? (scalars.find((L) => L.id === this.colorLayer)?.signed ? 'coolwarm' : 'viridis');
    this.$('cmin').value = this.state.cmin ?? '';
    this.$('cmax').value = this.state.cmax ?? '';
    this.$('probe-xlabel').firstChild.textContent = `${tab.axes?.[0] ?? 'x'} (m) `;
    this.$('probe-ylabel').firstChild.textContent = `${tab.axes?.[1] ?? 'y'} (m) `;
    const cx = (this.view.extent[0] + this.view.extent[1]) / 2, cy = (this.view.extent[2] + this.view.extent[3]) / 2;
    this.probePt = [getNum(this.state, 'px', cx), getNum(this.state, 'py', cy)];
    this.$('probe-x').value = num(this.probePt[0]);
    this.$('probe-y').value = num(this.probePt[1]);

    this.buildLayerPanel();
    this.controlsEl.innerHTML = '';
    tab.init?.(this);
    this.buildStageViews();
    this.recompute();
    this.syncUrl({ push });
  }

  // ---------------------------------------------------------------- stage views

  /**
   * A tab may offer extra views of the centre window: tab.views = [{ id, label, footer?,
   * mount(container, shell) -> { update() } }]. 'field' (the layered canvases) is always first.
   */
  buildStageViews() {
    const nav = this.$('stage-tabs');
    nav.innerHTML = '';
    this.stageInstances = new Map();
    this.$('stage-view').innerHTML = '';
    const views = [{ id: 'field', label: 'Field' }, ...(this.tab.views ?? [])];
    this.stageViews = views;
    if (views.length > 1) {
      for (const v of views) {
        const b = document.createElement('button');
        b.className = 'stab'; b.dataset.id = v.id; b.textContent = v.label;
        b.addEventListener('click', () => { this.setStageView(v.id); this.syncUrl(); });
        nav.appendChild(b);
      }
    }
    const wanted = this.state.sv && views.some((v) => v.id === this.state.sv) ? this.state.sv : 'field';
    this.setStageView(wanted, { silent: true });
  }

  setStageView(id, { silent = false } = {}) {
    const views = this.stageViews ?? [{ id: 'field' }];
    const v = views.find((x) => x.id === id) ?? views[0];
    this.stageView = v.id;
    for (const b of this.$('stage-tabs').children) b.setAttribute('aria-selected', String(b.dataset.id === v.id));
    const isField = v.id === 'field';
    this.stackEl.hidden = !isField;
    const host = this.$('stage-view');
    host.hidden = isField;
    document.querySelector('.stage-footer').style.visibility = isField || v.footer ? 'visible' : 'hidden';
    if (!isField) {
      let inst = this.stageInstances.get(v.id);
      if (!inst) {
        const el = document.createElement('div');
        el.className = 'view-root'; el.style.cssText = 'display:flex;flex-direction:column;height:100%;';
        el.dataset.view = v.id;
        host.appendChild(el);
        inst = v.mount(el, this) ?? {};
        this.stageInstances.set(v.id, inst);
      }
      for (const el of host.children) el.style.display = el.dataset.view === v.id ? 'flex' : 'none';
      inst.update?.();
    }
    if (!silent) this.redraw();
  }

  /** Called after every redraw so a custom view stays in sync with the solution. */
  updateStageView() {
    if (!this.stageView || this.stageView === 'field') return;
    this.stageInstances?.get(this.stageView)?.update?.();
  }

  /** Canvas pixel size for an extent: the longer side is CANVAS_PX, aspect follows the physics. */
  static canvasSize(extent) {
    const aspect = (extent[1] - extent[0]) / (extent[3] - extent[2]);
    return aspect >= 1 ? [CANVAS_PX, Math.round(CANVAS_PX / aspect)] : [Math.round(CANVAS_PX * aspect), CANVAS_PX];
  }

  /** Resize every canvas in the stack to match the extent's aspect ratio. */
  fitCanvases(extent) {
    const [w, h] = Shell.canvasSize(extent);
    this.stackEl.style.aspectRatio = `${w} / ${h}`;
    for (const c of this.canvases.values()) { if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } }
    return [w, h];
  }

  /** A tab may change its physical extent and axis labels at runtime (e.g. a sub-mode switch). */
  setExtent(extent, axes) {
    const [w, h] = this.fitCanvases(extent);
    this.view = new Viewport(extent, w, h);
    if (axes) {
      this.tab.axes = axes;
      this.$('probe-xlabel').firstChild.textContent = `${axes[0]} (m) `;
      this.$('probe-ylabel').firstChild.textContent = `${axes[1]} (m) `;
    }
    const [x0, x1, y0, y1] = extent;
    const [px, py] = this.probePt;
    if (!(px >= x0 && px <= x1 && py >= y0 && py <= y1)) {
      this.probePt = [(x0 + x1) / 2, (y0 + y1) / 2];
      this.$('probe-x').value = num(this.probePt[0]);
      this.$('probe-y').value = num(this.probePt[1]);
    }
  }

  /** Rebuild the layer panel after a tab changes which layers are available. */
  refreshLayers() { this.buildLayerPanel(); }

  // ---------------------------------------------------------------- layers panel

  buildLayerPanel() {
    const box = this.$('layers');
    box.innerHTML = '';
    const tab = this.tab;
    const scalars = (tab.layers ?? []).filter((L) => L.kind === 'scalar');
    if (scalars.length) {
      const head = document.createElement('div');
      head.className = 'hint';
      head.textContent = 'Colour map (one at a time)';
      box.appendChild(head);
      const none = this.layerRow({ id: '', label: 'none', kind: 'scalar' }, 'radio', this.colorLayer === null);
      box.appendChild(none);
      for (const L of scalars) box.appendChild(this.layerRow(L, 'radio', this.colorLayer === L.id));
    }
    const others = (tab.layers ?? []).filter((L) => L.kind !== 'scalar');
    if (others.length) {
      const head = document.createElement('div');
      head.className = 'hint';
      head.textContent = 'Overlays';
      box.appendChild(head);
      for (const L of others) box.appendChild(this.layerRow(L, 'checkbox', !!this.layerOn.get(L.id)));
    }
  }

  layerRow(L, type, checked) {
    const row = document.createElement('label');
    row.className = 'layer' + (L.available === false ? ' na' : '');
    const inp = document.createElement('input');
    inp.type = type;
    inp.name = type === 'radio' ? 'color-layer' : `ov-${L.id}`;
    inp.checked = checked;
    inp.disabled = L.available === false;
    inp.addEventListener('change', () => {
      if (type === 'radio') this.colorLayer = L.id || null;
      else this.layerOn.set(L.id, inp.checked);
      if (type === 'radio') {
        const sc = this.tab.layers.find((x) => x.id === L.id);
        this.$('cmap').value = sc?.signed ? 'coolwarm' : 'viridis';
        this.$('cmin').value = ''; this.$('cmax').value = '';
      }
      this.redraw();
      this.syncUrl();
    });
    row.appendChild(inp);
    const text = document.createElement('span');
    text.textContent = L.label + (L.unit && type === 'radio' && L.id ? ` (${L.unit})` : '');
    row.appendChild(text);
    if (L.kind === 'vector' && L.styles?.length > 1) {
      const sel = document.createElement('select');
      for (const s of L.styles) {
        const o = document.createElement('option');
        o.value = s; o.textContent = s;
        sel.appendChild(o);
      }
      sel.value = this.vectorStyle.get(L.id);
      sel.addEventListener('change', () => { this.vectorStyle.set(L.id, sel.value); this.redraw(); this.syncUrl(); });
      row.appendChild(sel);
    } else if (L.available === false) {
      const s = document.createElement('span');
      s.className = 'sub';
      s.textContent = L.note ?? 'not on this tab';
      row.appendChild(s);
    } else if (L.note) {
      const s = document.createElement('span');
      s.className = 'sub';
      s.textContent = L.note;
      row.appendChild(s);
    }
    return row;
  }

  /** Layers currently on (for the equation panel): colour layer + checked overlays. */
  layersOn() {
    const out = [];
    if (this.colorLayer) out.push(this.colorLayer);
    for (const [id, on] of this.layerOn) if (on) out.push(id);
    // Map display ids like 'Emag' to the physical quantity for equations
    return out.map((id) => this.tab.layers.find((L) => L.id === id)?.eq ?? id).filter((v, i, a) => a.indexOf(v) === i);
  }

  // ---------------------------------------------------------------- drawing

  recompute() {
    if (this.tab.available === false) { this.lastComputeMs = undefined; this.redraw(); this.updateProbe(); return; }
    const t0 = performance.now();
    this.tab.compute?.();
    this.lastComputeMs = performance.now() - t0;
    this.redraw();
    this.updateProbe();
  }

  redraw() {
    const tab = this.tab;
    const opts = { map: this.$('cmap').value, min: parseFloat(this.$('cmin').value), max: parseFloat(this.$('cmax').value) };
    if (!Number.isFinite(opts.min)) opts.min = undefined;
    if (!Number.isFinite(opts.max)) opts.max = undefined;
    let range = null;
    for (const L of tab.layers ?? []) {
      const c = this.canvases.get(L.id);
      if (!c) continue;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      const on = L.kind === 'scalar' ? this.colorLayer === L.id : this.layerOn.get(L.id);
      const show = on && L.available !== false && tab.available !== false;
      c.classList.toggle('hidden', !show);
      if (!show) continue;
      const r = tab.render?.(L.id, ctx, this.view, { ...opts, style: this.vectorStyle.get(L.id), log: L.log });
      if (L.kind === 'scalar' && r) range = { ...r, layer: L };
    }
    this.redrawOverlay();
    this.lastRange = range;
    this.lastOpts = opts;
    this.drawColorbar(range, opts.map);
    this.renderEquations();
    this.refreshStatus();
    this.updateStageView();
  }

  /** Only the overlay (sources, geometry, probe marker): cheap, for pointer feedback. */
  redrawOverlay() {
    const ov = this.canvases.get('_overlay');
    const octx = ov.getContext('2d');
    octx.clearRect(0, 0, ov.width, ov.height);
    if (this.tab.available !== false) {
      this.tab.drawOverlay?.(octx, this.view);
      if (this.probePt.every(Number.isFinite)) drawProbeMarker(octx, this.view, this.probePt[0], this.probePt[1]);
    }
  }

  refreshStatus() {
    const ms = this.lastComputeMs;
    this.setStatus(this.tab.available === false ? '' : `${this.tab.statusText?.() ?? ''}${ms !== undefined ? ` · computed in ${ms.toFixed(0)} ms` : ''}`);
  }

  drawColorbar(range, map) {
    const cb = this.$('colorbar');
    const ctx = cb.getContext('2d');
    if (!range) {
      ctx.clearRect(0, 0, cb.width, cb.height);
      this.$('cb-min').textContent = this.$('cb-mid').textContent = this.$('cb-max').textContent = '';
      this.$('cb-title').textContent = '';
      return;
    }
    drawColorbar(ctx, { map });
    const f = (v) => (range.layer.log ? `1e${v.toFixed(1)}` : sci(v));
    this.$('cb-min').textContent = f(range.min);
    this.$('cb-mid').textContent = f((range.min + range.max) / 2);
    this.$('cb-max').textContent = f(range.max);
    this.$('cb-title').textContent = `${range.layer.label}${range.layer.unit ? ` (${range.layer.unit})` : ''}`;
  }

  setStatus(text) { this.statusEl.textContent = text; }

  // ---------------------------------------------------------------- equations

  renderEquations() {
    const box = this.$('equations');
    box.innerHTML = '';
    const list = equationsFor(this.tab.id, this.layersOn(), this.solverRunning);
    for (const e of list) {
      const d = document.createElement('div');
      d.className = `eq eq-${e.kind}${e.zero ? ' eq-zero' : ''}`;
      const t = document.createElement('div');
      t.className = 'eq-title';
      t.textContent = e.title;
      d.appendChild(t);
      const tex = document.createElement('div');
      tex.className = 'eq-tex';
      renderTeX(tex, e.tex);
      d.appendChild(tex);
      if (e.note) {
        const n = document.createElement('div');
        n.className = 'eq-note';
        n.textContent = e.note;
        d.appendChild(n);
      }
      box.appendChild(d);
    }
  }

  // ---------------------------------------------------------------- probe

  updateProbe() {
    const tab = this.tab;
    const body = this.$('probe-table').tBodies[0];
    body.innerHTML = '';
    if (tab.available === false || !tab.probe) return;
    const [x, y] = this.probePt;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.lastProbe = tab.probe(x, y);
    for (const r of this.lastProbe) {
      const tr = document.createElement('tr');
      const a = document.createElement('td');
      a.textContent = r.label + (r.unit ? ` (${r.unit})` : '');
      if (r.note) a.title = r.note;
      const b = document.createElement('td');
      b.textContent = Number.isFinite(r.value) ? sci(r.value, 5) : '—';
      tr.append(a, b);
      body.appendChild(tr);
    }
  }

  setProbe(x, y) {
    this.probePt = [x, y];
    this.$('probe-x').value = num(x);
    this.$('probe-y').value = num(y);
    this.updateProbe();
    this.redraw();
    this.syncUrl();
  }

  // ---------------------------------------------------------------- shared bindings

  bindShared() {
    const $ = this.$;
    for (const id of ['cmap', 'cmin', 'cmax']) $(id).addEventListener('change', () => { this.redraw(); this.syncUrl(); });
    $('cauto').addEventListener('click', () => { $('cmin').value = ''; $('cmax').value = ''; this.redraw(); this.syncUrl(); });
    $('probe-update').addEventListener('click', () => this.setProbe(parseFloat($('probe-x').value), parseFloat($('probe-y').value)));
    for (const id of ['probe-x', 'probe-y']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') $('probe-update').click(); });
    // Pointer events: a tab with onPointer(type, x, y, event) gets them first (painting,
    // dragging a path). If it returns true the event is consumed; otherwise a click sets the probe.
    const toWorld = (e) => {
      const rect = this.stackEl.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * this.view.width;
      const py = ((e.clientY - rect.top) / rect.height) * this.view.height;
      return this.view.toWorld(px, py);
    };
    let dragging = false, consumed = false;
    this.stackEl.addEventListener('pointerdown', (e) => {
      if (this.tab.available === false) return;
      const [x, y] = toWorld(e);
      dragging = true;
      consumed = !!this.tab.onPointer?.('down', x, y, e);
      if (consumed) { this.stackEl.setPointerCapture(e.pointerId); e.preventDefault(); }
    });
    this.stackEl.addEventListener('pointermove', (e) => {
      if (!dragging && !this.tab.onPointer) return;
      const [x, y] = toWorld(e);
      if (dragging && consumed) this.tab.onPointer?.('drag', x, y, e);
      else this.tab.onPointer?.('move', x, y, e);
    });
    this.stackEl.addEventListener('pointerup', (e) => {
      if (!dragging) return;
      dragging = false;
      const [x, y] = toWorld(e);
      if (consumed) { this.tab.onPointer?.('up', x, y, e); consumed = false; return; }
      this.setProbe(x, y);
    });
    this.stackEl.addEventListener('pointerleave', () => { if (!dragging) this.tab.onPointer?.('leave'); });
    $('probe-copy').addEventListener('click', async () => {
      const row = this.probeRow();
      if (row) await copyToClipboard(row.values.join('\t'));
      this.flash($('probe-copy'), 'Copied');
    });
    $('probe-log').addEventListener('click', () => {
      const row = this.probeRow();
      if (!row) return;
      this.probeLog.push(row);
      this.flash($('probe-log'), `Logged (${this.probeLog.length})`);
    });
    $('probe-csv').addEventListener('click', () => {
      if (!this.probeLog.length) { this.flash($('probe-csv'), 'Log is empty'); return; }
      const header = this.probeLog[0].header.join(',');
      const lines = this.probeLog.map((r) => r.values.join(','));
      downloadText(`${this.tab.id}-probe-log.csv`, [header, ...lines].join('\n'));
    });
    $('export-png').addEventListener('click', () => this.exportPng());
    $('export-csv').addEventListener('click', () => {
      const text = this.tab.csv?.();
      if (text) downloadText(`${this.tab.id}-field.csv`, text);
      else this.flash($('export-csv'), 'Nothing to export');
    });
    $('reset-btn').addEventListener('click', () => { this.state = { tab: this.tab.id }; this.selectTab(this.tab.id, { push: true }); });
    this.bindResizers();
    $('share-btn').addEventListener('click', async () => {
      const url = this.syncUrl();
      await copyToClipboard(location.origin + url);
      this.flash($('share-btn'), 'Link copied');
    });
  }

  /** Drag handles that resize the side panels; widths are remembered per browser. */
  bindResizers() {
    const ws = document.querySelector('.workspace');
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('emf-panels') || '{}'); } catch { /* ignore */ }
    if (saved.left) ws.style.setProperty('--left-w', `${saved.left}px`);
    if (saved.right) ws.style.setProperty('--right-w', `${saved.right}px`);
    const bind = (id, side) => {
      const el = this.$(id);
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        el.classList.add('active');
        const move = (ev) => {
          const rect = ws.getBoundingClientRect();
          const w = side === 'left' ? Math.min(Math.max(ev.clientX - rect.left, 200), rect.width * 0.5) : Math.min(Math.max(rect.right - ev.clientX, 220), rect.width * 0.5);
          ws.style.setProperty(side === 'left' ? '--left-w' : '--right-w', `${Math.round(w)}px`);
          saved[side] = Math.round(w);
        };
        const up = () => {
          el.classList.remove('active');
          el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up);
          try { localStorage.setItem('emf-panels', JSON.stringify(saved)); } catch { /* ignore */ }
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
      });
    };
    bind('resize-left', 'left');
    bind('resize-right', 'right');
  }

  probeRow() {
    if (!this.lastProbe) return null;
    const header = [this.tab.axes?.[0] ?? 'x', this.tab.axes?.[1] ?? 'y', ...this.lastProbe.map((r) => r.label + (r.unit ? `_${r.unit}` : ''))];
    const values = [num(this.probePt[0]), num(this.probePt[1]), ...this.lastProbe.map((r) => (Number.isFinite(r.value) ? r.value.toPrecision(8) : ''))];
    return { header, values };
  }

  flash(btn, text) {
    const old = btn.textContent;
    btn.textContent = text;
    setTimeout(() => { btn.textContent = old; }, 1200);
  }

  exportPng() {
    const out = document.createElement('canvas');
    out.width = this.view.width; out.height = this.view.height;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, out.width, out.height);
    for (const c of this.stackEl.querySelectorAll('canvas')) if (!c.classList.contains('hidden')) ctx.drawImage(c, 0, 0);
    const a = document.createElement('a');
    a.href = out.toDataURL('image/png');
    a.download = `${this.tab.id}.png`;
    a.click();
  }

  // ---------------------------------------------------------------- URL state

  syncUrl({ push = false } = {}) {
    const s = {
      tab: this.tab.id,
      color: this.colorLayer ?? '',
      ov: [...this.layerOn].filter(([, on]) => on).map(([id]) => id),
      cmap: this.$('cmap').value,
      cmin: this.$('cmin').value,
      cmax: this.$('cmax').value,
      px: this.probePt[0],
      py: this.probePt[1],
      sv: this.stageView && this.stageView !== 'field' ? this.stageView : '',
      ...(this.tab.getState?.() ?? {}),
    };
    for (const [id, st] of this.vectorStyle) s[`st_${id}`] = st;
    return writeState(s, { replace: !push });
  }
}

// ---------------------------------------------------------------- helpers

export function sci(v, digits = 4) {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e4 || a < 1e-3) return v.toExponential(digits - 1);
  return Number(v.toPrecision(digits)).toString();
}

function fmtRange(v) {
  if (!Number.isFinite(v)) return '';
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) return v.toExponential(0);
  return String(Number(v.toPrecision(4)));
}

export function renderTeX(el, tex) {
  if (window.katex) {
    try {
      window.katex.render(tex, el, { displayMode: true, throwOnError: false, trust: true });
      return;
    } catch { /* fall through */ }
  }
  const pre = document.createElement('div');
  pre.className = 'eq-fallback';
  pre.textContent = tex;
  el.appendChild(pre);
}

/** Small helpers for tabs building their controls. */
export const ui = {
  field(labelText, input) {
    const l = document.createElement('label');
    l.textContent = labelText;
    if (input.dataset && input.dataset.min !== undefined && input.dataset.max !== undefined) {
      const r = document.createElement('span');
      r.className = 'range-hint';
      r.textContent = `${fmtRange(+input.dataset.min)} to ${fmtRange(+input.dataset.max)}`;
      l.appendChild(r);
      input.title = `Allowed range: ${fmtRange(+input.dataset.min)} to ${fmtRange(+input.dataset.max)}`;
    }
    l.appendChild(input);
    return l;
  },
  number(value, { min, max, step, onChange } = {}) {
    const i = document.createElement('input');
    i.type = 'text';
    i.inputMode = 'decimal';
    i.value = String(value);
    if (min !== undefined) i.dataset.min = min;
    if (max !== undefined) i.dataset.max = max;
    if (step !== undefined) i.dataset.step = step;
    const commit = () => {
      let v = parseFloat(i.value);
      if (!Number.isFinite(v)) v = value;
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
      i.value = String(v);
      onChange?.(v);
    };
    i.addEventListener('change', commit);
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
    return i;
  },
  range(value, { min, max, step, onInput } = {}) {
    const i = document.createElement('input');
    i.type = 'range';
    i.min = min; i.max = max; i.step = step; i.value = value;
    i.addEventListener('input', () => onInput?.(parseFloat(i.value)));
    return i;
  },
  select(options, value, onChange) {
    const s = document.createElement('select');
    for (const [v, t] of options) {
      const o = document.createElement('option');
      o.value = v; o.textContent = t;
      s.appendChild(o);
    }
    s.value = value;
    s.addEventListener('change', () => onChange?.(s.value));
    return s;
  },
  button(text, onClick, cls = 'btn') {
    const b = document.createElement('button');
    b.className = cls;
    b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
  },
  el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  },
};
