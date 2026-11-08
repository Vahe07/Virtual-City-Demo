/* draw.js — rendering */
let CV = null, CTX = null, VW = 0, VH = 0, DPR = 1, QDPR = 2, LIT = 'rgba(0,0,0,0)';
const CAM = { x: 0, y: 0, z: 0.62 };
const VIEW = { x0: 0, y0: 0, x1: 0, y1: 0 };
let SEL = null, SHOW_LABELS = true, OWNVIEW = false;
const SPR = {}, STARS = [], DYN = [];
const FONT_UI = '"Onest", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const PX = new Float64Array(4), PY = new Float64Array(4);
const FERRIS_COLS = ['#ff6b4a', '#14a3b8', '#f2c230', '#6aa98a', '#9a7fc0', '#ff8fab', '#2f6fb5', '#e8a33d'];
const CAT_DOT = { cafe: '#e8793a', food: '#c8463a', shop: '#7a4b9c', office: '#2f6fd6', gov: '#1769aa', edu: '#f2b705', health: '#2a9d8f',
  fun: '#ff6b4a', hotel: '#c9a45c', transport: '#14a3b8', infra: '#5c6370', home: '#8a94a0', house: '#8a94a0' };

function initCanvas() {
  CV = document.getElementById('city'); CTX = CV.getContext('2d');
  const cols = { warm: '255,206,120', white: '255,255,255', red: '255,72,72', green: '90,255,150', blue: '90,150,255', beam: '255,240,190' };
  for (const k in cols) SPR[k] = glowSprite(cols[k]);
  const r = mulberry32(99);
  for (let i = 0; i < 150; i++) STARS.push([r(), r() * 0.8, 0.5 + r() * 1.1, r() * TAU]);
  resize();
  addEventListener('resize', resize);
}
function glowSprite(c) {
  const s = document.createElement('canvas'); s.width = s.height = 64;
  const g = s.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${c},1)`); gr.addColorStop(0.22, `rgba(${c},0.6)`); gr.addColorStop(1, `rgba(${c},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return s;
}
function resize() {
  DPR = Math.min(QDPR, window.devicePixelRatio || 1);
  VW = Math.max(1, innerWidth); VH = Math.max(1, innerHeight);
  CV.width = Math.round(VW * DPR); CV.height = Math.round(VH * DPR);
  clampCam();
}

function render() {
  const c = CTX, z = CAM.z, nf = LIGHT.nf;
  LIT = nf > 0.12 ? 'rgba(255,212,128,' + (0.2 + 0.75 * nf).toFixed(2) + ')' : 'rgba(0,0,0,0)';
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawSky(c);
  const ox = VW / 2 - CAM.x * z, oy = VH / 2 - CAM.y * z;
  c.setTransform(z * DPR, 0, 0, z * DPR, ox * DPR, oy * DPR);
  VIEW.x0 = CAM.x - VW / 2 / z; VIEW.x1 = CAM.x + VW / 2 / z; VIEW.y0 = CAM.y - VH / 2 / z; VIEW.y1 = CAM.y + VH / 2 / z;
  ownCache();
  drawBase(c);
  drawGround(c);
  drawShadows(c);
  if (OWNVIEW) { c.fillStyle = 'rgba(16,28,40,0.3)'; c.fill(GROUND.base); }
  drawObjects(c);
  for (const p of PLANES) if (p.z >= 3) drawPlane(c, p);
  drawGlow(c);
  drawClouds(c);
  drawSelection(c);
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawLabels(c);
  drawPins(c);
  drawFx(c);
}
function drawSky(c) {
  const d = LIGHT.d, w = LIGHT.warm;
  const top = mixHex(mixHex('#0a1030', '#7cc6e2', d), '#4a4f86', w * 0.55);
  const bot = mixHex(mixHex('#1d2c50', '#e4f4f8', d), '#f6b183', w * 0.7);
  const g = c.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, top); g.addColorStop(1, bot);
  c.fillStyle = g; c.fillRect(0, 0, VW, VH);
  if (LIGHT.nf > 0.45) {
    const a = (LIGHT.nf - 0.45) / 0.55;
    c.fillStyle = '#ffffff';
    for (const s of STARS) { c.globalAlpha = a * (0.45 + 0.55 * Math.sin(SIM.anim * 0.8 + s[3]) ** 2); c.fillRect(s[0] * VW, s[1] * VH, s[2], s[2]); }
    c.globalAlpha = 1;
  }
}
function drawBase(c) {
  c.save(); c.scale(1, 0.5);
  const g = c.createRadialGradient(0, 980, 100, 0, 980, 1050);
  g.addColorStop(0, 'rgba(12,30,50,0.3)'); g.addColorStop(1, 'rgba(12,30,50,0)');
  c.fillStyle = g; c.fillRect(-1100, -100, 2200, 2200);
  c.restore();
  for (const w of GROUND.walls) { c.fillStyle = sh(w.c); c.fill(w.p); }
}
function drawGround(c) {
  c.fillStyle = sh(GC.grass[0]); c.fill(GROUND.base);
  for (const g of GROUND.groups) { c.fillStyle = sh(g.c); c.fill(g.p); }
  for (const g of GROUND.details) { c.fillStyle = sh(g.c); c.fill(g.p); }
  const t = SIM.anim;
  c.fillStyle = sh('#e2f8fa');
  for (let k = 0; k < 4; k++) { c.globalAlpha = 0.12 + 0.28 * (0.5 + 0.5 * Math.sin(t * 1.3 + k * 1.57)); c.fill(GROUND.shimmer[k]); }
  c.fillStyle = sh('#f4fbfb');
  for (let k = 0; k < 2; k++) { c.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 0.9 + k * Math.PI)); c.fill(GROUND.foam[k]); }
  c.globalAlpha = 1;
}
function drawShadows(c) {
  if (LIGHT.sa <= 0.005 || !SHADOW) return;
  c.save(); c.clip(GROUND.base);
  c.fillStyle = 'rgba(30,40,72,' + LIGHT.sa.toFixed(3) + ')';
  c.fill(SHADOW);
  c.fillStyle = 'rgba(30,40,72,' + (0.06 * LIGHT.d).toFixed(3) + ')';
  for (const cl of CLOUDS) {
    const gx = cl.x + LIGHT.sdx * cl.z * 0.5, gy = cl.y + LIGHT.sdy * cl.z * 0.5;
    c.beginPath(); c.ellipse(ix(gx, gy), iy(gx, gy, 0), 70 * cl.s, 32 * cl.s, 0, 0, TAU); c.fill();
  }
  c.restore();
}
const vis = bb => bb[2] >= VIEW.x0 && bb[0] <= VIEW.x1 && bb[3] >= VIEW.y0 && bb[1] <= VIEW.y1;
function drawObjects(c) {
  DYN.length = 0;
  for (const a of CARS) if (a.on) DYN.push(a);
  if (CAM.z > 0.7) for (const p of PEDS) if (p.on) DYN.push(p);
  for (const b of BOATS) DYN.push(b);
  for (const p of PLANES) if (p.z < 3 && p.alpha > 0) DYN.push(p);
  DYN.sort((a, b) => a.d - b.d);
  let j = 0;
  for (let i = 0; i < STATIC.length; i++) {
    const s = STATIC[i];
    while (j < DYN.length && DYN[j].d < s.d) drawDyn(c, DYN[j++]);
    if (vis(s.bb)) drawStatic(c, s);
  }
  while (j < DYN.length) drawDyn(c, DYN[j++]);
}
function drawStatic(c, s) {
  switch (s.t) {
    case 'b': drawBld(c, s.b, CAM.z); break;
    case 'tree': drawTree(c, s); break;
    case 'lamp': if (CAM.z > 0.5) drawLamp(c, s); break;
    case 'pcar': drawCarAt(c, s.x, s.y, s.h, s.col, 'car'); break;
    default: if (CAM.z > 0.55 || s.t === 'fountain') drawDecor(c, s);
  }
}
function drawDyn(c, o) {
  const X = (o.x - o.y) * HW, Y = (o.x + o.y) * HH;
  if (X < VIEW.x0 - 60 || X > VIEW.x1 + 60 || Y < VIEW.y0 - 60 || Y > VIEW.y1 + 40) return;
  if (o.kind === 'car') drawCarAt(c, o.x, o.y, o.h, o.col, o.type);
  else if (o.kind === 'ped') drawPed(c, o, X, Y);
  else if (o.kind === 'boat') drawBoat(c, o);
  else if (o.kind === 'plane') drawPlane(c, o);
}

