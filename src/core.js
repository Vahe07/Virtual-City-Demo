'use strict';
/* core.js — constants, maths, colour and text helpers */
const W = 28, H = 28;               // map size in tiles
const HW = 32, HH = 16;             // half tile width / height in iso px
const FH = 7;                       // px per floor
const ZT = 38;                      // px of height per tile (for round things)
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1], OPP = [2, 3, 0, 1];
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const idx = (x, y) => y * W + x;
const inMap = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const ix = (x, y) => (x - y) * HW;
const iy = (x, y, z) => (x + y) * HH - (z || 0);
const hhmm = s => (s == null ? null : (+s.slice(0, 2)) * 60 + (+s.slice(3, 5)));

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashN(a, b, c, d) {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ (b | 0), 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16) ^ (c | 0), 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15) ^ (d | 0), 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));
function shuffle(r, arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  return arr;
}
function wpick(r, items, weights) {
  let s = 0; for (const w of weights) s += w;
  let q = r() * s;
  for (let i = 0; i < items.length; i++) { q -= weights[i]; if (q <= 0) return items[i]; }
  return items[items.length - 1];
}
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
function approachAngle(a, b, step) { const d = angDiff(a, b); return Math.abs(d) <= step ? b : a + Math.sign(d) * step; }

/* text */
function plural(n, f) {
  n = Math.abs(n) % 100; const n1 = n % 10;
  if (n > 10 && n < 20) return f[2];
  if (n1 > 1 && n1 < 5) return f[1];
  if (n1 === 1) return f[0];
  return f[2];
}
const NF0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const NF1 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmt = n => NF0.format(Math.round(n));
const fmt1 = n => NF1.format(n);
function hm(m) { m = ((Math.floor(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
const ageStr = a => a + ' ' + plural(a, ['год', 'года', 'лет']);
const gf = (t, g) => { const s = t.split('|'); return g === 'f' && s[1] ? s[1] : s[0]; };
function surF(m) { if (/(ов|ев|ёв|ин|ын)$/.test(m)) return m + 'а'; if (/(ский|цкий)$/.test(m)) return m.slice(0, -2) + 'ая'; return m; }
function surPl(m) { if (/(ов|ев|ёв|ин|ын)$/.test(m)) return m + 'ых'; if (/(ский|цкий)$/.test(m)) return m.slice(0, -2) + 'их'; return m; }
const lc1 = s => s.charAt(0).toLowerCase() + s.slice(1);

/* colour */
const RGB = new Map();
function rgb(hex) {
  let c = RGB.get(hex);
  if (!c) { const n = parseInt(hex.slice(1), 16); c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; RGB.set(hex, c); }
  return c;
}
function hex3(r, g, b) { const f = v => clamp(Math.round(v), 0, 255); return '#' + ((1 << 24) | (f(r) << 16) | (f(g) << 8) | f(b)).toString(16).slice(1); }
function mixHex(a, b, t) { const A = rgb(a), B = rgb(b); return hex3(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
const SHADE = '#24304a';
const faceL = c => mixHex(c, SHADE, 0.14);
const faceR = c => mixHex(c, SHADE, 0.3);
const lighten = (c, t) => mixHex(c, '#ffffff', t);
const darken = (c, t) => mixHex(c, SHADE, t);
let AMB = [1, 1, 1], ambKey = '';
const SHC = new Map();
function setAmbient(r, g, b) {
  const k = Math.round(r * 160) + ',' + Math.round(g * 160) + ',' + Math.round(b * 160);
  if (k !== ambKey) { ambKey = k; AMB = [r, g, b]; SHC.clear(); }
}
function sh(hex) {
  let s = SHC.get(hex);
  if (s === undefined) {
    const c = rgb(hex);
    s = 'rgb(' + Math.min(255, c[0] * AMB[0] | 0) + ',' + Math.min(255, c[1] * AMB[1] | 0) + ',' + Math.min(255, c[2] * AMB[2] | 0) + ')';
    SHC.set(hex, s);
  }
  return s;
}

/* geometry recording: every vertex written while REC is an array lands in it (for hulls) */
let REC = null;
function mv(p, x, y, z) { const X = (x - y) * HW, Y = (x + y) * HH - z; p.moveTo(X, Y); if (REC) REC.push(X, Y); }
function ln(p, x, y, z) { const X = (x - y) * HW, Y = (x + y) * HH - z; p.lineTo(X, Y); if (REC) REC.push(X, Y); }
function recPt(X, Y) { if (REC) REC.push(X, Y); }
function recW(x, y, z) { recPt((x - y) * HW, (x + y) * HH - z); }
function ell(p, X, Y, rx, ry) {
  p.moveTo(X + rx, Y); p.ellipse(X, Y, rx, ry, 0, 0, TAU); p.closePath();
  recPt(X - rx, Y - ry); recPt(X + rx, Y + ry); recPt(X - rx, Y + ry); recPt(X + rx, Y - ry);
}
function hull2(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop();
  return lo.concat(up);
}
function inPoly(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (((a[1] > y) !== (b[1] > y)) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) c = !c;
  }
  return c;
}
