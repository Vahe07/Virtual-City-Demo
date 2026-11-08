/* sim.js — time, light, traffic, boats, airport */
const SIM = { min: 720, sp: 1, anim: 0, wd0: 0 };
const SPEEDS = [0, 1, 10, 60];          // sim minutes per real second
const AGENT_RATE = [0, 1, 1.4, 2];
const LIGHT = { d: 1, nf: 0, warm: 0, sdx: 0, sdy: 0.012, sa: 0 };
let OPEN = new Uint8Array(0);
let TURB_ANGLE = 0, shadowKey = -1, openKey = -1;
const LITP = { home: 0.3, hotel: 0.3 };
const CARS = [], PEDS = [], BOATS = [], PLANES = [], CLOUDS = [];
const SHIRTS = ['#e86f51', '#3e8fb6', '#f2c230', '#6aa98a', '#9a7fc0', '#f4f4f4', '#2b2f36', '#e57399', '#14a3b8'];
const SKINS = ['#f1c9a5', '#e0ac81', '#c68e63', '#8d5b3e', '#f6d7bf'];

const tod = () => ((SIM.min % 1440) + 1440) % 1440;
const dayN = () => Math.floor(SIM.min / 1440);
const wday = () => (((SIM.wd0 + dayN()) % 7) + 7) % 7;

function isOpen(b, t, wd) {
  if (!b.hours) return true;
  if (b.closed && b.closed.includes(wd)) return false;
  const o = b.hours[0], c = b.hours[1];
  return c > o ? t >= o && t < c : t >= o || t < c;
}

function computeLight() {
  const h = tod() / 60;
  let d;
  if (h < 5) d = 0; else if (h < 7) d = smooth((h - 5) / 2); else if (h < 18.5) d = 1; else if (h < 21) d = 1 - smooth((h - 18.5) / 2.5); else d = 0;
  const warm = clamp(Math.max(0, 1 - Math.abs(h - 6.4) / 1.3) + Math.max(0, 1 - Math.abs(h - 19.5) / 1.5), 0, 1);
  let r = lerp(0.3, 1, d), g = lerp(0.36, 1, d), bl = lerp(0.58, 1, d);
  const w = warm * 0.6;
  r *= lerp(1, 1.1, w); g *= lerp(1, 0.86, w); bl *= lerp(1, 0.74, w);
  setAmbient(r, g, bl);
  LIGHT.d = d; LIGHT.nf = 1 - d; LIGHT.warm = warm;
  // sun crosses the northern sky: shadows fall towards the viewer at noon
  const phi = Math.PI * (h - 6) / 14;
  if (phi > 0.04 && phi < Math.PI - 0.04) {
    const e = Math.sin(phi) * 62 * Math.PI / 180;
    const k = Math.min(0.06, 1 / (40 * Math.tan(Math.max(0.05, e))));
    LIGHT.sdx = -Math.cos(phi) * k; LIGHT.sdy = Math.sin(phi) * k;
    LIGHT.sa = 0.2 * smooth(Math.sin(phi) * 3) * d;
  } else LIGHT.sa = 0;
}

function updateHourly() {
  const t = tod(), h = t / 60, wd = wday();
  LITP.home = h >= 17 && h < 23 ? 0.5 : (h >= 23 || h < 1) ? 0.26 : h < 5 ? 0.06 : h < 7 ? 0.25 : 0.12;
  LITP.hotel = h >= 18 ? 0.62 : h < 7 ? 0.16 : 0.3;
  for (const b of BLD) OPEN[b.id] = isOpen(b, t, wd) ? 1 : 0;
}
function winLit(b, g) {
  let p;
  switch (b.lc) {
    case 'home': p = LITP.home; break;
    case 'hotel': p = LITP.hotel; break;
    case 'office': p = OPEN[b.id] ? 0.88 : 0.07; break;
    case 'biz': p = OPEN[b.id] ? 0.95 : 0.05; break;
    case 'pub': p = OPEN[b.id] ? 0.82 : 0.05; break;
    case 'h24': p = 0.55; break;
    case 'office24': return true;
    default: return false;
  }
  return hashN(b.id, g, Math.floor((SIM.min + b.id * 17) / 41)) < p;
}