function drawBld(c, b, det) {
  const ops = b.ops, lit = LIGHT.nf > 0.12, open = OPEN[b.id];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    switch (op.k) {
      case 0: c.fillStyle = sh(op.c); c.fill(op.p); break;
      case 1: c.fillStyle = sh(op.c); c.fill(op.p); if (lit && winLit(b, op.win)) { c.fillStyle = LIT; c.fill(op.p); } break;
      case 2: c.strokeStyle = sh(op.c); c.lineWidth = op.w; c.stroke(op.p); break;
      case 3:
        c.fillStyle = sh(op.c); c.fill(op.p);
        if (lit && (open || !b.hours || op.always)) { c.globalAlpha = Math.min(1, LIGHT.nf * 1.3); c.fillStyle = op.glow; c.fill(op.p); c.globalAlpha = 1; }
        break;
      case 4: c.fillStyle = sh(op.c); c.fill(op.p); if (lit && open) { c.fillStyle = LIT; c.fill(op.p); } break;
    }
  }
  if (b.dyn) b.dyn(c, b, det);
  if (OWNVIEW && c === CTX) {
    // ownership view: gold yours, coral on sale by players, green sold by the platform, violet owned by players
    const st = OWNC[b.id];
    c.globalAlpha = st ? 0.5 : 0.42; c.fillStyle = st ? OWN_COL[st] : '#8a939c';
    if (!b.hp) { b.hp = new Path2D(); b.hull.forEach((q, i) => (i ? b.hp.lineTo(q[0], q[1]) : b.hp.moveTo(q[0], q[1]))); b.hp.closePath(); }
    c.fill(b.hp); c.globalAlpha = 1;
  }
  const s = b.sgn;
  if (s && det * (s.fs || s.s) >= 4) {
    if (!s.fs) {
      c.font = '700 10px ' + FONT_UI;
      const w10 = c.measureText(s.txt).width || 1, maxW = (s.w || 0.5) * HW;
      s.fs = Math.min(s.s, 10 * maxW / w10);
    }
    faceText(c, s.txt, s.face, s.x, s.y, s.z, s.fs, s.col ? sh(s.col) : '#ffffff');
  }
}
function faceText(c, txt, face, wx, wy, wz, size, color) {
  const X = (wx - wy) * HW, Y = (wx + wy) * HH - wz, k = size / 10;
  c.save();
  c.translate(X, Y); c.transform(1, face === 'L' ? 0.5 : -0.5, 0, 1, 0, 0); c.scale(k, k);
  c.font = '700 10px ' + FONT_UI; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = color; c.fillText(txt, 0, 0.6);
  c.restore();
}
function drawTree(c, t) {
  const X = (t.x - t.y) * HW, Y = (t.x + t.y) * HH, s = t.s;
  if (t.type === 2) { drawPalm(c, t, X, Y); return; }
  c.fillStyle = sh('#7b5b3f');
  if (t.type === 1) {
    c.fillRect(X - 1, Y - 5 * s, 2, 5 * s);
    c.fillStyle = sh(t.c2); c.beginPath(); c.moveTo(X, Y - 26 * s); c.lineTo(X + 8 * s, Y - 4 * s); c.lineTo(X - 8 * s, Y - 4 * s); c.closePath(); c.fill();
    c.fillStyle = sh(t.c); c.beginPath(); c.moveTo(X, Y - 26 * s); c.lineTo(X + 1.5 * s, Y - 4 * s); c.lineTo(X - 8 * s, Y - 4 * s); c.closePath(); c.fill();
    return;
  }
  c.fillRect(X - 1.1, Y - 7 * s, 2.2, 7 * s);
  const r = 7.5 * s, cy = Y - 7 * s - r * 0.72;
  c.fillStyle = sh(t.c2); c.beginPath(); c.arc(X, cy, r, 0, TAU); c.fill();
  if (CAM.z < 0.45) return;
  c.fillStyle = sh(t.c); c.beginPath(); c.arc(X - r * 0.18, cy - r * 0.16, r * 0.8, 0, TAU); c.fill();
  c.fillStyle = sh(t.c1); c.beginPath(); c.arc(X - r * 0.36, cy - r * 0.4, r * 0.36, 0, TAU); c.fill();
}
function drawPalm(c, t, X, Y) {
  const s = t.s, sway = Math.sin(SIM.anim * 1.1 + t.ph) * 0.8, tx = X + 4 * s + sway, ty = Y - 24 * s;
  c.lineCap = 'round';
  c.strokeStyle = sh('#8a6a4a'); c.lineWidth = 2.2 * s;
  c.beginPath(); c.moveTo(X, Y); c.quadraticCurveTo(X - 3 * s, Y - 12 * s, tx, ty); c.stroke();
  c.strokeStyle = sh('#4f9a45'); c.lineWidth = 2 * s;
  c.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * TAU + 0.3;
    c.moveTo(tx, ty); c.quadraticCurveTo(tx + Math.cos(a) * 6 * s, ty - 3 * s + Math.sin(a) * 2 * s, tx + Math.cos(a) * 10 * s, ty + Math.sin(a) * 4 * s + 5 * s);
  }
  c.stroke();
  c.lineCap = 'butt';
}
function drawLamp(c, l) {
  const X = (l.x - l.y) * HW, Y = (l.x + l.y) * HH;
  c.fillStyle = sh('#4f5560'); c.fillRect(X - 0.6, Y - 13, 1.2, 13); c.fillRect(X - 0.6, Y - 13.4, 3.6, 1.1);
  c.fillStyle = LIGHT.nf > 0.3 ? '#fff2c4' : sh('#d9dde3'); c.fillRect(X + 1.8, Y - 12.6, 2, 1.3);
}
function drawDecor(c, s) {
  const X = (s.x - s.y) * HW, Y = (s.x + s.y) * HH;
  switch (s.t) {
    case 'bench':
      c.fillStyle = sh('#8a6446'); c.fillRect(X - 3, Y - 2.6, 6, 1.4);
      c.fillStyle = sh('#5e4532'); c.fillRect(X - 2.6, Y - 1.2, 0.8, 1.2); c.fillRect(X + 1.8, Y - 1.2, 0.8, 1.2);
      break;
    case 'swing': {
      const a = Math.sin(SIM.anim * 2 + s.ph) * 2.5;
      c.strokeStyle = sh('#d9534f'); c.lineWidth = 0.9;
      c.beginPath(); c.moveTo(X - 5, Y); c.lineTo(X - 3.5, Y - 10); c.lineTo(X + 3.5, Y - 10); c.lineTo(X + 5, Y); c.stroke();
      c.strokeStyle = sh('#6b6b6b'); c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(X - 1.2, Y - 10); c.lineTo(X - 1.2 + a, Y - 3); c.moveTo(X + 1.2, Y - 10); c.lineTo(X + 1.2 + a, Y - 3); c.stroke();
      c.fillStyle = sh('#3b6ea8'); c.fillRect(X - 1.8 + a, Y - 3.2, 3.6, 1);
      break;
    }
    case 'slide':
      c.fillStyle = sh('#f2c230'); c.beginPath(); c.moveTo(X - 4, Y - 9); c.lineTo(X - 2.5, Y - 9); c.lineTo(X + 5, Y - 0.5); c.lineTo(X + 3.5, Y); c.closePath(); c.fill();
      c.strokeStyle = sh('#4a90c2'); c.lineWidth = 0.8; c.beginPath(); c.moveTo(X - 4, Y); c.lineTo(X - 4, Y - 9); c.moveTo(X - 2.4, Y); c.lineTo(X - 2.4, Y - 9); c.stroke();
      break;
    case 'umb':
      c.strokeStyle = sh('#6b6b6b'); c.lineWidth = 0.6; c.beginPath(); c.moveTo(X, Y); c.lineTo(X, Y - 9); c.stroke();
      c.fillStyle = sh(s.c); c.beginPath(); c.ellipse(X, Y - 9, 5.6, 2.7, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(X - 1, Y - 9.6, 2.4, 1.1, 0, 0, TAU); c.fill();
      break;
    case 'sunbed':
      c.fillStyle = sh('#f4f1ea'); c.beginPath();
      c.moveTo(ix(s.x - 0.09, s.y - 0.03), iy(s.x - 0.09, s.y - 0.03, 1.6)); c.lineTo(ix(s.x + 0.09, s.y - 0.03), iy(s.x + 0.09, s.y - 0.03, 1.6));
      c.lineTo(ix(s.x + 0.09, s.y + 0.03), iy(s.x + 0.09, s.y + 0.03, 1.6)); c.lineTo(ix(s.x - 0.09, s.y + 0.03), iy(s.x - 0.09, s.y + 0.03, 1.6)); c.closePath(); c.fill();
      break;
    case 'fountain': {
      c.fillStyle = sh('#b9af9a'); c.beginPath(); c.ellipse(X, Y + 1.6, 17, 8.5, 0, 0, TAU); c.fill();
      c.fillStyle = sh('#d6cdb9'); c.beginPath(); c.ellipse(X, Y, 17, 8.5, 0, 0, TAU); c.fill();
      c.fillStyle = sh('#5cc4d6'); c.beginPath(); c.ellipse(X, Y - 0.4, 14.5, 7.2, 0, 0, TAU); c.fill();
      c.fillStyle = sh('#d9d0bd'); c.fillRect(X - 1.5, Y - 9, 3, 9);
      const t = SIM.anim;
      c.fillStyle = LIGHT.nf > 0.4 ? 'rgba(200,235,255,0.95)' : 'rgba(240,252,255,0.9)';
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * TAU;
        for (let j = 1; j <= 4; j++) {
          const f = (t * 0.9 + j / 4 + k * 0.13) % 1, r = f * 12;
          c.fillRect(X + Math.cos(a) * r - 0.6, Y - 9 - Math.sin(f * Math.PI) * 9 + Math.sin(a) * r * 0.5 + f * 9 - 0.6, 1.2, 1.2);
        }
      }
      break;
    }
  }
}

