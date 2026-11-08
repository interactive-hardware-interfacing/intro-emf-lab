import { SEMESTER } from './version.js';
// URL state: every input that affects what a student sees is encoded in the query string,
// so a pasted link reproduces the view exactly. Tabs declare their own parameters; the
// shell adds the shared ones (tab, layers, colour scale, probe).
//
// Encoding: ?tab=point-charges&L=V,E&cmap=viridis&cmin=&cmax=&px=0.1&py=0.2&q1=2&x1=0.1&...
// Numbers are written with up to 6 significant digits; arrays as comma-separated lists.

export function readState() {
  const params = new URLSearchParams(location.search);
  const out = {};
  for (const [k, v] of params) out[k] = v;
  return out;
}

export function writeState(obj, { replace = true } = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, Array.isArray(v) ? v.join(',') : typeof v === 'number' ? num(v) : String(v));
  }
  const url = `${location.pathname}?${params.toString()}${location.hash}`;
  try {
    if (replace) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
  } catch { /* sandboxed previews may refuse; the share button still carries the url */ }
  return url;
}

export function num(v) {
  if (!Number.isFinite(v)) return '';
  const s = Number(v.toPrecision(6));
  return String(s);
}

export function getNum(state, key, fallback) {
  const v = parseFloat(state[key]);
  return Number.isFinite(v) ? v : fallback;
}

export function getList(state, key, fallback) {
  if (state[key] === undefined || state[key] === '') return fallback;
  return state[key].split(',').filter(Boolean);
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/**
 * Save a text file. The semester tag goes into the file name (capacitors-field.fall-2026.csv)
 * rather than into the data, so MATLAB and Excel read the CSV as is while a number in a lab
 * report can still be traced to the build that produced it.
 */
export function downloadText(filename, text, mime = 'text/csv') {
  filename = filename.replace(/(\.[a-z0-9]+)$/i, `.${SEMESTER}$1`);
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