/* weather & energy */
function windF() { const t = SIM.min; return clamp(0.55 + 0.28 * Math.sin(t / 230) + 0.12 * Math.sin(t / 61 + 1.3), 0.12, 0.98); }
function energyNow() {
  const h = tod() / 60, day = dayN();
  const sun = Math.max(0, Math.sin(Math.PI * (h - 6) / 14));
  const cl = 0.78 + 0.22 * Math.sin(day * 1.7 + h * 0.35);
  const solar = 11.5 * sun * cl, wind = 9.2 * windF();
  const homes = 5 * (h < 6 ? 0.42 : h < 9 ? 0.82 : h < 17 ? 0.58 : h < 23 ? 1 : 0.55);
  const biz = 5.5 * (h >= 8 && h < 20 ? 1 : 0.32);
  return { solar, wind, prod: solar + wind, cons: 6 + homes + biz };
}
function tempNow() { const h = tod() / 60; return Math.round(21 + 5 * Math.cos((h - 15) / 24 * TAU) + 1.5 * Math.sin(dayN() * 2.1)); }
function matchInfo() {
  const wd = wday(), t = tod(), day = dayN();
  const rival = RIVALS[((day % RIVALS.length) + RIVALS.length) % RIVALS.length];
  if (wd !== 3 && wd !== 6) return { state: 'none', rival };
  if (t < 1140) return { state: 'soon', rival };
  const goals = [];
  const nH = Math.floor(hashN(day, 1) * 4), nA = Math.floor(hashN(day, 2) * 3);
  for (let i = 0; i < nH; i++) goals.push([Math.floor(hashN(day, 10 + i) * 88) + 1, 'h']);
  for (let i = 0; i < nA; i++) goals.push([Math.floor(hashN(day, 20 + i) * 88) + 1, 'a']);
  const minute = Math.min(90, Math.floor((t - 1140) / 110 * 90));
  const hs = goals.filter(g => g[0] <= minute && g[1] === 'h').length, as = goals.filter(g => g[0] <= minute && g[1] === 'a').length;
  return { state: t >= 1250 ? 'over' : 'live', rival, h: hs, a: as, minute };
}