/* vehicles */
function prism(c, x, y, ca, sa, hl, hw, z0, z1, cL, cR, cT, noTop) {
  const fx = ca * hl, fy = sa * hl, rx = -sa * hw, ry = ca * hw;
  PX[0] = x + fx + rx; PY[0] = y + fy + ry; PX[1] = x + fx - rx; PY[1] = y + fy - ry;
  PX[2] = x - fx - rx; PY[2] = y - fy - ry; PX[3] = x - fx + rx; PY[3] = y - fy + ry;
  const NX = [ca, sa, -ca, -sa], NY = [sa, -ca, -sa, ca];
  for (let e = 0; e < 4; e++) {
    if (NX[e] + NY[e] <= 0) continue;
    const a = e, b = (e + 1) & 3;
    c.fillStyle = sh(NY[e] > NX[e] ? cL : cR);
    c.beginPath();
    c.moveTo((PX[a] - PY[a]) * HW, (PX[a] + PY[a]) * HH - z0); c.lineTo((PX[b] - PY[b]) * HW, (PX[b] + PY[b]) * HH - z0);
    c.lineTo((PX[b] - PY[b]) * HW, (PX[b] + PY[b]) * HH - z1); c.lineTo((PX[a] - PY[a]) * HW, (PX[a] + PY[a]) * HH - z1);
    c.closePath(); c.fill();
  }
  if (noTop) return;
  c.fillStyle = sh(cT); c.beginPath();
  for (let k = 0; k < 4; k++) { const X = (PX[k] - PY[k]) * HW, Y = (PX[k] + PY[k]) * HH - z1; k ? c.lineTo(X, Y) : c.moveTo(X, Y); }
  c.closePath(); c.fill();
}
function drawCarAt(c, x, y, h, col, type) {
  const bus = type === 'bus', ca = Math.cos(h), sa = Math.sin(h);
  if (CAM.z < 0.45) { prism(c, x, y, ca, sa, bus ? 0.27 : 0.15, bus ? 0.085 : 0.075, 0, bus ? 7 : 4, col.l, col.r, col.t); return; }
  if (bus) {
    prism(c, x, y, ca, sa, 0.27, 0.085, 0.6, 7.6, col.l, col.r, col.t);
    prism(c, x, y, ca, sa, 0.272, 0.087, 4.2, 6.4, '#33475a', '#2a3a4b', '', true);
  } else {
    prism(c, x, y, ca, sa, 0.145, 0.072, 0.6, 3.6, col.l, col.r, col.t);
    prism(c, x - ca * 0.02, y - sa * 0.02, ca, sa, 0.08, 0.062, 3.6, 6, '#3a4d60', '#2e3e4f', col.t);
    if (type === 'taxi') prism(c, x - ca * 0.02, y - sa * 0.02, ca, sa, 0.025, 0.03, 6, 7.4, '#2b2f36', '#2b2f36', '#f2c230');
    else if (type === 'police') prism(c, x - ca * 0.02, y - sa * 0.02, ca, sa, 0.02, 0.05, 6, 7, '#2f5fa7', '#d03b3b', ((SIM.anim * 3) | 0) % 2 ? '#d03b3b' : '#2f5fa7');
  }
}
function drawPed(c, p, X, Y) {
  const bob = Math.abs(Math.sin(SIM.anim * 7 + p.ph)) * 0.6;
  c.fillStyle = sh('#3a3f4a'); c.fillRect(X - 0.8, Y - 2.6, 0.7, 2.6); c.fillRect(X + 0.1, Y - 2.6, 0.7, 2.6);
  c.fillStyle = sh(p.c); c.fillRect(X - 1, Y - 5.6 - bob, 2, 3.2);
  c.fillStyle = sh(p.sk); c.fillRect(X - 0.8, Y - 7.4 - bob, 1.6, 1.7);
}
function drawBoat(c, b) {
  const bob = Math.sin(SIM.anim * 1.6 + b.ph) * 0.6, ca = Math.cos(b.h), sa = Math.sin(b.h);
  if (!b.dock) {
    const sx = b.x - ca * b.len, sy = b.y - sa * b.len;
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(ix(sx, sy), iy(sx, sy, 0)); c.lineTo(ix(sx - ca * 0.45, sy - sa * 0.45), iy(sx - ca * 0.45, sy - sa * 0.45, 0)); c.stroke();
  }
  prism(c, b.x, b.y, ca, sa, b.len, b.len * 0.34, -0.5 + bob, 1.8 + bob, b.cl, b.cr, b.ct);
  const X = ix(b.x, b.y), Y = iy(b.x, b.y, 1.8 + bob);
  if (b.sail) {
    const sx = Math.sign(-ca + sa) || 1;
    c.strokeStyle = sh('#6b6b6b'); c.lineWidth = 0.6; c.beginPath(); c.moveTo(X, Y); c.lineTo(X, Y - 17); c.stroke();
    c.fillStyle = sh('#fbfbf8'); c.beginPath(); c.moveTo(X, Y - 17); c.lineTo(X + sx * 8, Y - 1.5); c.lineTo(X, Y - 1.5); c.closePath(); c.fill();
    c.fillStyle = sh('#e3e8ec'); c.beginPath(); c.moveTo(X, Y - 14); c.lineTo(X - sx * 4.5, Y - 1.5); c.lineTo(X, Y - 1.5); c.closePath(); c.fill();
  } else prism(c, b.x - ca * 0.03, b.y - sa * 0.03, ca, sa, b.len * 0.45, b.len * 0.26, 1.8 + bob, 4.6 + bob, '#e9eef1', '#c9d2d8', '#ffffff');
}
const PL_FUS = [[0.56, 0], [0.5, 0.035], [0.36, 0.055], [-0.42, 0.05], [-0.55, 0.018], [-0.55, -0.018], [-0.42, -0.05], [0.36, -0.055], [0.5, -0.035]];
const PL_WING = [[0.14, 0.05], [-0.1, 0.5], [-0.2, 0.5], [-0.08, 0.05], [-0.08, -0.05], [-0.2, -0.5], [-0.1, -0.5], [0.14, -0.05]];
const PL_TAIL = [[-0.38, 0.04], [-0.5, 0.19], [-0.56, 0.19], [-0.52, 0.04], [-0.52, -0.04], [-0.56, -0.19], [-0.5, -0.19], [-0.38, -0.04]];
function planePath(c, pts, p, z) {
  const ca = Math.cos(p.h), sa = Math.sin(p.h);
  c.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const wx = p.x + pts[i][0] * ca - pts[i][1] * sa, wy = p.y + pts[i][0] * sa + pts[i][1] * ca;
    const X = (wx - wy) * HW, Y = (wx + wy) * HH - z;
    i ? c.lineTo(X, Y) : c.moveTo(X, Y);
  }
  c.closePath();
}
function planePt(p, lx, ly, z) {
  const ca = Math.cos(p.h), sa = Math.sin(p.h), wx = p.x + lx * ca - ly * sa, wy = p.y + lx * sa + ly * ca;
  return [(wx - wy) * HW, (wx + wy) * HH - z];
}
function drawPlane(c, p) {
  c.globalAlpha = p.alpha;
  const z = p.z + 4;
  const sa = 0.2 * Math.max(0.35, LIGHT.d) * (1 - Math.min(0.85, p.z / 300));
  c.fillStyle = 'rgba(20,30,50,' + sa.toFixed(3) + ')';
  planePath(c, PL_WING, p, 0); c.fill(); planePath(c, PL_FUS, p, 0); c.fill();
  c.fillStyle = sh('#d3dbe3'); planePath(c, PL_WING, p, z); c.fill();
  c.fillStyle = sh('#9aa6b2');
  for (const ly of [-0.22, 0.22]) { const q = planePt(p, 0.02, ly, z - 1.2); c.beginPath(); c.ellipse(q[0], q[1], 2.2, 1.4, 0, 0, TAU); c.fill(); }
  c.fillStyle = sh('#aab5c1'); planePath(c, PL_FUS, p, z - 1.8); c.fill();
  c.fillStyle = sh('#f7f9fb'); planePath(c, PL_FUS, p, z); c.fill();
  const s0 = planePt(p, 0.4, 0, z), s1 = planePt(p, -0.4, 0, z);
  c.strokeStyle = sh(p.tail); c.lineWidth = 0.9; c.beginPath(); c.moveTo(s0[0], s0[1]); c.lineTo(s1[0], s1[1]); c.stroke();
  c.fillStyle = sh('#e1e7ed'); planePath(c, PL_TAIL, p, z + 0.4); c.fill();
  const a = planePt(p, -0.34, 0, z), b = planePt(p, -0.55, 0, z), cc = planePt(p, -0.58, 0, z + 10), d = planePt(p, -0.47, 0, z + 10);
  c.fillStyle = sh(p.tail); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(cc[0], cc[1]); c.lineTo(d[0], d[1]); c.closePath(); c.fill();
  c.globalAlpha = 1;
}

