/* geo.js — static geometry: ground layers, building models, shadows */
const GC = {
  grass: ['#a2d06f', '#9bcb69', '#a8d575'], park: '#acd97c', trees: '#90c460', court: '#a6d178', sand: '#f0dda8',
  w1: '#62c6d2', w2: '#43b2c6', w3: '#2c98b9', road: '#5c6370', plaza: '#e3dccc', parking: '#868c95', field: '#63b65b',
  solar: '#8d977c', runway: '#4b5059', apron: '#a3a9af',
};
const GROUND = { base: null, groups: [], details: [], shimmer: [], foam: [], walls: [] };
const GATES = [4.6, 6.0, 7.4];

class Ops {
  constructor() { this.list = []; }
  f(c, fn) {
    const last = this.list[this.list.length - 1];
    if (last && last.k === 0 && last.c === c) { fn(last.p); return; }
    const p = new Path2D(); fn(p); this.list.push({ k: 0, c, p });
  }
  s(c, w, fn) { const p = new Path2D(); fn(p); this.list.push({ k: 2, c, w, p }); }
  push(op) { this.list.push(op); }
}

/* primitives (world tile coords, z in px) */
function faceQuadL(p, xa, xb, y, za, zb) { mv(p, xa, y, za); ln(p, xb, y, za); ln(p, xb, y, zb); ln(p, xa, y, zb); p.closePath(); }
function faceQuadR(p, ya, yb, x, za, zb) { mv(p, x, ya, za); ln(p, x, yb, za); ln(p, x, yb, zb); ln(p, x, ya, zb); p.closePath(); }
function wrect(p, x0, y0, x1, y1, z) { z = z || 0; mv(p, x0, y0, z); ln(p, x1, y0, z); ln(p, x1, y1, z); ln(p, x0, y1, z); p.closePath(); }
function disc(p, cx, cy, r, z, n) { n = n || 16; for (let i = 0; i < n; i++) { const a = i / n * TAU, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; i ? ln(p, x, y, z) : mv(p, x, y, z); } p.closePath(); }
function ring(p, cx, cy, r0, r1, z, n) {
  n = n || 24; z = z || 0;
  for (let i = 0; i <= n; i++) { const a = i / n * TAU, x = cx + Math.cos(a) * r1, y = cy + Math.sin(a) * r1; i ? ln(p, x, y, z) : mv(p, x, y, z); }
  p.closePath();
  for (let i = n; i >= 0; i--) { const a = i / n * TAU, x = cx + Math.cos(a) * r0, y = cy + Math.sin(a) * r0; i === n ? mv(p, x, y, z) : ln(p, x, y, z); }
  p.closePath();
}
function box(o, x0, y0, x1, y1, z0, z1, top, wall) {
  o.f(faceL(wall), p => faceQuadL(p, x0, x1, y1, z0, z1));
  o.f(faceR(wall), p => faceQuadR(p, y0, y1, x1, z0, z1));
  o.f(top, p => wrect(p, x0, y0, x1, y1, z1));
}
function gable(o, x0, y0, x1, y1, z1, rh, roof, wall, alongX) {
  const back = mixHex(roof, SHADE, 0.32), side = mixHex(roof, SHADE, 0.14);
  if (alongX) {
    const ym = (y0 + y1) / 2;
    o.f(back, p => { mv(p, x0, y0, z1); ln(p, x1, y0, z1); ln(p, x1, ym, z1 + rh); ln(p, x0, ym, z1 + rh); p.closePath(); });
    o.f(faceR(wall), p => { mv(p, x1, y0, z1); ln(p, x1, y1, z1); ln(p, x1, ym, z1 + rh); p.closePath(); });
    o.f(roof, p => { mv(p, x0, ym, z1 + rh); ln(p, x1, ym, z1 + rh); ln(p, x1, y1, z1); ln(p, x0, y1, z1); p.closePath(); });
  } else {
    const xm = (x0 + x1) / 2;
    o.f(back, p => { mv(p, x0, y0, z1); ln(p, xm, y0, z1 + rh); ln(p, xm, y1, z1 + rh); ln(p, x0, y1, z1); p.closePath(); });
    o.f(faceL(wall), p => { mv(p, x0, y1, z1); ln(p, x1, y1, z1); ln(p, xm, y1, z1 + rh); p.closePath(); });
    o.f(side, p => { mv(p, xm, y0, z1 + rh); ln(p, x1, y0, z1); ln(p, x1, y1, z1); ln(p, xm, y1, z1 + rh); p.closePath(); });
  }
}
function winGrid(o, b, x0, y0, x1, y1, zb, floors, fh, opt) {
  const G = 4, PL = [], PR = [];
  for (let g = 0; g < G; g++) { PL.push(new Path2D()); PR.push(new Path2D()); }
  const d = opt.d || 3.5, nL = Math.max(1, Math.round((x1 - x0) * d)), nR = Math.max(1, Math.round((y1 - y0) * d));
  const m = opt.m ?? 0.22, v0 = opt.v0 ?? 0.3, v1 = opt.v1 ?? 0.78, doL = opt.only !== 'R', doR = opt.only !== 'L';
  for (let f = opt.from || 0; f < floors; f++) {
    const za = zb + f * fh + fh * v0, zc = zb + f * fh + fh * v1;
    if (opt.band) {
      if (doL) faceQuadL(PL[(hashN(b.id, f, 7) * G) | 0], x0 + (x1 - x0) * 0.03, x0 + (x1 - x0) * 0.97, y1, za, zc);
      if (doR) faceQuadR(PR[(hashN(b.id, f, 9) * G) | 0], y0 + (y1 - y0) * 0.03, y0 + (y1 - y0) * 0.97, x1, za, zc);
      continue;
    }
    if (doL) for (let c = 0; c < nL; c++) faceQuadL(PL[(hashN(b.id, 1, f, c) * G) | 0], x0 + (x1 - x0) * (c + m) / nL, x0 + (x1 - x0) * (c + 1 - m) / nL, y1, za, zc);
    if (doR) for (let c = 0; c < nR; c++) faceQuadR(PR[(hashN(b.id, 2, f, c) * G) | 0], y0 + (y1 - y0) * (c + m) / nR, y0 + (y1 - y0) * (c + 1 - m) / nR, x1, za, zc);
  }
  for (let g = 0; g < G; g++) {
    if (doL) o.push({ k: 1, win: g, c: opt.gL, p: PL[g] });
    if (doR) o.push({ k: 1, win: g, c: opt.gR, p: PR[g] });
  }
}
function storeWin(o, x0, y0, x1, y1, za, zb, c) {
  const pL = new Path2D(), pR = new Path2D();
  faceQuadL(pL, x0 + 0.06, x1 - 0.06, y1, za, zb); faceQuadR(pR, y0 + 0.06, y1 - 0.06, x1, za, zb);
  o.push({ k: 4, c, p: pL }); o.push({ k: 4, c: mixHex(c, SHADE, 0.18), p: pR });
}
function awning(o, side, a0, a1, fixed, z, depth, drop, c1, c2, n) {
  const p1 = new Path2D(), p2 = new Path2D();
  for (let i = 0; i < n; i++) {
    const a = lerp(a0, a1, i / n), e = lerp(a0, a1, (i + 1) / n), p = i % 2 ? p2 : p1;
    if (side === 'L') { mv(p, a, fixed, z); ln(p, e, fixed, z); ln(p, e, fixed + depth, z - drop); ln(p, a, fixed + depth, z - drop); }
    else { mv(p, fixed, a, z); ln(p, fixed, e, z); ln(p, fixed + depth, e, z - drop); ln(p, fixed + depth, a, z - drop); }
    p.closePath();
  }
  o.push({ k: 0, c: c1, p: p1 }); o.push({ k: 0, c: c2, p: p2 });
}
function glowL(o, xa, xb, y, za, zb, c, always) { const p = new Path2D(); faceQuadL(p, xa, xb, y, za, zb); o.push({ k: 3, c: faceL(c), glow: lighten(c, 0.42), p, always: !!always }); }
function glowR(o, ya, yb, x, za, zb, c, always) { const p = new Path2D(); faceQuadR(p, ya, yb, x, za, zb); o.push({ k: 3, c: faceR(c), glow: lighten(c, 0.3), p, always: !!always }); }
function colonnadeL(o, xa, xb, yWall, yCol, za, zb, n, colC, backC) {
  o.f(faceL(backC), p => faceQuadL(p, xa, xb, yWall, za, zb));
  const pc = new Path2D();
  for (let i = 0; i < n; i++) { const u = xa + (xb - xa) * (i + 0.5) / n; faceQuadL(pc, u - 0.026, u + 0.026, yCol, za, zb); }
  o.push({ k: 0, c: faceL(colC), p: pc });
}
function colonnadeR(o, ya, yb, xWall, xCol, za, zb, n, colC, backC) {
  o.f(faceR(backC), p => faceQuadR(p, ya, yb, xWall, za, zb));
  const pc = new Path2D();
  for (let i = 0; i < n; i++) { const u = ya + (yb - ya) * (i + 0.5) / n; faceQuadR(pc, u - 0.026, u + 0.026, xCol, za, zb); }
  o.push({ k: 0, c: faceR(colC), p: pc });
}
function pedimentL(o, x0, x1, y, z, h, c) { o.f(faceL(c), p => { mv(p, x0, y, z); ln(p, x1, y, z); ln(p, (x0 + x1) / 2, y, z + h); p.closePath(); }); }
function pedimentR(o, y0, y1, x, z, h, c) { o.f(faceR(c), p => { mv(p, x, y0, z); ln(p, x, y1, z); ln(p, x, (y0 + y1) / 2, z + h); p.closePath(); }); }
function umbrella(o, x, y, h, r, c, z0) {
  z0 = z0 || 0;
  o.f('#7a6656', p => wrect(p, x - 0.04, y - 0.04, x + 0.04, y + 0.04, z0 + 2.6));
  o.s('#5d5d5d', 0.6, p => { mv(p, x, y, z0); ln(p, x, y, z0 + h); });
  const X = ix(x, y), Y = iy(x, y, z0 + h);
  o.f(c, p => ell(p, X, Y, r * 45.25, r * 22.6));
  o.f(lighten(c, 0.38), p => ell(p, X - r * 9, Y - r * 4, r * 18, r * 9));
}
function discFace(p, face, fx, fy, cz, r) {
  for (let i = 0; i <= 16; i++) {
    const a = i / 16 * TAU, u = Math.cos(a) * r, z = cz + Math.sin(a) * r * ZT;
    const x = face === 'R' ? fx : fx + u, y = face === 'R' ? fy - u : fy;
    i ? ln(p, x, y, z) : mv(p, x, y, z);
  }
  p.closePath();
}