/* road agents: cars and pedestrians drive tile to tile along quadratic curves */
function initAgents() {
  const r = mulberry32(2024);
  const roads = [];
  for (let i = 0; i < W * H; i++) if (isRoadT(ground[i]) && rdir[i]) roads.push(i);
  for (let n = 0; n < 56; n++) {
    const type = n < 4 ? 'bus' : n < 9 ? 'taxi' : n === 9 ? 'police' : 'car';
    const col = type === 'bus' ? '#f2c230' : type === 'taxi' ? '#f5d142' : type === 'police' ? '#f4f6f8' : pick(r, CAR_COLORS);
    const a = makeAgent(r, roads, 0.17, type === 'bus' ? 0.72 : 0.85 + r() * 0.5);
    Object.assign(a, { id: n, kind: 'car', type, col: carCols(col), on: true, dens: r(), stuck: 0, ghost: 0, route: type === 'bus' ? [3, 7, 12, 21][n] : 0, driver: -1 });
    CARS.push(a);
  }
  for (let n = 0; n < 70; n++) {
    const a = makeAgent(r, roads, 0.41, 0.15 + r() * 0.1);
    Object.assign(a, { id: n, kind: 'ped', c: pick(r, SHIRTS), sk: pick(r, SKINS), dens: r(), on: true, ph: r() * TAU });
    PEDS.push(a);
  }
  const names = ['Яхта «Ассоль»', 'Яхта «Бриз»', 'Яхта «Мечта»', 'Яхта «Ветерок»', 'Катер «Чайка»', 'Яхта «Лазурь»'];
  const defs = [[5, 25.3, 0.12, 1, 12.6, 1], [9, 26.5, 0.09, 1.5, 12.8, -1], [18, 25.0, 0.1, 16.2, 22.4, 1], [20, 26.6, 0.08, 16, 23.2, -1]];
  defs.forEach(([x, y, v, mn, mx, dir], i) => BOATS.push({ kind: 'boat', name: names[i], x, y, v, min: mn, max: mx, dir, h: dir > 0 ? 0 : Math.PI, sail: true, len: 0.17, ph: x, d: x + y,
    cl: faceL('#f4f6f8'), cr: faceR('#f4f6f8'), ct: '#c9a27a' }));
  BOATS.push({ kind: 'boat', name: names[4], x: 13.62, y: 24.7, dock: true, h: Math.PI / 2, sail: false, len: 0.2, ph: 1, d: 38.3, cl: faceL('#1d5f86'), cr: faceR('#1d5f86'), ct: '#f4f6f8' });
  BOATS.push({ kind: 'boat', name: names[5], x: 15.4, y: 25.15, dock: true, h: Math.PI / 2, sail: true, len: 0.17, ph: 2, d: 40.6, cl: faceL('#f4f6f8'), cr: faceR('#f4f6f8'), ct: '#c9a27a' });
  initPlanes();
  const rc = mulberry32(77);
  for (let i = 0; i < 6; i++) {
    CLOUDS.push({ x: -4 + i * 6 + rc() * 3, y: 2 + rc() * 22, z: 150 + rc() * 60, s: 0.7 + rc() * 0.6, v: 0.04 + rc() * 0.03,
      blobs: [0, 1, 2, 3, 4].map(() => [rc() * 1.2 - 0.6, rc() * 0.6 - 0.3, 0.5 + rc() * 0.5]) });
  }
}
function makeAgent(r, roads, lane, vmax) {
  const i = pick(r, roads), x = i % W, y = (i / W) | 0;
  const dirs = [];
  for (let d = 0; d < 4; d++) if (rdir[i] & (1 << d)) dirs.push(d);
  const a = { tx: x, ty: y, din: OPP[pick(r, dirs)], dout: 0, t: r(), v: vmax, vmax, tv: vmax, lane, L: 1, x: 0, y: 0, h: 0, d: 0, r };
  a.dout = chooseOut(a);
  setSeg(a); posAgent(a);
  return a;
}
function chooseOut(a) {
  const m = rdir[idx(a.tx, a.ty)], back = OPP[a.din], opts = [], w = [];
  for (let d = 0; d < 4; d++) if ((m & (1 << d)) && d !== back) { opts.push(d); w.push(d === a.din ? 2.2 : 1); }
  return opts.length ? wpick(a.r, opts, w) : back;
}
function setSeg(a) {
  const cx = a.tx + 0.5, cy = a.ty + 0.5, d1 = a.din, d2 = a.dout, l = a.lane;
  const o1x = -DY[d1] * l, o1y = DX[d1] * l, o2x = -DY[d2] * l, o2y = DX[d2] * l;
  a.p0x = cx - 0.5 * DX[d1] + o1x; a.p0y = cy - 0.5 * DY[d1] + o1y;
  a.p2x = cx + 0.5 * DX[d2] + o2x; a.p2y = cy + 0.5 * DY[d2] + o2y;
  if (d1 === d2) { a.p1x = (a.p0x + a.p2x) / 2; a.p1y = (a.p0y + a.p2y) / 2; }
  else if (d2 === OPP[d1]) { a.p1x = cx + 0.3 * DX[d1]; a.p1y = cy + 0.3 * DY[d1]; }
  else { a.p1x = cx + o1x + o2x; a.p1y = cy + o1y + o2y; }
  const c01 = Math.hypot(a.p1x - a.p0x, a.p1y - a.p0y), c12 = Math.hypot(a.p2x - a.p1x, a.p2y - a.p1y), c02 = Math.hypot(a.p2x - a.p0x, a.p2y - a.p0y);
  a.L = Math.max(0.2, (c01 + c12 + c02) / 2);
}
function posAgent(a) {
  const t = a.t, u = 1 - t;
  a.x = u * u * a.p0x + 2 * u * t * a.p1x + t * t * a.p2x;
  a.y = u * u * a.p0y + 2 * u * t * a.p1y + t * t * a.p2y;
  const dx = 2 * u * (a.p1x - a.p0x) + 2 * t * (a.p2x - a.p1x), dy = 2 * u * (a.p1y - a.p0y) + 2 * t * (a.p2y - a.p1y);
  if (dx * dx + dy * dy > 1e-8) a.h = Math.atan2(dy, dx);
  a.d = a.x + a.y;
}
function stepAgent(a, dt) {
  a.t += a.v * dt / a.L;
  let guard = 0;
  while (a.t >= 1 && guard++ < 4) {
    a.t -= 1; a.tx += DX[a.dout]; a.ty += DY[a.dout]; a.din = a.dout;
    a.dout = chooseOut(a); setSeg(a);
  }
  posAgent(a);
}
const BUCK = new Map();
function carFollow(dt) {
  BUCK.clear();
  for (const c of CARS) if (c.on) { const k = idx(c.tx, c.ty) * 4 + c.din; let arr = BUCK.get(k); if (!arr) BUCK.set(k, arr = []); arr.push(c); }
  for (const c of CARS) {
    if (!c.on) continue;
    let gap = 9;
    const same = BUCK.get(idx(c.tx, c.ty) * 4 + c.din);
    if (same) for (const o of same) if (o !== c && o.t > c.t) gap = Math.min(gap, (o.t - c.t) * c.L);
    const nx = c.tx + DX[c.dout], ny = c.ty + DY[c.dout];
    if (inMap(nx, ny)) { const nxt = BUCK.get(idx(nx, ny) * 4 + c.dout); if (nxt) for (const o of nxt) if (o !== c) gap = Math.min(gap, (1 - c.t) * c.L + o.t * o.L); }
    const need = c.type === 'bus' ? 0.6 : 0.4;
    let tv = gap < need ? 0 : gap < need * 2 ? c.vmax * (gap - need) / need : c.vmax;
    if (c.ghost > 0) { c.ghost -= dt; tv = c.vmax * 0.6; }
    c.v += clamp(tv - c.v, -3 * dt, 1.2 * dt);
    if (c.v < 0.02) { c.stuck += dt; if (c.stuck > 5) { c.ghost = 2.5; c.stuck = 0; } } else c.stuck = 0;
  }
}
function onScreen(a) { const X = ix(a.x, a.y), Y = iy(a.x, a.y, 0); return X > VIEW.x0 - 40 && X < VIEW.x1 + 40 && Y > VIEW.y0 - 40 && Y < VIEW.y1 + 40; }
function updateDensity() {
  const h = tod() / 60;
  const dc = h < 5 ? 0.25 : h < 7 ? lerp(0.25, 0.95, (h - 5) / 2) : h < 20 ? 1 : h < 23 ? lerp(1, 0.45, (h - 20) / 3) : 0.3;
  const dp = h < 6 ? 0.12 : h < 8 ? 0.6 : h < 21 ? 1 : h < 23 ? 0.5 : 0.18;
  for (const c of CARS) { const want = c.dens < dc; if (want !== c.on && !onScreen(c) && !(SEL && SEL.t === 'car' && SEL.id === c.id)) c.on = want; }
  for (const p of PEDS) { const want = p.dens < dp; if (want !== p.on && !onScreen(p)) p.on = want; }
}
function updateBoats(dt) {
  for (const b of BOATS) {
    if (!b.dock) {
      b.x += b.dir * b.v * dt;
      if (b.x > b.max) b.dir = -1; else if (b.x < b.min) b.dir = 1;
      b.h = approachAngle(b.h, b.dir > 0 ? 0 : Math.PI, dt * 0.7);
    }
    b.d = b.x + b.y;
  }
}
function updateClouds(dt) { for (const c of CLOUDS) { c.x += c.v * dt; if (c.x > W + 6) c.x = -8; } }