/* dynamic parts of buildings */
function dynFerris(c, b) {
  const { cx, cy, R, hz } = b.wh, rot = SIM.anim * 0.12;
  const P = (a, rr) => { const x = cx + rr * Math.cos(a), z = hz + rr * ZT * Math.sin(a); return [(x - cy) * HW, (x + cy) * HH - z]; };
  c.strokeStyle = sh('#e3e9ee'); c.lineWidth = 1.6; c.beginPath();
  for (let i = 0; i <= 40; i++) { const q = P(i / 40 * TAU, R); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }
  c.stroke();
  const hub = P(0, 0);
  c.lineWidth = 0.6; c.beginPath();
  for (let i = 0; i < 8; i++) { const q = P(rot + i / 8 * TAU, R); c.moveTo(hub[0], hub[1]); c.lineTo(q[0], q[1]); }
  c.stroke();
  const night = LIGHT.nf > 0.3;
  for (let i = 0; i < 8; i++) {
    const q = P(rot + i / 8 * TAU, R);
    c.fillStyle = sh(FERRIS_COLS[i]); c.fillRect(q[0] - 2.3, q[1] - 0.4, 4.6, 4.2);
    if (night) { c.fillStyle = '#fff3c4'; c.fillRect(q[0] - 1.2, q[1] + 0.6, 2.4, 1.6); }
  }
  if (night) {
    c.fillStyle = ((SIM.anim * 2) | 0) % 2 ? '#ffd166' : '#ff8fab';
    for (let i = 0; i < 24; i++) { const q = P(i / 24 * TAU, R); c.fillRect(q[0] - 0.7, q[1] - 0.7, 1.4, 1.4); }
  }
  c.strokeStyle = sh('#7b8794'); c.lineWidth = 1.4; c.beginPath();
  c.moveTo((cx - 0.32 - cy - 0.12) * HW, (cx - 0.32 + cy + 0.12) * HH - 3);
  c.lineTo((cx - cy - 0.04) * HW, (cx + cy + 0.04) * HH - hz);
  c.lineTo((cx + 0.32 - cy - 0.12) * HW, (cx + 0.32 + cy + 0.12) * HH - 3);
  c.stroke();
  c.fillStyle = sh('#5f6b78'); c.beginPath(); c.arc(hub[0], hub[1], 2, 0, TAU); c.fill();
}
function dynRadar(c, b) {
  const cx = b.rc[0], cy = b.rc[1], a = SIM.anim * 1.5, ex = Math.cos(a) * 0.3, ey = Math.sin(a) * 0.3;
  const X1 = ix(cx - ex, cy - ey), Y1 = iy(cx - ex, cy - ey, 27), X2 = ix(cx + ex, cy + ey), Y2 = iy(cx + ex, cy + ey, 27);
  c.lineCap = 'round';
  c.strokeStyle = sh('#9aa3ab'); c.lineWidth = 3.4; c.beginPath(); c.moveTo(X1, Y1 + 0.8); c.lineTo(X2, Y2 + 0.8); c.stroke();
  c.strokeStyle = sh('#f4f6f8'); c.lineWidth = 2.6; c.beginPath(); c.moveTo(X1, Y1); c.lineTo(X2, Y2); c.stroke();
  c.lineCap = 'butt';
}
function dynTurbine(c, b) {
  const X = b.hub[0], Y = b.hub[1], a0 = TURB_ANGLE + b.ph;
  c.strokeStyle = sh('#f7f9fa'); c.lineWidth = 2.2; c.lineCap = 'round'; c.beginPath();
  for (let k = 0; k < 3; k++) { const a = a0 + k * TAU / 3; c.moveTo(X, Y); c.lineTo(X + Math.cos(a) * 20, Y - Math.sin(a) * 34); }
  c.stroke(); c.lineCap = 'butt';
  c.fillStyle = sh('#dfe5e9'); c.beginPath(); c.arc(X, Y, 2.3, 0, TAU); c.fill();
}
function dynClock(c, b) {
  const { tx, ty, s, cz } = b.clock, t = tod();
  const am = (t % 60) / 60 * TAU, ah = ((t / 60) % 12) / 12 * TAU;
  c.strokeStyle = sh('#2b2f36'); c.lineCap = 'round';
  for (const face of ['R', 'L']) for (const [a, len, w] of [[ah, 0.065, 1.1], [am, 0.1, 0.7]]) {
    const u = Math.sin(a) * len, v = Math.cos(a) * len * ZT;
    let x0, y0, x1, y1;
    if (face === 'R') { x0 = x1 = tx + s + 0.006; y0 = ty; y1 = ty - u; } else { y0 = y1 = ty + s + 0.006; x0 = tx; x1 = tx + u; }
    c.lineWidth = w; c.beginPath(); c.moveTo(ix(x0, y0), iy(x0, y0, cz)); c.lineTo(ix(x1, y1), iy(x1, y1, cz + v)); c.stroke();
  }
  c.lineCap = 'butt';
}
function dynStadium(c, b, det) {
  const m = matchInfo();
  if (det >= 0.9) {
    const txt = m.state === 'live' || m.state === 'over' ? `ВОЛНА ${m.h}:${m.a} ${m.rival.replace(/[«»]/g, '').toUpperCase()}` : 'ФК ВОЛНА';
    faceText(c, txt, 'L', b.score.x, b.score.y + 0.002, b.score.z, Math.min(2.6, 26 / txt.length), '#ffd166');
  }
  if (m.state !== 'live') return;
  const [fx0, fy0, fx1, fy1] = b.field, t = SIM.anim;
  for (let i = 0; i < 22; i++) {
    const home = i < 11;
    const bx = lerp(fx0, fx1, 0.5 + (home ? -0.2 : 0.2) + 0.25 * Math.sin(t * 0.3 + i * 1.7)), by = lerp(fy0, fy1, 0.5 + 0.4 * Math.sin(t * 0.23 + i * 2.3));
    const X = ix(bx, by), Y = iy(bx, by, 0);
    c.fillStyle = home ? '#14a3b8' : '#ff6b4a'; c.fillRect(X - 0.9, Y - 3, 1.8, 3);
  }
  const bx = lerp(fx0, fx1, 0.5 + 0.4 * Math.sin(t * 0.5)), by = lerp(fy0, fy1, 0.5 + 0.35 * Math.cos(t * 0.37));
  c.fillStyle = '#ffffff'; c.fillRect(ix(bx, by) - 0.7, iy(bx, by, 0.8) - 0.7, 1.4, 1.4);
}