/* building models */
const GEO = {};
GEO.apt = GEO.aptB = function (b, o) {
  const r = mulberry32(b.id * 131 + 7);
  const m = 0.07, x0 = b.x + m, y0 = b.y + m, x1 = b.x + 1 - m, y1 = b.y + 1 - m, z1 = b.floors * FH + 2;
  box(o, x0, y0, x1, y1, 0, z1, lighten(b.roof, 0.2), b.wall);
  if (b.accent) {
    o.f(faceL(b.accent), p => faceQuadL(p, x0 + (x1 - x0) * 0.6, x0 + (x1 - x0) * 0.9, y1, 3, z1 - 1));
    o.f(faceR(b.accent), p => faceQuadR(p, y0 + (y1 - y0) * 0.08, y0 + (y1 - y0) * 0.3, x1, 3, z1 - 1));
  }
  o.f(faceL(darken(b.wall, 0.25)), p => faceQuadL(p, x0, x1, y1, 0, 2));
  o.f(faceR(darken(b.wall, 0.25)), p => faceQuadR(p, y0, y1, x1, 0, 2));
  o.f(b.roof, p => wrect(p, x0 + 0.035, y0 + 0.035, x1 - 0.035, y1 - 0.035, z1));
  winGrid(o, b, x0, y0, x1, y1, 2, b.floors, FH, { d: 3.5, m: 0.22, v0: 0.3, v1: 0.8, gL: b.accent ? '#9cc3d6' : '#a9c7d8', gR: b.accent ? '#7fa7bd' : '#8eadbf' });
  const dc = x0 + (x1 - x0) * 0.45;
  o.f('#55463b', p => faceQuadL(p, dc - 0.055, dc + 0.055, y1, 0, 5.6));
  box(o, dc - 0.085, y1, dc + 0.085, y1 + 0.07, 5.8, 7, '#d5cfc4', '#c9c2b6');
  const rx = x0 + 0.24 + r() * 0.22, ry = y0 + 0.2 + r() * 0.2;
  box(o, rx, ry, rx + 0.2, ry + 0.17, z1, z1 + 6, lighten(b.roof, 0.25), '#bdb6aa');
  if (b.kind === 'apt' && r() < 0.65) {
    const ax = x0 + 0.62 + r() * 0.12, ay = y0 + 0.62;
    o.s('#59606a', 0.7, p => { mv(p, ax, ay, z1); ln(p, ax, ay, z1 + 13); mv(p, ax - 0.07, ay + 0.03, z1 + 11); ln(p, ax + 0.07, ay - 0.03, z1 + 11); mv(p, ax - 0.05, ay + 0.02, z1 + 8.5); ln(p, ax + 0.05, ay - 0.02, z1 + 8.5); });
  } else if (r() < 0.6) box(o, x0 + 0.1, y1 - 0.25, x0 + 0.24, y1 - 0.1, z1, z1 + 3.5, '#c9ccd0', '#b6babe');
  b.sbox = [x0, y0, x1, y1, z1]; b.topZ = z1 + 6;
};
GEO.house = function (b, o) {
  const x0 = b.x + 0.18, y0 = b.y + 0.18, x1 = b.x + 0.74, y1 = b.y + 0.74, fh = 8, z1 = b.floors * fh + 1;
  box(o, x0, y0, x1, y1, 0, z1, b.wall, b.wall);
  winGrid(o, b, x0, y0, x1, y1, 1, b.floors, fh, { d: 3.6, m: 0.26, v0: 0.32, v1: 0.76, gL: '#b6cfdc', gR: '#97b5c6' });
  const dx = x0 + (x1 - x0) * 0.7;
  o.f('#7d5539', p => faceQuadL(p, dx - 0.05, dx + 0.05, y1, 0, 6.2));
  if (b.ridgeX) gable(o, x0, y0 - 0.05, x1, y1 + 0.05, z1, 10, b.roof, b.wall, true);
  else gable(o, x0 - 0.05, y0, x1 + 0.05, y1, z1, 10, b.roof, b.wall, false);
  box(o, x0 + 0.1, y0 + 0.12, x0 + 0.17, y0 + 0.19, z1 + 3, z1 + 13, '#8c7465', '#9d806d');
  b.sbox = [x0, y0, x1, y1, z1 + 7]; b.topZ = z1 + 12;
};
GEO.cafe = GEO.rest = function (b, o) {
  const rest = b.kind === 'rest';
  const x0 = b.x + 0.1, y0 = b.y + 0.1, x1 = b.x + (rest ? 0.72 : 0.66), y1 = b.y + (rest ? 0.72 : 0.66);
  const fl = b.floors || 1, gh = 9, z1 = gh + (fl - 1) * 8 + 2;
  box(o, x0, y0, x1, y1, 0, z1, lighten(b.wall, 0.22), b.wall);
  storeWin(o, x0, y0, x1, y1, 1.2, 7.4, '#bcd7e2');
  if (fl > 1) winGrid(o, b, x0, y0, x1, y1, gh + 1, fl - 1, 8, { d: 3.6, m: 0.24, v0: 0.22, v1: 0.72, gL: '#b2cfdc', gR: '#93b2c4' });
  const a1 = b.awn[0], a2 = b.awn[1];
  awning(o, 'L', x0, x1, y1, 8.8, 0.12, 3.2, mixHex(a1, SHADE, 0.05), mixHex(a2, SHADE, 0.05), 6);
  awning(o, 'R', y0, y1, x1, 8.8, 0.12, 3.2, mixHex(a1, SHADE, 0.2), mixHex(a2, SHADE, 0.2), 6);
  glowL(o, x0 + 0.05, x1 - 0.05, y1 - 0.02, z1, z1 + 5.2, a2);
  b.sgn = { w: x1 - x0 - 0.16, face: 'L', x: (x0 + x1) / 2, y: y1 - 0.02, z: z1 + 2.6, s: 3.1, txt: b.short };
  const spots = rest ? [[b.x + 0.86, b.y + 0.3], [b.x + 0.86, b.y + 0.62], [b.x + 0.4, b.y + 0.88]] : [[b.x + 0.83, b.y + 0.3], [b.x + 0.83, b.y + 0.62], [b.x + 0.36, b.y + 0.84]];
  for (const [ux, uy] of spots) umbrella(o, ux, uy, 10, 0.12, a2);
  b.sbox = [x0, y0, x1, y1, z1]; b.topZ = z1 + 7;
};
GEO.shop = function (b, o) {
  const x0 = b.x + 0.1, y0 = b.y + 0.1, x1 = b.x + 0.9, y1 = b.y + 0.9, fl = b.floors || 1, z1 = 10.5 + (fl - 1) * 8;
  box(o, x0, y0, x1, y1, 0, z1, lighten(b.wall, 0.15), b.wall);
  storeWin(o, x0, y0, x1, y1, 1, 7.2, '#bcd7e2');
  glowL(o, x0, x1, y1, 7.8, 10.5, b.sign); glowR(o, y0, y1, x1, 7.8, 10.5, b.sign);
  if (fl > 1) winGrid(o, b, x0, y0, x1, y1, 10.5, fl - 1, 8, { d: 3.5, m: 0.22, v0: 0.22, v1: 0.75, gL: '#b2cfdc', gR: '#93b2c4' });
  box(o, x0 + 0.5, y0 + 0.15, x0 + 0.68, y0 + 0.32, z1, z1 + 3.5, '#c9ccd0', '#b6babe');
  b.sgn = { w: 0.72, face: 'L', x: (x0 + x1) / 2, y: y1, z: 9.15, s: 2.3, txt: b.short.toUpperCase() };
  b.sbox = [x0, y0, x1, y1, z1]; b.topZ = z1 + 5;
};
GEO.office = function (b, o) {
  const x0 = b.x + 0.12, y0 = b.y + 0.12, x1 = b.x + 0.88, y1 = b.y + 0.88, fh = 6.4, zb = 4;
  const setback = b.floors >= 16, mainF = setback ? b.floors - 3 : b.floors, z1 = zb + mainF * fh;
  box(o, x0 - 0.02, y0 - 0.02, x1 + 0.02, y1 + 0.02, 0, zb, '#cfd6db', '#c3cbd1');
  storeWin(o, x0, y0, x1, y1, 0.6, zb - 0.4, '#9fc4d8');
  box(o, x0, y0, x1, y1, zb, z1, '#c9d1d7', b.wall);
  const gR = mixHex(b.glass, SHADE, 0.22);
  winGrid(o, b, x0, y0, x1, y1, zb, mainF, fh, { band: true, v0: 0.14, v1: 0.9, gL: b.glass, gR });
  let top = z1, s = 0;
  if (setback) {
    s = 0.12; const z2 = z1 + 3 * fh;
    box(o, x0 + s, y0 + s, x1 - s, y1 - s, z1, z2, '#c9d1d7', b.wall);
    winGrid(o, b, x0 + s, y0 + s, x1 - s, y1 - s, z1, 3, fh, { band: true, v0: 0.14, v1: 0.9, gL: b.glass, gR });
    top = z2;
  }
  box(o, x0 + s + 0.16, y0 + s + 0.16, x1 - s - 0.16, y1 - s - 0.16, top, top + 5, '#dfe5e9', '#cfd6db');
  glowL(o, x0 + s + 0.06, x1 - s - 0.06, y1 - s, top - 3.8, top - 0.3, b.brand || '#1769aa', true);
  if (b.floors >= 20) {
    const ax = b.x + 0.5, ay = b.y + 0.5;
    o.s('#8c949c', 1, p => { mv(p, ax, ay, top + 5); ln(p, ax, ay, top + 30); });
    BEACONS.push({ x: ax, y: ay, z: top + 30, col: 'red', per: 1.6, duty: 0.5, ph: 0 });
  }
  b.sgn = { w: x1 - x0 - 2 * s - 0.16, face: 'L', x: (x0 + x1) / 2, y: y1 - s, z: top - 2.05, s: 2.5, txt: b.short.toUpperCase() };
  b.sbox = [x0, y0, x1, y1, top]; b.topZ = top + 8;
};
GEO.school = function (b, o) {
  const x0 = b.x + 0.1, y0 = b.y + 0.12, x1 = b.x + 1.9, y1 = b.y + 1.86, z1 = 27;
  box(o, x0, y0, x1, y1, 0, z1, '#d8d0c3', '#e3986b');
  o.f('#aaa298', p => wrect(p, x0 + 0.05, y0 + 0.05, x1 - 0.05, y1 - 0.05, z1));
  o.f(faceL('#f3eee6'), p => faceQuadL(p, x0, x1, y1, z1 - 2.6, z1));
  o.f(faceR('#f3eee6'), p => faceQuadR(p, y0, y1, x1, z1 - 2.6, z1));
  winGrid(o, b, x0, y0, x1, y1, 1.6, 3, 8, { d: 3.2, m: 0.2, v0: 0.26, v1: 0.8, gL: '#b9d3df', gR: '#99b6c7' });
  const ex = b.x + 1.0;
  box(o, ex - 0.24, y1, ex + 0.24, y1 + 0.16, 0, 9.5, '#f1ece3', '#f1ebe1');
  o.f('#5c4a3f', p => faceQuadL(p, ex - 0.08, ex + 0.08, y1 + 0.16, 0, 7.2));
  b.sgn = { w: 0.44, face: 'L', x: ex, y: y1 + 0.16, z: 8.35, s: 1.7, txt: 'ШКОЛА № 1', col: '#3a2c24' };
  const fx = x0 + 0.25, fy = y1 - 0.25;
  o.s('#8b9097', 0.8, p => { mv(p, fx, fy, z1); ln(p, fx, fy, z1 + 20); });
  o.f('#14a3b8', p => { mv(p, fx, fy, z1 + 20); ln(p, fx + 0.24, fy, z1 + 18.6); ln(p, fx + 0.24, fy, z1 + 13.6); ln(p, fx, fy, z1 + 15); p.closePath(); });
  b.sbox = [x0, y0, x1, y1, z1]; b.topZ = z1 + 8;
};
GEO.kinder = function (b, o) {
  const x0 = b.x + 0.14, y0 = b.y + 0.14, x1 = b.x + 0.8, y1 = b.y + 0.8, z1 = 17;
  box(o, x0, y0, x1, y1, 0, z1, '#f4c64e', '#f4c64e');
  o.f(faceL('#6cc3d5'), p => faceQuadL(p, x0, x0 + 0.16, y1, 0, z1));
  o.f(faceR('#ff8a65'), p => faceQuadR(p, y1 - 0.16, y1, x1, 0, z1));
  winGrid(o, b, x0, y0, x1, y1, 1, 2, 8, { d: 3.4, m: 0.24, v0: 0.3, v1: 0.78, gL: '#bfe0ea', gR: '#a0c6d4' });
  o.f('#4a90c2', p => faceQuadL(p, x0 + 0.4, x0 + 0.5, y1, 0, 6.5));
  gable(o, x0, y0 - 0.05, x1, y1 + 0.05, z1, 11, '#e0573f', '#f4c64e', true);
  b.sbox = [x0, y0, x1, y1, z1 + 6]; b.topZ = z1 + 13;
};
GEO.ferris = function (b, o) {
  const cx = b.x + 0.5, cy = b.y + 0.5, R = 0.62, hz = 4 + R * ZT + 3;
  b.wh = { cx, cy, R, hz };
  box(o, cx - 0.3, cy - 0.22, cx + 0.3, cy + 0.22, 0, 3, '#d9d4c8', '#cfc8ba');
  o.s('#7b8794', 1.4, p => { mv(p, cx - 0.32, cy - 0.12, 3); ln(p, cx, cy - 0.04, hz); ln(p, cx + 0.32, cy - 0.12, 3); });
  box(o, cx + 0.28, cy + 0.26, cx + 0.46, cy + 0.42, 0, 7, '#e86f51', '#f2efe8');
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; recW(cx + R * Math.cos(a), cy, hz + R * ZT * Math.sin(a)); }
  b.dyn = dynFerris;
  b.sbox = [cx - R, cy - 0.05, cx + R, cy + 0.05, hz + R * ZT]; b.topZ = hz + R * ZT + 6;
};
GEO.radar = function (b, o) {
  const cx = b.x + 0.5, cy = b.y + 0.5;
  box(o, cx - 0.22, cy - 0.18, cx + 0.22, cy + 0.18, 0, 8, '#e8ecef', '#d9dee2');
  o.s('#8d969f', 1.6, p => { mv(p, cx, cy, 8); ln(p, cx, cy, 26); });
  recW(cx - 0.36, cy, 30); recW(cx + 0.36, cy, 30);
  b.dyn = dynRadar; b.rc = [cx, cy];
  b.sbox = [cx - 0.22, cy - 0.18, cx + 0.22, cy + 0.18, 16]; b.topZ = 34;
};
GEO.tower = function (b, o) {
  const cx = b.x + 0.5, cy = b.y + 0.5;
  box(o, cx - 0.38, cy - 0.38, cx + 0.38, cy + 0.38, 0, 9, '#dde3e7', '#e6ebee');
  winGrid(o, b, cx - 0.38, cy - 0.38, cx + 0.38, cy + 0.38, 1.5, 1, 7.5, { d: 3, m: 0.28, v0: 0.2, v1: 0.8, gL: '#a9c6d6', gR: '#8fb0c2' });
  box(o, cx - 0.14, cy - 0.14, cx + 0.14, cy + 0.14, 9, 58, '#eef1f3', '#e9edf0');
  box(o, cx - 0.27, cy - 0.27, cx + 0.27, cy + 0.27, 58, 59.5, '#cfd6db', '#c7cfd5');
  const pL = new Path2D(), pR = new Path2D();
  faceQuadL(pL, cx - 0.27, cx + 0.27, cy + 0.27, 59.5, 67.5); faceQuadR(pR, cy - 0.27, cy + 0.27, cx + 0.27, 59.5, 67.5);
  o.push({ k: 1, win: 0, c: '#3f6f73', p: pL }); o.push({ k: 1, win: 0, c: '#335d61', p: pR });
  box(o, cx - 0.3, cy - 0.3, cx + 0.3, cy + 0.3, 67.5, 70, '#e6ebee', '#cfd6db');
  o.s('#7b858f', 0.8, p => { mv(p, cx, cy, 70); ln(p, cx, cy, 84); });
  BEACONS.push({ x: cx, y: cy, z: 84.5, col: 'red', per: 1.2, duty: 0.5, ph: 0.2 });
  b.sbox = [cx - 0.14, cy - 0.14, cx + 0.14, cy + 0.14, 70]; b.topZ = 88;
};
GEO.museum = function (b, o) {
  const x0 = b.x + 0.12, y0 = b.y + 0.12, x1 = b.x + 0.88, y1 = b.y + 0.8, z1 = 21;
  box(o, x0, y0, x1, y1, 0, z1, '#cfd6cf', '#e9e1d1');
  winGrid(o, b, x0, y0, x1, y1, 3, 2, 8.5, { only: 'R', d: 3, m: 0.3, v0: 0.2, v1: 0.82, gL: '#b5ccd6', gR: '#97b0bd' });
  box(o, x0 + 0.06, y1, x1 - 0.06, y1 + 0.12, 0, 2.4, '#f1ebdf', '#e6dfcf');
  colonnadeL(o, x0 + 0.1, x1 - 0.1, y1, y1 + 0.1, 2.4, 16.5, 6, '#faf6ee', '#b4a68e');
  box(o, x0 + 0.06, y1, x1 - 0.06, y1 + 0.12, 16.5, 20, '#efe8da', '#efe8da');
  pedimentL(o, x0 + 0.06, x1 - 0.06, y1 + 0.12, 20, 8, '#f4eee2');
  b.sgn = { w: 0.58, face: 'L', x: (x0 + x1) / 2, y: y1 + 0.12, z: 18.25, s: 1.9, txt: 'МУЗЕЙ', col: '#5a4a3a' };
  b.sbox = [x0, y0, x1, y1 + 0.12, z1]; b.topZ = z1 + 10;
};
GEO.theatre = function (b, o) {
  const x0 = b.x + 0.12, y0 = b.y + 0.1, x1 = b.x + 1.9, y1 = b.y + 1.72, z1 = 27;
  box(o, x0, y0, x1, y1, 0, z1, '#b8705d', '#e2cdb0');
  o.f('#9c5545', p => wrect(p, x0 + 0.05, y0 + 0.05, x1 - 0.05, y1 - 0.05, z1));
  box(o, x0 + 0.3, y0 + 0.12, x1 - 0.5, y0 + 0.9, z1, z1 + 15, '#a85d4c', '#d9c3a6');
  winGrid(o, b, x0, y0, x1, y1, 3, 3, 8, { only: 'R', d: 2.6, m: 0.3, v0: 0.2, v1: 0.8, gL: '#b5ccd6', gR: '#97b0bd' });
  const cx0 = x0 + 0.35, cx1 = x1 - 0.35;
  box(o, cx0 - 0.05, y1, cx1 + 0.05, y1 + 0.18, 0, 2.6, '#f1ebdf', '#e6dfcf');
  colonnadeL(o, cx0, cx1, y1, y1 + 0.15, 2.6, 20, 8, '#faf6ee', '#9e8c72');
  box(o, cx0 - 0.05, y1, cx1 + 0.05, y1 + 0.18, 20, 24, '#efe8da', '#efe8da');
  pedimentL(o, cx0 - 0.05, cx1 + 0.05, y1 + 0.18, 24, 10, '#f4eee2');
  b.sgn = { w: 1.1, face: 'L', x: (cx0 + cx1) / 2, y: y1 + 0.18, z: 22, s: 2.1, txt: 'ДРАМАТИЧЕСКИЙ ТЕАТР', col: '#5a4a3a' };
  b.sbox = [x0, y0, x1, y1, z1 + 8]; b.topZ = z1 + 17;
};
GEO.cinema = function (b, o) {
  const x0 = b.x + 0.12, y0 = b.y + 0.12, x1 = b.x + 0.86, y1 = b.y + 0.8, z1 = 19;
  box(o, x0, y0, x1, y1, 0, z1, '#4a4e6a', '#3f4360');
  storeWin(o, x0, y0, x1, y1, 0.8, 7, '#d9b46a');
  o.f(faceR('#5bc0eb'), p => faceQuadR(p, y0 + 0.12, y0 + 0.3, x1, 9, 16));
  o.f(faceR('#f2a541'), p => faceQuadR(p, y0 + 0.36, y0 + 0.54, x1, 9, 16));
  box(o, x0 + 0.04, y1, x1 - 0.04, y1 + 0.1, 8.5, 12.5, '#f5c84c', '#e94f64');
  glowL(o, x0 + 0.04, x1 - 0.04, y1 + 0.1, 8.5, 12.5, '#e94f64');
  box(o, x1 - 0.07, y1 - 0.2, x1 - 0.01, y1 - 0.04, 12, 30, '#ffd166', '#ffd166');
  glowL(o, x1 - 0.07, x1 - 0.01, y1 - 0.04, 12, 30, '#ffd166');
  b.sgn = { w: 0.56, face: 'L', x: (x0 + x1) / 2 - 0.03, y: y1 + 0.1, z: 10.5, s: 2.5, txt: 'ЗВЕЗДА', col: '#fff6d8' };
  b.sbox = [x0, y0, x1, y1, z1]; b.topZ = z1 + 13;
};
GEO.terminal = function (b, o) {
  const x0 = b.x + 0.1, y0 = b.y + 0.1, x1 = b.x + 1.94, y1 = b.y + 1.9, z1 = 22;
  box(o, x0, y0, x1, y1, 0, z1, '#e9eef1', '#dde6eb');
  winGrid(o, b, x0, y0, x1, y1, 1, 2, 10, { band: true, v0: 0.1, v1: 0.92, gL: '#6fb0d2', gR: '#5a9cc0' });
  box(o, x0 - 0.07, y0 - 0.07, x1 + 0.1, y1 + 0.1, z1, z1 + 2.4, '#f7f9fa', '#eef2f4');
  box(o, b.x + 0.42, b.y + 0.92, b.x + 1.48, b.y + 1.02, z1 + 2.4, z1 + 8.4, '#1769aa', '#1769aa');
  glowL(o, b.x + 0.42, b.x + 1.48, b.y + 1.02, z1 + 2.4, z1 + 8.4, '#1769aa', true);
  b.sgn = { w: 1.0, face: 'L', x: b.x + 0.95, y: b.y + 1.02, z: z1 + 5.4, s: 2.6, txt: 'АЭРОПОРТ VIRTUAL CITY' };
  b.sbox = [x0, y0, x1, y1, z1]; b.topZ = z1 + 12;
};
GEO.cityhall = function (b, o) {
  const x0 = b.x + 0.12, y0 = b.y + 0.12, x1 = b.x + 1.82, y1 = b.y + 1.88, z1 = 27;
  box(o, x0, y0, x1, y1, 0, z1, '#d7ccb8', '#efe5d3');
  o.f('#a3b6ae', p => wrect(p, x0 + 0.05, y0 + 0.05, x1 - 0.05, y1 - 0.05, z1));
  winGrid(o, b, x0, y0, x1, y1, 2, 3, 8, { d: 3, m: 0.28, v0: 0.2, v1: 0.8, gL: '#b2cad6', gR: '#94afbe' });
  const ya = b.y + 0.55, yb = b.y + 1.45;
  box(o, x1, ya - 0.05, x1 + 0.17, yb + 0.05, 0, 2.6, '#f1ebdf', '#e6dfcf');
  colonnadeR(o, ya, yb, x1, x1 + 0.15, 2.6, 20, 6, '#faf6ee', '#9e8c72');
  box(o, x1, ya - 0.05, x1 + 0.17, yb + 0.05, 20, 24, '#efe8da', '#efe8da');
  pedimentR(o, ya - 0.05, yb + 0.05, x1 + 0.17, 24, 9, '#f4eee2');
  const tx = b.x + 0.95, ty = b.y + 1.0, s = 0.19, tz1 = z1 + 26, cz = tz1 - 8;
  box(o, tx - s, ty - s, tx + s, ty + s, z1, tz1, '#e9dfcb', '#efe5d3');
  o.f('#fbfaf6', p => { discFace(p, 'R', tx + s + 0.003, ty, cz, 0.12); discFace(p, 'L', tx, ty + s + 0.003, cz, 0.12); });
  o.f(faceR('#3f7d6a'), p => { mv(p, tx + s, ty - s, tz1); ln(p, tx + s, ty + s, tz1); ln(p, tx, ty, tz1 + 18); p.closePath(); });
  o.f(faceL('#3f7d6a'), p => { mv(p, tx - s, ty + s, tz1); ln(p, tx + s, ty + s, tz1); ln(p, tx, ty, tz1 + 18); p.closePath(); });
  b.clock = { tx, ty, s, cz };
  b.dyn = dynClock;
  b.sgn = { w: 0.9, face: 'R', x: x1 + 0.17, y: (ya + yb) / 2, z: 22, s: 2.1, txt: 'МЭРИЯ', col: '#5a4a3a' };
  b.sbox = [x0, y0, x1, y1, z1]; b.topZ = tz1 + 20;
};
GEO.bank = function (b, o) {
  const x0 = b.x + 0.12, y0 = b.y + 0.12, x1 = b.x + 0.86, y1 = b.y + 0.86, z1 = 37;
  box(o, x0, y0, x1, y1, 0, z1, '#c3c9cd', '#d6dadd');
  colonnadeL(o, x0 + 0.04, x1 - 0.04, y1, y1 + 0.04, 1, 14, 5, '#f2f3f4', '#7f878d');
  colonnadeR(o, y0 + 0.04, y1 - 0.04, x1, x1 + 0.04, 1, 14, 5, '#f2f3f4', '#7f878d');
  o.f(faceL('#e5e8ea'), p => faceQuadL(p, x0, x1 + 0.04, y1 + 0.04, 14, 16.5));
  o.f(faceR('#e5e8ea'), p => faceQuadR(p, y0, y1 + 0.04, x1 + 0.04, 14, 16.5));
  winGrid(o, b, x0, y0, x1, y1, 17, 3, 6.6, { d: 3.4, m: 0.24, v0: 0.2, v1: 0.8, gL: '#a9c3d1', gR: '#8ea9b8' });
  box(o, x0 - 0.03, y0 - 0.03, x1 + 0.03, y1 + 0.03, z1, z1 + 2.6, '#e3e6e8', '#e3e6e8');
  glowR(o, y0 + 0.06, y1 - 0.06, x1 + 0.031, z1 + 0.2, z1 + 2.4, '#14a3b8', true);
  b.sgn = { w: 0.6, face: 'R', x: x1 + 0.032, y: (y0 + y1) / 2, z: z1 + 1.3, s: 1.6, txt: 'БАНК ЛАЗУРНЫЙ' };
  b.sbox = [x0, y0, x1, y1, z1]; b.topZ = z1 + 6;
};
GEO.hangar = function (b, o) {
  const x0 = b.x + 0.1, y0 = b.y + 0.12, x1 = b.x + 1.96, y1 = b.y + 1.88, z1 = 15;
  box(o, x0, y0, x1, y1, 0, z1, '#c1cad1', '#bac5cd');
  o.f(faceR('#e8ecef'), p => faceQuadR(p, y0 + 0.14, y1 - 0.14, x1 + 0.003, 0, 13.5));
  o.s(faceR('#b9c1c8'), 0.6, p => { for (let k = 1; k < 8; k++) { const y = lerp(y0 + 0.14, y1 - 0.14, k / 8); mv(p, x1 + 0.004, y, 0); ln(p, x1 + 0.004, y, 13.5); } });
  winGrid(o, b, x0, y0, x1, y1, 4, 1, 8, { only: 'L', d: 3, m: 0.3, v0: 0.3, v1: 0.7, gL: '#a9c6d6', gR: '#a9c6d6' });
  gable(o, x0, y0 - 0.04, x1, y1 + 0.04, z1, 10, '#9fb0bd', '#bac5cd', true);
  b.sgn = { w: 1.3, face: 'R', x: x1 + 0.004, y: (y0 + y1) / 2, z: z1 + 3.2, s: 2.2, txt: 'ТЕХЦЕНТР', col: '#2b2f36' };
  b.sbox = [x0, y0, x1, y1, z1 + 5]; b.topZ = z1 + 12;
};
GEO.hospital = function (b, o) {
  const x0 = b.x + 0.12, y0 = b.y + 0.12, x1 = b.x + 1.88, y1 = b.y + 1.8, z1 = 37;
  box(o, x0, y0, x1, y1, 0, z1, '#e9eef0', '#f3f6f7');
  o.f(faceL('#2a9d8f'), p => faceQuadL(p, x0, x1, y1, 0, 3));
  o.f(faceR('#2a9d8f'), p => faceQuadR(p, y0, y1, x1, 0, 3));
  winGrid(o, b, x0, y0, x1, y1, 3, 4, 8.2, { d: 3.4, m: 0.18, v0: 0.24, v1: 0.78, gL: '#a8d0dc', gR: '#8bb6c5' });
  const cxL = x0 + 0.3, cz = z1 - 6;
  o.f(faceL('#e23d3d'), p => { faceQuadL(p, cxL - 0.12, cxL + 0.12, y1 + 0.005, cz - 1.6, cz + 1.6); faceQuadL(p, cxL - 0.04, cxL + 0.04, y1 + 0.005, cz - 4.6, cz + 4.6); });
  const ex = b.x + 1.1;
  box(o, ex - 0.3, y1, ex + 0.3, y1 + 0.18, 7, 8.5, '#2a9d8f', '#2a9d8f');
  o.s('#9aa5ab', 0.8, p => { mv(p, ex - 0.28, y1 + 0.16, 0); ln(p, ex - 0.28, y1 + 0.16, 7); mv(p, ex + 0.28, y1 + 0.16, 0); ln(p, ex + 0.28, y1 + 0.16, 7); });
  const hx = b.x + 1.15, hy = b.y + 0.95;
  o.f('#7f8a90', p => disc(p, hx, hy, 0.36, z1 + 0.2, 20));
  o.f('#ffffff', p => { ring(p, hx, hy, 0.29, 0.32, z1 + 0.3, 20); wrect(p, hx - 0.12, hy - 0.13, hx - 0.08, hy + 0.13, z1 + 0.3); wrect(p, hx + 0.08, hy - 0.13, hx + 0.12, hy + 0.13, z1 + 0.3); wrect(p, hx - 0.08, hy - 0.02, hx + 0.08, hy + 0.02, z1 + 0.3); });
  b.sgn = { w: 0.54, face: 'L', x: ex, y: y1 + 0.18, z: 7.75, s: 1.3, txt: 'БОЛЬНИЦА' };
  b.sbox = [x0, y0, x1, y1, z1]; b.topZ = z1 + 6;
};
GEO.library = function (b, o) {
  const x0 = b.x + 0.12, y0 = b.y + 0.12, x1 = b.x + 0.86, y1 = b.y + 0.8, z1 = 19;
  box(o, x0, y0, x1, y1, 0, z1, '#bfa98a', '#d6c09f');
  winGrid(o, b, x0, y0, x1, y1, 2, 2, 8, { only: 'R', d: 3, m: 0.26, v0: 0.2, v1: 0.82, gL: '#b5ccd6', gR: '#97b0bd' });
  colonnadeL(o, x0 + 0.1, x1 - 0.1, y1, y1 + 0.08, 1, 15, 4, '#f4ede0', '#8f7a60');
  box(o, x0 + 0.06, y1, x1 - 0.06, y1 + 0.1, 15, 18.5, '#eadfcd', '#eadfcd');
  b.sgn = { w: 0.56, face: 'L', x: (x0 + x1) / 2, y: y1 + 0.1, z: 16.75, s: 1.6, txt: 'БИБЛИОТЕКА', col: '#4a3b2c' };
  b.sbox = [x0, y0, x1, y1, z1]; b.topZ = z1 + 5;
};
GEO.post = function (b, o) {
  const x0 = b.x + 0.12, y0 = b.y + 0.12, x1 = b.x + 0.86, y1 = b.y + 0.82, z1 = 18;
  box(o, x0, y0, x1, y1, 0, z1, '#d9e1ea', '#e9eef5');
  storeWin(o, x0, y0, x1, y1, 1, 6.8, '#bcd7e2');
  glowL(o, x0, x1, y1, 7.4, 10.4, '#2c6db5'); glowR(o, y0, y1, x1, 7.4, 10.4, '#2c6db5');
  winGrid(o, b, x0, y0, x1, y1, 10.4, 1, 7.6, { d: 3.4, m: 0.24, v0: 0.18, v1: 0.78, gL: '#b2cfdc', gR: '#93b2c4' });
  box(o, x1 + 0.04, y1 - 0.2, x1 + 0.1, y1 - 0.12, 0, 5, '#2c6db5', '#2c6db5');
  b.sgn = { w: 0.66, face: 'L', x: (x0 + x1) / 2, y: y1, z: 8.9, s: 2.2, txt: 'ПОЧТА' };
  b.sbox = [x0, y0, x1, y1, z1]; b.topZ = z1 + 5;
};
GEO.police = function (b, o) {
  const x0 = b.x + 0.12, y0 = b.y + 0.12, x1 = b.x + 0.88, y1 = b.y + 0.84, z1 = 26;
  box(o, x0, y0, x1, y1, 0, z1, '#d7dde4', '#eef1f5');
  storeWin(o, x0, y0, x1, y1, 1, 6.6, '#bcd7e2');
  glowL(o, x0, x1, y1, 7.2, 10.2, '#2f5fa7', true); glowR(o, y0, y1, x1, 7.2, 10.2, '#2f5fa7', true);
  winGrid(o, b, x0, y0, x1, y1, 10.2, 2, 7.8, { d: 3.4, m: 0.22, v0: 0.2, v1: 0.8, gL: '#b2cfdc', gR: '#93b2c4' });
  box(o, b.x + 0.4, b.y + 0.44, b.x + 0.62, b.y + 0.52, z1, z1 + 2, '#dfe5ea', '#cfd6db');
  BEACONS.push({ x: b.x + 0.45, y: b.y + 0.48, z: z1 + 2.6, col: 'blue', per: 0.8, duty: 0.45, ph: 0 },
    { x: b.x + 0.57, y: b.y + 0.48, z: z1 + 2.6, col: 'red', per: 0.8, duty: 0.45, ph: 0.4 });
  b.sgn = { w: 0.68, face: 'L', x: (x0 + x1) / 2, y: y1, z: 8.7, s: 2.1, txt: 'ПОЛИЦИЯ' };
  b.sbox = [x0, y0, x1, y1, z1]; b.topZ = z1 + 6;
};
GEO.fire = function (b, o) {
  const x0 = b.x + 0.12, y0 = b.y + 0.12, x1 = b.x + 0.88, y1 = b.y + 0.84, z1 = 18;
  box(o, x0, y0, x1, y1, 0, z1, '#b13d33', '#c9473b');
  o.f(faceL('#f2ede4'), p => { faceQuadL(p, x0 + 0.06, x0 + 0.36, y1, 0, 10); faceQuadL(p, x0 + 0.42, x0 + 0.72, y1, 0, 10); });
  o.s(faceL('#c7c0b4'), 0.5, p => { for (let k = 1; k < 5; k++) { const z = k * 2; mv(p, x0 + 0.06, y1, z); ln(p, x0 + 0.36, y1, z); mv(p, x0 + 0.42, y1, z); ln(p, x0 + 0.72, y1, z); } });
  winGrid(o, b, x0, y0, x1, y1, 11, 1, 7, { d: 3.4, m: 0.24, v0: 0.12, v1: 0.75, gL: '#b2cfdc', gR: '#93b2c4' });
  box(o, x0 + 0.02, y0 + 0.02, x0 + 0.24, y0 + 0.24, z1, z1 + 22, '#b13d33', '#c9473b');
  b.sgn = { w: 0.5, face: 'R', x: x1, y: (y0 + y1) / 2, z: 12.5, s: 2.4, txt: '01' };
  b.sbox = [x0, y0, x1, y1, z1]; b.topZ = z1 + 24;
};
GEO.gas = function (b, o) {
  const X = b.x, Y = b.y;
  box(o, X + 0.1, Y + 0.1, X + 0.48, Y + 0.4, 0, 9, '#eef1f3', '#e7ebee');
  storeWin(o, X + 0.1, Y + 0.1, X + 0.48, Y + 0.4, 1, 6.5, '#bcd7e2');
  for (const px of [X + 0.36, X + 0.66]) box(o, px - 0.035, Y + 0.62, px + 0.035, Y + 0.7, 0, 5, '#e04f3a', '#f4f4f4');
  o.s('#c9ced2', 1.1, p => { for (const [px, py] of [[X + 0.18, Y + 0.48], [X + 0.86, Y + 0.48], [X + 0.18, Y + 0.88], [X + 0.86, Y + 0.88]]) { mv(p, px, py, 0); ln(p, px, py, 12); } });
  box(o, X + 0.12, Y + 0.44, X + 0.92, Y + 0.92, 12, 14.6, '#f4f6f7', '#e8ecee');
  glowL(o, X + 0.12, X + 0.92, Y + 0.92, 12, 14.6, '#e04f3a', true); glowR(o, Y + 0.44, Y + 0.92, X + 0.92, 12, 14.6, '#e04f3a', true);
  b.sgn = { w: 0.72, face: 'L', x: X + 0.52, y: Y + 0.92, z: 13.3, s: 1.7, txt: 'АЗС ЛАЗУРЬ' };
  b.sbox = [X + 0.12, Y + 0.1, X + 0.92, Y + 0.92, 14]; b.topZ = 18;
};
GEO.watertower = function (b, o) {
  const cx = b.x + 0.5, cy = b.y + 0.5, zt = 34, zh = 15, r = 0.24;
  o.s('#8a929b', 1.3, p => { for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { mv(p, cx + dx * 0.25, cy + dy * 0.25, 0); ln(p, cx + dx * 0.15, cy + dy * 0.15, zt); } });
  o.s('#a3abb3', 0.7, p => { mv(p, cx - 0.21, cy + 0.21, 15); ln(p, cx + 0.21, cy + 0.21, 15); ln(p, cx + 0.21, cy - 0.21, 15); });
  const X = ix(cx, cy), Y = iy(cx, cy, 0), rx = r * 45.25, ry = r * 22.6, a35 = Math.acos(0.35);
  o.f('#7cc0d3', p => { p.moveTo(X - rx, Y - zt - zh); p.lineTo(X - rx, Y - zt); p.ellipse(X, Y - zt, rx, ry, 0, Math.PI, 0, true); p.lineTo(X + rx, Y - zt - zh); p.closePath(); recPt(X - rx, Y - zt + ry); recPt(X + rx, Y - zt + ry); });
  o.f('#5fa3b8', p => { p.moveTo(X + rx * 0.35, Y - zt - zh); p.lineTo(X + rx * 0.35, Y - zt + ry * Math.sin(a35)); p.ellipse(X, Y - zt, rx, ry, 0, a35, 0, true); p.lineTo(X + rx, Y - zt - zh); p.closePath(); });
  o.f('#4e93a8', p => { p.moveTo(X - rx, Y - zt - zh); p.lineTo(X, Y - zt - zh - 9); p.lineTo(X + rx, Y - zt - zh); p.ellipse(X, Y - zt - zh, rx, ry, 0, 0, Math.PI, false); p.closePath(); recPt(X, Y - zt - zh - 9); });
  b.sbox = [cx - 0.24, cy - 0.24, cx + 0.24, cy + 0.24, 52]; b.topZ = zt + zh + 12;
};
GEO.energy = function (b, o) {
  const x0 = b.x + 0.1, y0 = b.y + 0.12, x1 = b.x + 0.62, y1 = b.y + 0.7, z1 = 16;
  box(o, x0, y0, x1, y1, 0, z1, '#cfd8dc', '#dfe6e9');
  winGrid(o, b, x0, y0, x1, y1, 1, 1, 9, { d: 3.2, m: 0.24, v0: 0.2, v1: 0.8, gL: '#b2cfdc', gR: '#93b2c4' });
  glowL(o, x0, x1, y1, z1 - 4.4, z1 - 0.8, '#f2b705', true); glowR(o, y0, y1, x1, z1 - 4.4, z1 - 0.8, '#f2b705', true);
  for (const [tx, ty] of [[b.x + 0.78, b.y + 0.24], [b.x + 0.78, b.y + 0.6]]) {
    box(o, tx - 0.1, ty - 0.12, tx + 0.1, ty + 0.12, 0, 7, '#9aa3ab', '#8a939b');
    o.s('#5f6870', 0.6, p => { mv(p, tx, ty - 0.06, 7); ln(p, tx, ty - 0.06, 12); mv(p, tx, ty + 0.06, 7); ln(p, tx, ty + 0.06, 12); });
  }
  b.sgn = { w: 0.48, face: 'L', x: (x0 + x1) / 2, y: y1, z: z1 - 2.6, s: 1.5, txt: 'ЭНЕРГОЦЕНТР', col: '#2b2f36' };
  b.sbox = [x0, y0, x1, y1, z1]; b.topZ = z1 + 6;
};
GEO.turbine = function (b, o) {
  const cx = b.x + 0.5, cy = b.y + 0.5, hz = 92, X = ix(cx, cy), Y = iy(cx, cy, 0);
  box(o, cx - 0.12, cy - 0.12, cx + 0.12, cy + 0.12, 0, 2, '#c9ccd0', '#bfc3c7');
  o.f('#eef1f3', p => { p.moveTo(X - 2.4, Y - 1); p.lineTo(X + 0.2, Y - 1); p.lineTo(X + 0.1, Y - hz); p.lineTo(X - 1.1, Y - hz); p.closePath(); recPt(X - 2.4, Y); recPt(X + 2.4, Y); });
  o.f('#cbd3d9', p => { p.moveTo(X + 0.2, Y - 1); p.lineTo(X + 2.4, Y - 1); p.lineTo(X + 1.1, Y - hz); p.lineTo(X + 0.1, Y - hz); p.closePath(); });
  box(o, cx - 0.06, cy - 0.12, cx + 0.06, cy + 0.12, hz - 2, hz + 3, '#f4f6f8', '#e1e6ea');
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; recPt(X + Math.cos(a) * 22, Y - hz - Math.sin(a) * 36); }
  b.hub = [X, Y - hz + 0.5]; b.ph = b.id * 0.7; b.dyn = dynTurbine;
  BEACONS.push({ x: cx, y: cy, z: hz + 4, col: 'red', per: 2.2, duty: 0.35, ph: b.id * 0.3 });
  b.sbox = [cx - 0.04, cy - 0.04, cx + 0.04, cy + 0.04, hz]; b.topZ = hz + 40;
};
function mast(o, x, y) {
  o.s('#a3abb3', 1.3, p => { mv(p, x, y, 0); ln(p, x, y, 45); });
  box(o, x - 0.07, y - 0.07, x + 0.07, y + 0.07, 45, 48.5, '#f4f6f8', '#d9dee2');
}
function stand(o, x0, y0, x1, y1, h, inner) {
  box(o, x0, y0, x1, y1, 0, h, '#4f86c6', '#d8dce1');
  if (!inner) return;
  const p = new Path2D();
  for (let k = 0; k < 4; k++) {
    const za = 1.5 + k * (h - 2) / 4, zb = za + (h - 2) / 8;
    if (inner === 'L') faceQuadL(p, x0 + 0.02, x1 - 0.02, y1 + 0.002, za, zb); else faceQuadR(p, y0 + 0.02, y1 - 0.02, x1 + 0.002, za, zb);
  }
  o.push({ k: 0, c: inner === 'L' ? faceL('#2f6db0') : faceR('#2f6db0'), p });
}
GEO.stadium = function (b, o) {
  const X0 = b.x + 0.06, Y0 = b.y + 0.06, X1 = b.x + 2.94, Y1 = b.y + 2.94, t = 0.42;
  mast(o, X0 + 0.04, Y0 + 0.04);
  stand(o, X0, Y0, X1, Y0 + t, 15, 'L');
  stand(o, X0, Y0 + t, X0 + t, Y1 - t, 15, 'R');
  box(o, b.x + 1.05, Y0 + 0.04, b.x + 1.95, Y0 + 0.16, 15, 25, '#2b2f36', '#2b2f36');
  mast(o, X1 - 0.04, Y0 + 0.04); mast(o, X0 + 0.04, Y1 - 0.04);
  stand(o, X1 - t, Y0 + t, X1, Y1 - t, 8, null);
  stand(o, X0, Y1 - t, X1, Y1, 8, null);
  mast(o, X1 - 0.04, Y1 - 0.04);
  for (const [mx, my] of [[X0 + 0.04, Y0 + 0.04], [X1 - 0.04, Y0 + 0.04], [X0 + 0.04, Y1 - 0.04], [X1 - 0.04, Y1 - 0.04]]) FLOODS.push([mx, my, 47]);
  b.score = { x: b.x + 1.5, y: Y0 + 0.16, z: 20 };
  b.field = [b.x + 0.62, b.y + 0.62, b.x + 2.38, b.y + 2.38];
  b.dyn = dynStadium;
  b.sbox = [X0, Y0, X1, Y1, 12]; b.topZ = 52;
};
GEO.hotel = function (b, o) {
  const x0 = b.x + 0.12, y0 = b.y + 0.12, x1 = b.x + 0.88, y1 = b.y + 0.86, f = 7, z1 = 3 + f * FH;
  box(o, x0, y0, x1, y1, 0, z1, '#e9ecee', '#f6f4ef');
  winGrid(o, b, x0, y0, x1, y1, 3, f, FH, { d: 3.6, m: 0.18, v0: 0.22, v1: 0.82, gL: '#8fc3da', gR: '#76a9c0' });
  const slab = new Path2D(), shad = new Path2D();
  for (let k = 1; k <= f; k++) {
    const z = 3 + k * FH - 1.2;
    faceQuadL(shad, x0, x1, y1 + 0.005, z - 1.2, z); faceQuadR(shad, y0, y1, x1 + 0.005, z - 1.2, z);
    faceQuadL(slab, x0 - 0.01, x1 + 0.01, y1 + 0.04, z, z + 1.1); faceQuadR(slab, y0 - 0.01, y1 + 0.01, x1 + 0.04, z, z + 1.1);
  }
  o.push({ k: 0, c: '#9eb3c0', p: shad }); o.push({ k: 0, c: '#fbfaf7', p: slab });
  o.f('#d6d2c8', p => wrect(p, x0 + 0.08, y0 + 0.08, x1 - 0.08, y1 - 0.08, z1 + 0.2));
  o.f('#4fc3e0', p => wrect(p, x0 + 0.14, y0 + 0.14, x1 - 0.32, y1 - 0.16, z1 + 0.4));
  umbrella(o, x1 - 0.18, y0 + 0.3, 7, 0.1, '#ff6b4a', z1);
  umbrella(o, x1 - 0.18, y1 - 0.24, 7, 0.1, '#f2c230', z1);
  b.sgn = { w: 0.62, face: 'L', x: (x0 + x1) / 2, y: y1 + 0.04, z: z1 - 3.2, s: 2.5, txt: 'БРИЗ', col: '#1d5f86' };
  b.sbox = [x0, y0, x1, y1, z1]; b.topZ = z1 + 10;
};
GEO.grandhotel = function (b, o) {
  const x0 = b.x + 0.12, y0 = b.y + 0.12, x1 = b.x + 0.88, y1 = b.y + 0.88, f = 14, z1 = 4 + f * FH;
  box(o, x0 - 0.02, y0 - 0.02, x1 + 0.02, y1 + 0.02, 0, 4, '#c9a45c', '#c9a45c');
  storeWin(o, x0, y0, x1, y1, 0.6, 3.6, '#e7d3a1');
  box(o, x0, y0, x1, y1, 4, z1, '#d8cfbf', '#ece3d4');
  winGrid(o, b, x0, y0, x1, y1, 4, f, FH, { d: 3.8, m: 0.2, v0: 0.22, v1: 0.84, gL: '#9ec0d4', gR: '#84a7bb' });
  o.f(faceL('#c9a45c'), p => { faceQuadL(p, x0, x0 + 0.05, y1, 4, z1); faceQuadL(p, x1 - 0.05, x1, y1, 4, z1); });
  o.f(faceR('#c9a45c'), p => { faceQuadR(p, y0, y0 + 0.05, x1, 4, z1); faceQuadR(p, y1 - 0.05, y1, x1, 4, z1); });
  box(o, x0 + 0.08, y0 + 0.08, x1 - 0.08, y1 - 0.08, z1, z1 + 7, '#d9b46a', '#c9a45c');
  glowL(o, x0 + 0.12, x1 - 0.12, y1 - 0.08, z1 + 1.5, z1 + 6, '#b8873a', true);
  b.sgn = { w: 0.48, face: 'L', x: (x0 + x1) / 2, y: y1 - 0.08, z: z1 + 3.75, s: 2.3, txt: 'ЛАЗУРЬ', col: '#fff6dc' };
  b.sbox = [x0, y0, x1, y1, z1 + 7]; b.topZ = z1 + 12;
};
GEO.mall = function (b, o) {
  const x0 = b.x + 0.1, y0 = b.y + 0.1, x1 = b.x + 1.9, y1 = b.y + 1.9, z1 = 26;
  box(o, x0, y0, x1, y1, 0, z1, '#d5d2cc', '#e9e6e1');
  storeWin(o, x0, y0, x1, y1, 1, 8.5, '#bcd7e2');
  winGrid(o, b, x0, y0, x1, y1, 10, 2, 8, { band: true, v0: 0.2, v1: 0.75, gL: '#9fc4d8', gR: '#86aec4' });
  box(o, b.x + 0.4, b.y + 0.35, b.x + 0.7, b.y + 0.6, z1, z1 + 4, '#c9ccd0', '#b6babe');
  box(o, b.x + 0.9, b.y + 0.35, b.x + 1.2, b.y + 0.6, z1, z1 + 4, '#c9ccd0', '#b6babe');
  box(o, x1 - 0.45, y1 - 0.45, x1 + 0.02, y1 + 0.02, 0, 33, '#c6e4f0', '#9ccbe0');
  glowL(o, b.x + 0.25, b.x + 1.25, y1, z1 - 6, z1 - 1.5, '#ff6b4a', true);
  b.sgn = { w: 0.95, face: 'L', x: b.x + 0.75, y: y1, z: z1 - 3.75, s: 2.9, txt: 'ЛАЗУРЬ МОЛЛ' };
  b.sbox = [x0, y0, x1, y1, z1]; b.topZ = z1 + 10;
};
GEO.yacht = function (b, o) {
  const x0 = b.x + 0.16, y0 = b.y + 0.14, x1 = b.x + 0.7, y1 = b.y + 0.62, z1 = 9;
  box(o, x0, y0, x1, y1, 0, z1, '#c79a6b', '#c79a6b');
  winGrid(o, b, x0, y0, x1, y1, 1, 1, 8, { d: 3.4, m: 0.25, v0: 0.3, v1: 0.75, gL: '#b9d6e2', gR: '#9cc0cf' });
  gable(o, x0 - 0.04, y0, x1 + 0.04, y1, z1, 8, '#f2f2ee', '#c79a6b', false);
  const mx = b.x + 0.85, my = b.y + 0.3;
  o.s('#e9edf0', 0.9, p => { mv(p, mx, my, 0); ln(p, mx, my, 34); });
  o.f('#ff6b4a', p => { mv(p, mx, my, 34); ln(p, mx + 0.2, my, 32); ln(p, mx, my, 30); p.closePath(); });
  b.sgn = { w: 0.48, face: 'L', x: (x0 + x1) / 2, y: y1, z: 6.8, s: 1.7, txt: 'ПАРУС' };
  b.sbox = [x0, y0, x1, y1, z1 + 4]; b.topZ = 36;
};
GEO.lighthouse = function (b, o) {
  const tx = b.x + 0.62, ty = b.y + 0.4, X = ix(tx, ty), Y = iy(tx, ty, 0), Ht = 72, rb = 0.2 * 45.25, rt = 0.12 * 45.25, n = 8;
  const pRl = new Path2D(), pRr = new Path2D(), pWl = new Path2D(), pWr = new Path2D();
  for (let k = 0; k < n; k++) {
    const za = k * Ht / n, zb = (k + 1) * Ht / n, wa = lerp(rb, rt, za / Ht), wb = lerp(rb, rt, zb / Ht);
    const Lp = k % 2 ? pRl : pWl, Rp = k % 2 ? pRr : pWr;
    Lp.moveTo(X - wa, Y - za); Lp.lineTo(X + wa * 0.15, Y - za); Lp.lineTo(X + wb * 0.15, Y - zb); Lp.lineTo(X - wb, Y - zb); Lp.closePath();
    Rp.moveTo(X + wa * 0.15, Y - za); Rp.lineTo(X + wa, Y - za); Rp.lineTo(X + wb, Y - zb); Rp.lineTo(X + wb * 0.15, Y - zb); Rp.closePath();
  }
  recPt(X - rb, Y + 2); recPt(X + rb, Y + 2); recPt(X - rt - 4, Y - Ht - 20); recPt(X + rt + 4, Y - Ht - 20);
  o.push({ k: 0, c: '#f6f3ec', p: pWl }); o.push({ k: 0, c: '#d9d5cc', p: pWr }); o.push({ k: 0, c: '#d6453d', p: pRl }); o.push({ k: 0, c: '#b13a33', p: pRr });
  o.f('#3a3f47', p => ell(p, X, Y - Ht, rt + 4, (rt + 4) / 2));
  const lp = new Path2D(); lp.rect(X - 4.6, Y - Ht - 9, 9.2, 9);
  o.push({ k: 3, c: '#e9f3f6', glow: '#fff2b0', p: lp, always: true });
  o.s('#3a3f47', 0.6, p => { p.moveTo(X - 4.6, Y - Ht - 9); p.lineTo(X + 4.6, Y - Ht - 9); p.moveTo(X, Y - Ht); p.lineTo(X, Y - Ht - 9); });
  o.f('#d6453d', p => { p.moveTo(X - 5.4, Y - Ht - 9); p.ellipse(X, Y - Ht - 9, 5.4, 5, 0, Math.PI, 0, false); p.closePath(); });
  o.s('#3a3f47', 0.7, p => { p.moveTo(X, Y - Ht - 14); p.lineTo(X, Y - Ht - 19); });
  b.lamp = [X, Y - Ht - 4.5, tx, ty];
  const hx0 = b.x + 0.06, hy0 = b.y + 0.56, hx1 = b.x + 0.42, hy1 = b.y + 0.92;
  box(o, hx0, hy0, hx1, hy1, 0, 8, '#f4f1ea', '#f4f1ea');
  winGrid(o, b, hx0, hy0, hx1, hy1, 1, 1, 7, { d: 3, m: 0.3, v0: 0.3, v1: 0.75, gL: '#b9d6e2', gR: '#9cc0cf' });
  gable(o, hx0, hy0 - 0.04, hx1, hy1 + 0.04, 8, 6, '#c8463a', '#f4f1ea', true);
  b.sbox = [tx - 0.15, ty - 0.15, tx + 0.15, ty + 0.15, 86]; b.topZ = Ht + 22;
};
GEO.box = function (b, o) {
  const x0 = b.x + 0.12, y0 = b.y + 0.12, x1 = b.x + b.s - 0.12, y1 = b.y + b.s - 0.12;
  box(o, x0, y0, x1, y1, 0, 16, '#d5d5d5', '#e5e5e5');
  b.sbox = [x0, y0, x1, y1, 16]; b.topZ = 20;
};