/* airport: planes push back, taxi, take off, land and park by the timetable */
const RWY = 26.5, TWY = 25.62, GX = 24.58;
let planeSeq = 0, runway = 0;
const arrQ = [], gateOf = [0, 0, 0];
function mkPlane(fi, al) {
  const f = fi == null ? null : FL[fi], A = f ? f.al : (al || 'LZ');
  return { id: ++planeSeq, kind: 'plane', fi, al: A, tail: AIRLINE[A].tail, ac: f ? f.ac : 'Airbus A320', x: 0, y: 0, z: 0, h: 0, v: 0, st: '', path: null, pi: 0, rev: false, alpha: 1, gate: -1, d: 0 };
}
function initPlanes() {
  for (const [g, al, ac] of [[0, 'LZ', 'Airbus A320'], [2, 'BZ', 'Boeing 737-800']]) {
    const p = mkPlane(null, al);
    p.ac = ac; p.x = GX; p.y = GATES[g]; p.h = Math.PI; p.st = 'parked'; p.gate = g; gateOf[g] = p.id; p.d = p.x + p.y;
    PLANES.push(p);
  }
}
const DEP_STATES = ['push', 'taxiOut', 'hold', 'lineup', 'rotate'];
function startDeparture(fi) {
  if (PLANES.some(q => DEP_STATES.includes(q.st))) return;
  const f = FL[fi];
  let p = PLANES.find(q => q.st === 'parked' && q.al === f.al) || PLANES.find(q => q.st === 'parked');
  if (p) {
    gateOf[p.gate] = 0; p.gate = -1;
    p.st = 'push'; p.path = [[TWY, p.y]]; p.pi = 0; p.v = 0.22; p.rev = true;
  } else {
    p = mkPlane(fi); p.x = 24.1; p.y = 9.05; p.h = 0; p.alpha = 0;
    p.st = 'taxiOut'; p.path = [[TWY, 9.05], [TWY, 10.5]]; p.pi = 0; p.v = 0.45;
    PLANES.push(p);
  }
  p.fi = fi; p.al = f.al; p.tail = AIRLINE[f.al].tail; p.ac = f.ac;
}
function startArrival(fi) {
  if (runway || PLANES.some(q => q.st === 'hold')) { if (arrQ.length < 1) arrQ.push(fi); return; }
  const p = mkPlane(fi);
  p.st = 'approach'; p.x = RWY; p.y = 32; p.z = 160; p.h = -Math.PI / 2; p.v = 4.2;
  runway = p.id; PLANES.push(p);
}
function followPath(p, dt) {
  let step = p.v * dt;
  while (step > 1e-6 && p.pi < p.path.length) {
    const tx = p.path[p.pi][0], ty = p.path[p.pi][1], dx = tx - p.x, dy = ty - p.y, dist = Math.hypot(dx, dy);
    if (dist < 1e-4) { p.pi++; continue; }
    p.h = approachAngle(p.h, p.rev ? Math.atan2(-dy, -dx) : Math.atan2(dy, dx), dt * 2.2);
    const m = Math.min(step, dist);
    p.x += dx / dist * m; p.y += dy / dist * m; step -= m;
    if (m >= dist - 1e-6) p.pi++;
  }
  return p.pi >= p.path.length;
}
function pathDone(p) {
  switch (p.st) {
    case 'push': p.st = 'taxiOut'; p.rev = false; p.path = [[TWY, 10.5]]; p.pi = 0; p.v = 0.45; break;
    case 'taxiOut': p.st = 'hold'; break;
    case 'lineup': p.st = 'rotate'; break;
    case 'exit': {
      runway = 0;
      const g = gateOf.findIndex(v => !v);
      if (g >= 0) { gateOf[g] = p.id; p.gate = g; p.st = 'taxiIn'; p.path = [[TWY, GATES[g]], [GX, GATES[g]]]; }
      else { p.st = 'toHangar'; p.path = [[TWY, 9.05], [24.1, 9.05]]; }
      p.pi = 0; p.v = 0.45;
      break;
    }
    case 'taxiIn': p.st = 'parked'; p.v = 0; break;
    case 'toHangar': p.st = 'fade'; break;
  }
}
function updatePlanes(dt) {
  for (let i = PLANES.length - 1; i >= 0; i--) {
    const p = PLANES[i];
    if (p.alpha < 1 && p.st !== 'fade') p.alpha = Math.min(1, p.alpha + dt * 0.8);
    switch (p.st) {
      case 'push': case 'taxiOut': case 'lineup': case 'exit': case 'taxiIn': case 'toHangar':
        if (followPath(p, dt)) pathDone(p);
        break;
      case 'hold': p.wait = (p.wait || 0) + dt; break;
      case 'rotate':
        p.h = approachAngle(p.h, -Math.PI / 2, dt * 0.9);
        if (Math.abs(angDiff(p.h, -Math.PI / 2)) < 0.01) { p.h = -Math.PI / 2; p.st = 'roll'; p.v = 0.2; }
        break;
      case 'roll':
        p.v = Math.min(7.5, p.v + dt * 1.25); p.y -= p.v * dt;
        if (p.y < 6.5) p.z = Math.max(0, p.z + dt * (p.v - 3) * 22);
        if (runway === p.id && p.z > 25) runway = 0;
        if (p.y < -26) { if (runway === p.id) runway = 0; PLANES.splice(i, 1); continue; }
        break;
      case 'approach':
        p.y -= p.v * dt; p.z = Math.max(0, (p.y - 8.6) / (32 - 8.6) * 160);
        if (p.y <= 8.6) { p.z = 0; p.st = 'rollout'; }
        break;
      case 'rollout':
        p.v = Math.max(0.45, p.v - dt * 1.7); p.y -= p.v * dt;
        if (p.y <= 3.5) { p.y = 3.5; p.st = 'exit'; p.path = [[TWY, 3.5]]; p.pi = 0; p.v = 0.4; }
        break;
      case 'fade':
        p.alpha -= dt * 0.7;
        if (p.alpha <= 0) { PLANES.splice(i, 1); continue; }
        break;
    }
    p.d = p.x + p.y;
  }
  if (!runway) {
    // the runway alternates: a plane that has waited at the hold line goes before the next arrival
    const hp = PLANES.find(q => q.st === 'hold');
    if (hp && (!arrQ.length || hp.wait > 1.5)) { runway = hp.id; hp.st = 'lineup'; hp.path = [[RWY, 10.5]]; hp.pi = 0; hp.v = 0.35; hp.rev = false; hp.wait = 0; }
    else if (arrQ.length) { const fi = arrQ.shift(); const p = mkPlane(fi); p.st = 'approach'; p.x = RWY; p.y = 32; p.z = 160; p.h = -Math.PI / 2; p.v = 4.2; runway = p.id; PLANES.push(p); }
  }
}
function delayOf(i, day) { return hashN(i, day, 99) < 0.12 ? 20 + Math.floor(hashN(i, day, 7) * 50) : 0; }
function checkFlights(prev, now) {
  if (now - prev > 360) prev = now - 360;
  const d0 = Math.floor(prev / 1440), d1 = Math.floor(now / 1440);
  for (let d = d0; d <= d1; d++) for (let i = 0; i < FL.length; i++) {
    const f = FL[i], at = d * 1440 + f.t + delayOf(i, d) - (f.type === 'd' ? 14 : 8);
    if (at > prev && at <= now) { if (f.type === 'd') startDeparture(i); else startArrival(i); }
  }
}

function update(dt) {
  const rate = SPEEDS[SIM.sp], prev = SIM.min;
  SIM.min += rate * dt;
  const adt = dt * AGENT_RATE[SIM.sp];
  SIM.anim += adt;
  if (rate > 0) checkFlights(prev, SIM.min);
  computeLight();
  const ok = Math.floor(SIM.min * 2);
  if (ok !== openKey) { openKey = ok; updateHourly(); }
  if (adt > 0) {
    carFollow(adt);
    for (const c of CARS) if (c.on) stepAgent(c, adt);
    for (const p of PEDS) if (p.on) stepAgent(p, adt);
    updateBoats(adt); updatePlanes(adt); updateClouds(adt);
    TURB_ANGLE += adt * (0.5 + 2.4 * windF());
  }
  updateDensity();
  if (LIGHT.sa > 0.005) { const sk = Math.round(tod() / 5); if (sk !== shadowKey) { shadowKey = sk; buildShadows(LIGHT.sdx, LIGHT.sdy); } }
}