/* light pass */
function glow(c, k, X, Y, r, a) { if (a <= 0.01) return; c.globalAlpha = Math.min(1, a); c.drawImage(SPR[k], X - r, Y - r, r * 2, r * 2); }
function glowE(c, k, X, Y, rx, ry, a) { if (a <= 0.01) return; c.globalAlpha = Math.min(1, a); c.drawImage(SPR[k], X - rx, Y - ry, rx * 2, ry * 2); }
const inV = (X, Y, m) => X > VIEW.x0 - m && X < VIEW.x1 + m && Y > VIEW.y0 - m && Y < VIEW.y1 + m;
function drawGlow(c) {
  const night = clamp((LIGHT.nf - 0.2) / 0.6, 0, 1), t = SIM.anim;
  c.globalCompositeOperation = 'lighter';
  if (night > 0) {
    for (const l of LAMPS) {
      const X = (l.x - l.y) * HW, Y = (l.x + l.y) * HH;
      if (!inV(X, Y, 30)) continue;
      glowE(c, 'warm', X + 2.8, Y + 1, 16, 8, night * 0.32); glow(c, 'warm', X + 2.8, Y - 12, 7, night * 0.8);
    }
    for (const a of CARS) {
      if (!a.on) continue;
      const ca = Math.cos(a.h), sa = Math.sin(a.h), L = a.type === 'bus' ? 0.27 : 0.15;
      const fx = a.x + ca * (L + 0.02), fy = a.y + sa * (L + 0.02), X = (fx - fy) * HW, Y = (fx + fy) * HH - 2;
      if (!inV(X, Y, 30)) continue;
      glow(c, 'warm', X, Y, 5, night * 0.9);
      const bx = a.x - ca * L, by = a.y - sa * L; glow(c, 'red', (bx - by) * HW, (bx + by) * HH - 2.4, 2.6, night * 0.7);
      const hx = a.x + ca * (L + 0.24), hy = a.y + sa * (L + 0.24); glowE(c, 'warm', (hx - hy) * HW, (hx + hy) * HH, 9, 4.5, night * 0.25);
    }
    for (let y = 0.4; y < 11; y += 0.75) for (const xx of [26.07, 26.93]) glow(c, 'white', (xx - y) * HW, (xx + y) * HH - 0.5, 2.8, night * 0.8);
    for (let k = 0; k < 6; k++) { const xx = 26.12 + k * 0.15; glow(c, 'green', (xx - 10.97) * HW, (xx + 10.97) * HH, 3, night); glow(c, 'red', (xx - 0.03) * HW, (xx + 0.03) * HH, 3, night); }
    for (let y = 1.3; y < 10.5; y += 1.1) glow(c, 'blue', (25.12 - y) * HW, (25.12 + y) * HH, 2.4, night * 0.7);
    if (STADIUM_ID >= 0) {
      const m = matchInfo();
      if (m.state === 'live' || (m.state === 'soon' && tod() > 1080)) for (const [x, y, z] of FLOODS) glow(c, 'white', (x - y) * HW, (x + y) * HH - z, 16, night * 0.9);
    }
    const fX = ix(15.5, 9.0), fY = iy(15.5, 9.0, 0);
    if (inV(fX, fY, 40)) glowE(c, 'blue', fX, fY, 22, 11, night * 0.35);
    if (LIGHTHOUSE_ID >= 0) {
      const lh = BLD[LIGHTHOUSE_ID].lamp, X = lh[0], Y = lh[1], a = t * 0.9;
      c.globalAlpha = 1;
      for (const s of [0, Math.PI]) {
        const dx = Math.cos(a + s), dy = Math.sin(a + s), wx = lh[2], wy = lh[3], Lb = 7, sp = 0.9;
        const ex1 = wx + dx * Lb - dy * sp, ey1 = wy + dy * Lb + dx * sp, ex2 = wx + dx * Lb + dy * sp, ey2 = wy + dy * Lb - dx * sp;
        const P1x = (ex1 - ey1) * HW, P1y = (ex1 + ey1) * HH - 76, P2x = (ex2 - ey2) * HW, P2y = (ex2 + ey2) * HH - 76;
        const g = c.createLinearGradient(X, Y, (P1x + P2x) / 2, (P1y + P2y) / 2);
        g.addColorStop(0, 'rgba(255,244,200,' + (0.5 * night).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,244,200,0)');
        c.fillStyle = g; c.beginPath(); c.moveTo(X, Y); c.lineTo(P1x, P1y); c.lineTo(P2x, P2y); c.closePath(); c.fill();
      }
      glow(c, 'beam', X, Y, 14, night);
    }
  }
  for (const bc of BEACONS) {
    if (((t + bc.ph) % bc.per) >= bc.per * bc.duty) continue;
    const X = (bc.x - bc.y) * HW, Y = (bc.x + bc.y) * HH - bc.z;
    if (inV(X, Y, 20)) glow(c, bc.col, X, Y, 6, 0.3 + night * 0.7);
  }
  for (const p of PLANES) {
    if (p.alpha < 0.3) continue;
    const z = p.z + 4, Lw = planePt(p, -0.15, -0.5, z), Rw = planePt(p, -0.15, 0.5, z);
    glow(c, 'red', Lw[0], Lw[1], 3.5, 0.9); glow(c, 'green', Rw[0], Rw[1], 3.5, 0.9);
    if ((t * 1.3) % 1 < 0.12) { glow(c, 'white', Lw[0], Lw[1], 6, 1); glow(c, 'white', Rw[0], Rw[1], 6, 1); }
    if (p.st === 'approach' || p.st === 'rollout' || p.st === 'roll') { const N = planePt(p, 0.62, 0, z); glow(c, 'white', N[0], N[1], 8 + night * 6, 0.5 + night * 0.4); }
  }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
}
function drawClouds(c) {
  const fade = clamp((1.35 - CAM.z) / 0.5, 0, 1);
  if (fade <= 0) return;
  const col = LIGHT.d > 0.5 ? '255,255,255' : '170,182,214';
  c.fillStyle = `rgba(${col},${(0.5 * fade).toFixed(3)})`;
  for (const cl of CLOUDS) {
    const X = (cl.x - cl.y) * HW, Y = (cl.x + cl.y) * HH - cl.z;
    c.beginPath();
    for (const [bx, by, br] of cl.blobs) { const r = 26 * br * cl.s, px = X + bx * 40 * cl.s, py = Y + by * 20 * cl.s; c.moveTo(px + r, py); c.arc(px, py, r, 0, TAU); }
    c.fill();
  }
}
function selObj() {
  if (!SEL) return null;
  if (SEL.t === 'plane') return PLANES.find(p => p.id === SEL.id) || null;
  if (SEL.t === 'car') return CARS[SEL.id] || null;
  if (SEL.t === 'boat') return BOATS[SEL.id] || null;
  return null;
}
function drawSelection(c) {
  if (!SEL) return;
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 260);
  c.save(); c.lineJoin = 'round';
  c.strokeStyle = 'rgba(255,107,74,' + pulse.toFixed(2) + ')'; c.lineWidth = 2.6 / CAM.z;
  if (SEL.t === 'b') {
    const b = BLD[SEL.id];
    c.beginPath(); b.hull.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); c.stroke();
  } else if (SEL.t === 'tile') {
    const x = SEL.x, y = SEL.y;
    c.beginPath(); c.moveTo(ix(x, y), iy(x, y, 0)); c.lineTo(ix(x + 1, y), iy(x + 1, y, 0)); c.lineTo(ix(x + 1, y + 1), iy(x + 1, y + 1, 0)); c.lineTo(ix(x, y + 1), iy(x, y + 1, 0)); c.closePath(); c.stroke();
  } else {
    const o = selObj();
    if (o) {
      const pl = o.kind === 'plane', X = ix(o.x, o.y), Y = iy(o.x, o.y, pl ? o.z + 4 : 2);
      c.beginPath(); c.ellipse(X, Y, pl ? 30 : 10, pl ? 15 : 5, 0, 0, TAU); c.stroke();
    }
  }
  c.restore();
}
function rrect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r); c.lineTo(x + w, y + h - r); c.arcTo(x + w, y + h, x + w - r, y + h, r);
  c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r); c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r); c.closePath();
}
function labelOf(b) {
  if (!b.lab) b.lab = LABELS.find(L => L.b === b) || { b, txt: (b.kind === 'apt' || b.kind === 'aptB') ? b.addr : b.short || b.name, w: 0 };
  return b.lab;
}
function drawLabels(c) {
  const z = CAM.z, all = SHOW_LABELS && z >= 1.0, selB = SEL && SEL.t === 'b' ? BLD[SEL.id] : null;
  if (!all && !selB) return;
  c.font = '600 11px ' + FONT_UI; c.textBaseline = 'middle'; c.textAlign = 'left';
  const placed = [];
  const one = (L, hi) => {
    const b = L.b, X = (ix(b.cx, b.cy) - CAM.x) * z + VW / 2, Y = (iy(b.cx, b.cy, b.topZ) - CAM.y) * z + VH / 2 - 12;
    if (X < -80 || X > VW + 80 || Y < 10 || Y > VH + 10) return;
    if (!L.w) L.w = c.measureText(L.txt).width;
    const w = L.w + 24, h = 20, r = [X - w / 2, Y - h / 2, X + w / 2, Y + h / 2];
    if (!hi) for (const q of placed) if (r[0] < q[2] + 4 && r[2] > q[0] - 4 && r[1] < q[3] + 3 && r[3] > q[1] - 3) return;
    placed.push(r);
    rrect(c, r[0], r[1], w, h, 10);
    c.fillStyle = hi ? '#ff6b4a' : 'rgba(255,255,255,0.93)'; c.fill();
    c.fillStyle = hi ? '#ffffff' : (CAT_DOT[b.cat] || '#1769aa'); c.beginPath(); c.arc(r[0] + 10, Y, 3, 0, TAU); c.fill();
    c.fillStyle = hi ? '#ffffff' : '#13232c'; c.fillText(L.txt, r[0] + 17, Y + 0.5);
  };
  if (selB) one(labelOf(selB), true);
  if (all) for (const L of LABELS) if (L.b !== selB) one(L, false);
}