function buildGeo(b) {
  const o = new Ops();
  REC = [];
  (GEO[b.kind] || GEO.box)(b, o);
  b.ops = o.list;
  const pts = [];
  for (let i = 0; i < REC.length; i += 2) pts.push([REC[i], REC[i + 1]]);
  REC = null;
  b.hull = hull2(pts);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of b.hull) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
  b.bb = [x0 - 2, y0 - 2, x1 + 2, y1 + 2];
}

/* ground */
function waterDepth() {
  const d = new Uint8Array(W * H).fill(255), q = [];
  for (let i = 0; i < W * H; i++) if (!isWetT(ground[i])) { d[i] = 0; q.push(i); }
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % W, y = (i / W) | 0;
    for (let n = 0; n < 4; n++) {
      const nx = x + DX[n], ny = y + DY[n];
      if (!inMap(nx, ny)) continue;
      const j = idx(nx, ny);
      if (d[j] > d[i] + 1) { d[j] = d[i] + 1; q.push(j); }
    }
  }
  return d;
}
function sideStrip(p, x, y, d, w) {
  if (d === 0) wrect(p, x + 1 - w, y, x + 1, y + 1, 0);
  else if (d === 1) wrect(p, x, y + 1 - w, x + 1, y + 1, 0);
  else if (d === 2) wrect(p, x, y, x + w, y + 1, 0);
  else wrect(p, x, y, x + 1, y + w, 0);
}
function dashX(p, x, y) { wrect(p, x + 0.12, y + 0.488, x + 0.38, y + 0.512, 0); wrect(p, x + 0.62, y + 0.488, x + 0.88, y + 0.512, 0); }
function dashY(p, x, y) { wrect(p, x + 0.488, y + 0.12, x + 0.512, y + 0.38, 0); wrect(p, x + 0.488, y + 0.62, x + 0.512, y + 0.88, 0); }
function zebraAt(p, x, y, d) {
  for (let k = 0; k < 5; k++) {
    const a = 0.16 + k * 0.142, e = a + 0.075;
    if (d === 0) wrect(p, x + 0.72, y + a, x + 0.9, y + e, 0);
    else if (d === 2) wrect(p, x + 0.1, y + a, x + 0.28, y + e, 0);
    else if (d === 1) wrect(p, x + a, y + 0.72, x + e, y + 0.9, 0);
    else wrect(p, x + a, y + 0.1, x + e, y + 0.28, 0);
  }
}
function pitch(p, x0, y0, x1, y1) {
  const w = 0.025, xm = (x0 + x1) / 2, ym = (y0 + y1) / 2, bh = (y1 - y0) * 0.22, bw = (x1 - x0) * 0.13;
  wrect(p, x0, y0, x1, y0 + w, 0); wrect(p, x0, y1 - w, x1, y1, 0); wrect(p, x0, y0, x0 + w, y1, 0); wrect(p, x1 - w, y0, x1, y1, 0);
  wrect(p, xm - w / 2, y0, xm + w / 2, y1, 0);
  ring(p, xm, ym, 0.2, 0.2 + w, 0, 20);
  wrect(p, x0, ym - bh, x0 + bw, ym - bh + w, 0); wrect(p, x0, ym + bh - w, x0 + bw, ym + bh, 0); wrect(p, x0 + bw - w, ym - bh, x0 + bw, ym + bh, 0);
  wrect(p, x1 - bw, ym - bh, x1, ym - bh + w, 0); wrect(p, x1 - bw, ym + bh - w, x1, ym + bh, 0); wrect(p, x1 - bw, ym - bh, x1 - bw + w, ym + bh, 0);
}
function buildGround() {
  REC = null;
  const base = new Path2D(); wrect(base, 0, 0, W, H, 0);
  GROUND.base = base;
  const wd = waterDepth(), e = 0.006;
  const groups = new Map(), gp = c => { let p = groups.get(c); if (!p) { p = new Path2D(); groups.set(c, p); } return p; };
  const TC = { [TT.SAND]: GC.sand, [TT.PARK]: GC.park, [TT.TREES]: GC.trees, [TT.COURT]: GC.court, [TT.ROAD]: GC.road, [TT.PLAZA]: GC.plaza,
    [TT.PARKING]: GC.parking, [TT.FIELD]: GC.field, [TT.SOLAR]: GC.solar, [TT.RUNWAY]: GC.runway, [TT.APRON]: GC.apron };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y), t = ground[i];
    const c = isWetT(t) ? (wd[i] <= 1 ? GC.w1 : wd[i] <= 2 ? GC.w2 : GC.w3) : t === TT.GRASS ? GC.grass[(hashN(x, y, 3) * 3) | 0] : (TC[t] || GC.grass[0]);
    wrect(gp(c), x - e, y - e, x + 1 + e, y + 1 + e, 0);
  }
  GROUND.groups = Array.from(groups, ([c, p]) => ({ c, p }));
  buildDetails();
  buildWalls();
}
function buildDetails() {
  const L = [], lay = c => { const o = { c, p: new Path2D() }; L.push(o); return o.p; };
  const sidewalk = lay('#d5d1c5'), plazaIn = lay('#d9d1c0'), plazaRing = lay('#cdc3ad'), path = lay('#e9ddc0'), mow = lay('#6dc064'),
    rubber = lay('#d98a63'), sbRim = lay('#b98f5f'), sbox = lay('#ead8a2'),
    deck = lay(GC.road), walk = lay('#cfcabd'), edge = lay('#6f6d66'), rail = lay('#e6e1d4'),
    dash = lay('#ebe8dd'), zebra = lay('#efede6'), rmark = lay('#f1f1ec'), taxi = lay('#f0c23b'),
    pline = lay('#e8e7e1'), fline = lay('#f2f2ea'), panel = lay('#2f5292'), panelHi = lay('#a5bfe6'),
    pierPost = lay('#5e4630'), pierSide = lay('#8a6440'), pierDeck = lay('#c4966a'), plank = lay('#a77b51'),
    sandDot = lay('#e0c88e');
  const flw = [lay('#ff7a8a'), lay('#ffd166'), lay('#c79bff'), lay('#ffffff')];
  const SW = 0.13;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y), t = ground[i], m = rdir[i];
    if (t === TT.ROAD) {
      for (let d = 0; d < 4; d++) if (!(m & (1 << d))) sideStrip(sidewalk, x, y, d, SW);
      for (let d = 0; d < 4; d++) {
        const e2 = (d + 1) & 3;
        if ((m & (1 << d)) && (m & (1 << e2)) && !isRoadAt(x + DX[d] + DX[e2], y + DY[d] + DY[e2])) {
          const sx = DX[d] + DX[e2], sy = DY[d] + DY[e2], x0 = sx > 0 ? x + 1 - SW : x, y0 = sy > 0 ? y + 1 - SW : y;
          wrect(sidewalk, x0, y0, x0 + SW, y0 + SW, 0);
        }
      }
      if (m === 5) dashX(dash, x, y); else if (m === 10) dashY(dash, x, y);
      if (m === 5 || m === 10) for (const d of (m === 5 ? [0, 2] : [1, 3])) {
        const nx = x + DX[d], ny = y + DY[d];
        if (isRoadAt(nx, ny) && bits(rdir[idx(nx, ny)]) >= 3) zebraAt(zebra, x, y, d);
      }
    } else if (t === TT.BRIDGE) {
      if (m & 5) {
        wrect(deck, x - 0.01, y + 0.08, x + 1.01, y + 0.92, 0);
        wrect(walk, x - 0.01, y + 0.08, x + 1.01, y + 0.2, 0); wrect(walk, x - 0.01, y + 0.8, x + 1.01, y + 0.92, 0);
        faceQuadL(edge, x - 0.01, x + 1.01, y + 0.92, -4, 0);
        faceQuadL(rail, x, x + 1, y + 0.09, 0, 3); faceQuadL(rail, x, x + 1, y + 0.91, 0, 3);
        dashX(dash, x, y);
      } else {
        wrect(deck, x + 0.08, y - 0.01, x + 0.92, y + 1.01, 0);
        wrect(walk, x + 0.08, y - 0.01, x + 0.2, y + 1.01, 0); wrect(walk, x + 0.8, y - 0.01, x + 0.92, y + 1.01, 0);
        faceQuadR(edge, y - 0.01, y + 1.01, x + 0.92, -4, 0);
        faceQuadR(rail, y, y + 1, x + 0.09, 0, 3); faceQuadR(rail, y, y + 1, x + 0.91, 0, 3);
        dashY(dash, x, y);
      }
    } else if (t === TT.PLAZA) {
      for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) wrect(plazaIn, x + a * 0.5 + 0.03, y + c * 0.5 + 0.03, x + a * 0.5 + 0.47, y + c * 0.5 + 0.47, 0);
    } else if (t === TT.PARKING) {
      wrect(pline, x + 0.04, y + 0.49, x + 0.96, y + 0.51, 0);
      for (let k = 1; k < 4; k++) { const xx = x + k * 0.25; wrect(pline, xx - 0.012, y + 0.06, xx + 0.012, y + 0.42, 0); wrect(pline, xx - 0.012, y + 0.58, xx + 0.012, y + 0.94, 0); }
    } else if (t === TT.PARK) {
      const w = 0.075, cx = x + 0.5, cy = y + 0.5;
      wrect(path, cx - w, cy - w, cx + w, cy + w, 0);
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (!inMap(nx, ny)) continue;
        const nt = ground[idx(nx, ny)];
        if (nt === TT.PARK || nt === TT.ROAD) { const ex = cx + DX[d] * 0.5, ey = cy + DY[d] * 0.5; wrect(path, Math.min(cx, ex) - w, Math.min(cy, ey) - w, Math.max(cx, ex) + w, Math.max(cy, ey) + w, 0); }
      }
      if (hashN(x, y, 11) < 0.55 && occ[i] < 0) {
        const fx = x + 0.7, fy = y + 0.27;
        for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; disc(flw[(hashN(x, y, k) * 4) | 0], fx + Math.cos(a) * 0.075, fy + Math.sin(a) * 0.075, 0.03, 0, 6); }
      }
    } else if (t === TT.COURT) {
      if (hashN(x, y, 5) < 0.5) wrect(rubber, x + 0.4, y + 0.38, x + 0.86, y + 0.84, 0);
      else { wrect(sbRim, x + 0.46, y + 0.44, x + 0.84, y + 0.82, 0); wrect(sbox, x + 0.49, y + 0.47, x + 0.81, y + 0.79, 0); }
    } else if (t === TT.SAND) {
      for (let k = 0; k < 4; k++) disc(sandDot, x + 0.05 + hashN(x, y, k, 1) * 0.9, y + 0.05 + hashN(x, y, k, 2) * 0.9, 0.02, 0, 5);
    } else if (t === TT.SOLAR) {
      for (let k = 0; k < 3; k++) {
        const ya = y + 0.1 + k * 0.3, yb = ya + 0.19;
        mv(panel, x + 0.08, ya, 5.5); ln(panel, x + 0.92, ya, 5.5); ln(panel, x + 0.92, yb, 1.5); ln(panel, x + 0.08, yb, 1.5); panel.closePath();
        mv(panelHi, x + 0.08, ya, 5.5); ln(panelHi, x + 0.92, ya, 5.5); ln(panelHi, x + 0.92, ya + 0.02, 5.1); ln(panelHi, x + 0.08, ya + 0.02, 5.1); panelHi.closePath();
      }
    } else if (t === TT.RUNWAY) {
      wrect(rmark, x + 0.06, y, x + 0.1, y + 1, 0); wrect(rmark, x + 0.9, y, x + 0.94, y + 1, 0);
      if (y === 10 || y === 0) { const ya = y === 10 ? y + 0.55 : y + 0.08; for (let k = 0; k < 6; k++) { const xa = x + 0.16 + k * 0.118; wrect(rmark, xa, ya, xa + 0.06, ya + 0.36, 0); } }
      else wrect(rmark, x + 0.485, y + 0.2, x + 0.515, y + 0.66, 0);
      if (y === 8 || y === 2) { wrect(rmark, x + 0.2, y + 0.3, x + 0.36, y + 0.62, 0); wrect(rmark, x + 0.64, y + 0.3, x + 0.8, y + 0.62, 0); }
    }
  }
  wrect(taxi, 25.6, 1.1, 25.64, 10.5, 0);
  wrect(taxi, 25.62, 10.48, 26.12, 10.52, 0); wrect(taxi, 25.62, 3.48, 26.12, 3.52, 0);
  wrect(taxi, 25.45, 10.04, 25.8, 10.07, 0); wrect(taxi, 25.45, 10.1, 25.8, 10.13, 0);
  for (const g of GATES) { wrect(taxi, 24.3, g - 0.02, 25.62, g + 0.02, 0); wrect(taxi, 24.28, g - 0.15, 24.32, g + 0.15, 0); }
  pitch(fline, 6.12, 0.12, 7.88, 1.88);
  for (let k = 0; k < 6; k += 2) wrect(mow, 0.55 + k * 0.317, 17.55, 0.55 + (k + 1) * 0.317, 19.45, 0);
  pitch(fline, 0.6, 17.6, 2.4, 19.4);
  ring(plazaRing, 15.5, 9.0, 0.8, 0.86, 0); ring(plazaRing, 15.5, 9.0, 0.42, 0.47, 0);
  const pz = 3;
  for (let yy = 23.9; yy < 25.5; yy += 0.42) faceQuadR(pierPost, yy - 0.03, yy + 0.03, 14.68, -4, pz);
  for (let xx = 14.0; xx < 15.2; xx += 0.42) faceQuadL(pierPost, xx - 0.03, xx + 0.03, 26.25, -4, pz);
  faceQuadR(pierSide, 23.3, 25.55, 14.68, pz - 1.6, pz);
  faceQuadR(pierSide, 25.55, 26.25, 15.15, pz - 1.6, pz);
  faceQuadL(pierSide, 13.85, 15.15, 26.25, pz - 1.6, pz);
  wrect(pierDeck, 14.32, 23.3, 14.68, 25.6, pz); wrect(pierDeck, 13.85, 25.55, 15.15, 26.25, pz);
  for (let yy = 23.42; yy < 25.5; yy += 0.11) wrect(plank, 14.32, yy, 14.68, yy + 0.016, pz);
  for (let xx = 13.95; xx < 15.1; xx += 0.11) wrect(plank, xx, 25.55, xx + 0.016, 26.25, pz);
  GROUND.details = L;
  GROUND.shimmer = [0, 1, 2, 3].map(() => new Path2D());
  GROUND.foam = [new Path2D(), new Path2D()];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = ground[idx(x, y)];
    if (t !== TT.WATER && t !== TT.PIER) continue;
    for (let k = 0; k < 2; k++) {
      const g = (hashN(x, y, 21 + k) * 4) | 0, sx = x + 0.1 + hashN(x, y, 22 + k) * 0.55, sy = y + 0.15 + hashN(x, y, 24 + k) * 0.7;
      wrect(GROUND.shimmer[g], sx, sy, sx + 0.22, sy + 0.022, 0);
    }
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (inMap(nx, ny) && !isWetT(ground[idx(nx, ny)])) sideStrip(GROUND.foam[(x + y + d) & 1], x, y, d, 0.07);
    }
  }
}
function buildWalls() {
  const D = 30, m = new Map(), add = (c, fn) => { let p = m.get(c); if (!p) { p = new Path2D(); m.set(c, p); } fn(p); };
  for (let x = 0; x < W; x++) {
    const t = ground[idx(x, H - 1)], wet = isWetT(t), band = wet ? 13 : 5;
    add(wet ? '#2f9bb4' : t === TT.SAND ? '#d8c18c' : '#7fae4f', p => faceQuadL(p, x - 0.004, x + 1.004, H, -band, 0));
    add('#a07a57', p => faceQuadL(p, x - 0.004, x + 1.004, H, -D, -band));
  }
  for (let y = 0; y < H; y++) {
    const t = ground[idx(W - 1, y)], wet = isWetT(t), band = wet ? 13 : 5;
    add(wet ? '#26869e' : t === TT.SAND ? '#c2ab78' : '#6c9842', p => faceQuadR(p, y - 0.004, y + 1.004, W, -band, 0));
    add('#86664a', p => faceQuadR(p, y - 0.004, y + 1.004, W, -D, -band));
  }
  add('#8d6a4b', p => faceQuadL(p, 0, W, H, -22, -20));
  add('#755940', p => faceQuadR(p, 0, H, W, -22, -20));
  GROUND.walls = Array.from(m, ([c, p]) => ({ c, p }));
}

/* shadows: one union path, rebuilt as the sun moves */
let SHADOW = null;
function buildShadows(dx, dy) {
  const p = new Path2D();
  for (const b of BLD) {
    const [x0, y0, x1, y1, h] = b.sbox, ox = dx * h, oy = dy * h;
    const hl = hull2([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0 + ox, y0 + oy], [x1 + ox, y0 + oy], [x1 + ox, y1 + oy], [x0 + ox, y1 + oy]]);
    hl.forEach((q, i) => { const X = (q[0] - q[1]) * HW, Y = (q[0] + q[1]) * HH; i ? p.lineTo(X, Y) : p.moveTo(X, Y); });
    p.closePath();
  }
  for (const s of STATIC) if (s.t === 'tree') {
    const h = (s.type === 1 ? 22 : 17) * s.s, r = (s.type === 2 ? 0.16 : 0.12) * s.s, cx = s.x + dx * h * 0.65, cy = s.y + dy * h * 0.65;
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, X = (x - y) * HW, Y = (x + y) * HH;
      i ? p.lineTo(X, Y) : p.moveTo(X, Y);
    }
    p.closePath();
  }
  SHADOW = p;
}