function groundColorAt(x, y) {
  const t = ground[idx(x, y)];
  return { [TT.PLAZA]: GC.plaza, [TT.SAND]: GC.sand, [TT.FIELD]: GC.field, [TT.PARK]: GC.park, [TT.APRON]: GC.apron }[t] || GC.grass[0];
}
function drawPortrait(cv, b) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = 96, h = 96;
  cv.width = w * dpr; cv.height = h * dpr;
  const c = cv.getContext('2d');
  const gx0 = ix(b.x, b.y + b.s), gx1 = ix(b.x + b.s, b.y), gy0 = iy(b.x, b.y, 0), gy1 = iy(b.x + b.s, b.y + b.s, 0);
  const x0 = Math.min(b.bb[0], gx0), x1 = Math.max(b.bb[2], gx1), y0 = Math.min(b.bb[1], gy0), y1 = Math.max(b.bb[3], gy1);
  const sc = Math.min((w - 12) / (x1 - x0), (h - 12) / (y1 - y0));
  c.setTransform(sc * dpr, 0, 0, sc * dpr, (w / 2 - (x0 + x1) / 2 * sc) * dpr, (h / 2 - (y0 + y1) / 2 * sc) * dpr);
  const p = new Path2D(); wrect(p, b.x, b.y, b.x + b.s, b.y + b.s, 0);
  c.fillStyle = sh(groundColorAt(b.x, b.y)); c.fill(p);
  drawBld(c, b, sc);
}

/* markers of the game: a gold pin over everything you own, and short bubbles over deals and gifts */
function scrPt(b, up) { return [(ix(b.cx, b.cy) - CAM.x) * CAM.z + VW / 2, (iy(b.cx, b.cy, b.topZ) - CAM.y) * CAM.z + VH / 2 - up]; }
function drawPins(c) {
  if (CAM.z < 0.3) return;
  c.font = '700 10px ' + FONT_UI; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const b of BLD) {
    if (OWNC[b.id] !== 'mine') continue;
    const [X, Y] = scrPt(b, 36);
    if (X < -20 || X > VW + 20 || Y < -20 || Y > VH + 20) continue;
    c.fillStyle = '#f2b705';
    c.beginPath(); c.moveTo(X - 4.5, Y + 5); c.lineTo(X, Y + 12); c.lineTo(X + 4.5, Y + 5); c.closePath(); c.fill();
    c.beginPath(); c.arc(X, Y, 9, 0, TAU); c.fill();
    c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#13232c'; c.fillText('★', X, Y + 0.5);
  }
  c.textAlign = 'left';
}
function drawFx(c) {
  if (!FX.length) return;
  const now = performance.now();
  c.font = '600 12px ' + FONT_UI; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let i = FX.length - 1; i >= 0; i--) {
    const f = FX[i], age = (now - f.t) / 1000;
    if (age > 6) { FX.splice(i, 1); continue; }
    const [X, Y0] = scrPt(BLD[f.b], 58), Y = Y0 - age * 7;
    if (X < -160 || X > VW + 160 || Y < -30 || Y > VH + 30) continue;
    const txt = f.ic + ' ' + f.txt, w = Math.min(VW - 16, c.measureText(txt).width + 22);
    c.globalAlpha = Math.max(0, Math.min(1, age * 3, (6 - age) / 1.2));
    rrect(c, X - w / 2, Y - 12, w, 24, 12); c.fillStyle = 'rgba(19,35,44,0.9)'; c.fill();
    c.fillStyle = '#ffffff'; c.fillText(txt, X, Y + 0.5, w - 14);
  }
  c.globalAlpha = 1; c.textAlign = 'left';
}
