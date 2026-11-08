/* gen.js — builds the city from the plan: ground, buildings, addresses, people, jobs, decor */
const TT = { GRASS: 0, ROAD: 1, WATER: 2, SAND: 3, PARK: 4, TREES: 5, COURT: 6, PLAZA: 7, PARKING: 8, FIELD: 9, SOLAR: 10, PIER: 11, RUNWAY: 12, APRON: 13, BRIDGE: 14 };
const CH2T = { '.': 0, '#': 1, w: 2, y: 3, p: 4, t: 5, k: 6, q: 7, v: 8, f: 9, o: 10, j: 11, R: 12, x: 13, '=': 14 };
const KIND_OF = { A: 'apt', B: 'aptB', h: 'house', c: 'cafe', r: 'rest', s: 'shop', T: 'office' };
const LM_GROUND = { stadium: TT.FIELD, terminal: TT.PLAZA, cityhall: TT.PLAZA, mall: TT.PLAZA, theatre: TT.PLAZA, hangar: TT.APRON, tower: TT.APRON,
  school: TT.PLAZA, hospital: TT.PLAZA, gas: TT.PLAZA, fire: TT.PLAZA, police: TT.PLAZA, energy: TT.PLAZA, museum: TT.PLAZA, cinema: TT.PLAZA,
  bank: TT.PLAZA, library: TT.PLAZA, post: TT.PLAZA, grandhotel: TT.PLAZA, hotel: TT.PLAZA, ferris: TT.PARK };
const ground = new Uint8Array(W * H);
const occ = new Int16Array(W * H).fill(-1);
const rdir = new Uint8Array(W * H);
const tileStreets = Array.from({ length: W * H }, () => []);
const BLD = [], PPL = [], STATIC = [], LAMPS = [], BEACONS = [], FLOODS = [], LABELS = [];
const streetOrigin = {};
const STATS = {};
let MAYOR = -1, SCHOOL_ID = -1, KINDER_ID = -1, TERMINAL_ID = -1, STADIUM_ID = -1, LIGHTHOUSE_ID = -1, turbN = 0;
const RN = mulberry32(31337);
const isRoadT = t => t === TT.ROAD || t === TT.BRIDGE;
const isRoadAt = (x, y) => inMap(x, y) && isRoadT(ground[idx(x, y)]);
const isWetT = t => t === TT.WATER || t === TT.PIER || t === TT.BRIDGE;
const bits = m => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);

function genWorld() {
  genGround();
  genBuildings();
  genAddresses();
  genJobs();
  genDecor();
  computeStats();
}

function genGround() {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = MAP[y][x];
    let t = CH2T[ch];
    if (t === undefined) t = y >= 22 ? TT.SAND : ('crsT'.indexOf(ch) >= 0 ? TT.PLAZA : TT.GRASS);
    ground[idx(x, y)] = t;
  }
  STREETS.forEach((s, si) => {
    streetOrigin[s.n] = Math.min(streetOrigin[s.n] ?? 99, s.a);
    for (let t = s.a; t <= s.b; t++) {
      const x = s.ax === 'h' ? t : s.c, y = s.ax === 'h' ? s.c : t, i = idx(x, y);
      ground[i] = isWetT(ground[i]) ? TT.BRIDGE : TT.ROAD;
      tileStreets[i].push(si);
    }
  });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (!isRoadT(ground[i])) continue;
    if (!tileStreets[i].length) console.warn('road without street', x, y);
    let m = 0;
    for (let d = 0; d < 4; d++) if (isRoadAt(x + DX[d], y + DY[d])) m |= 1 << d;
    rdir[i] = m;
  }
}

function addB(kind, x, y, s) {
  const b = { id: BLD.length, kind, x, y, s: s || 1 };
  BLD.push(b);
  for (let i = 0; i < b.s; i++) for (let j = 0; j < b.s; j++) occ[idx(x + i, y + j)] = b.id;
  return b;
}
function genBuildings() {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = KIND_OF[MAP[y][x]]; if (k) addB(k, x, y, 1); }
  for (const l of LANDMARKS) {
    const b = addB(l.k, l.x, l.y, l.s);
    const g = LM_GROUND[l.k];
    if (g != null) for (let i = 0; i < b.s; i++) for (let j = 0; j < b.s; j++) ground[idx(l.x + i, l.y + j)] = g;
  }
  for (const b of BLD) setupB(b);
}
const FLOOR_WORD = { 5: 'Пятиэтажка', 6: 'Шестиэтажка', 7: 'Семиэтажка', 8: 'Восьмиэтажка', 9: 'Девятиэтажка' };
const expandJobs = list => (list || []).flatMap(([t, n]) => Array.from({ length: n }, () => ({ t, p: null })));
function jkName(b) {
  if (b.x < 9) return b.y < 10 ? 'ЖК «Сиреневый»' : 'ЖК «Вишнёвый сад»';
  if (b.x >= 19) return 'ЖК «Морской бриз»';
  return 'ЖК «Центральный»';
}
function setupB(b) {
  const r = mulberry32(9001 + b.id * 7919);
  const k = b.kind, key = b.x + ',' + b.y;
  b.cx = b.x + b.s / 2; b.cy = b.y + b.s / 2;
  if (k === 'apt' || k === 'aptB') {
    const nb = k === 'aptB';
    b.cat = 'home'; b.icon = '🏢'; b.lc = 'home';
    b.wall = pick(r, nb ? PAL.newWalls : PAL.aptWalls); b.roof = pick(r, PAL.aptRoof);
    if (nb) b.accent = pick(r, PAL.newAccent);
    genApts(b, r);
    b.name = nb ? jkName(b) : (FLOOR_WORD[b.floors] || 'Жилой дом');
    b.type = (nb ? 'Новостройка, ' : 'Жилой дом, ') + b.floors + ' ' + plural(b.floors, ['этаж', 'этажа', 'этажей']);
  } else if (k === 'house') {
    b.cat = 'house'; b.icon = '🏡'; b.lc = 'home';
    b.wall = pick(r, PAL.houseWalls); b.roof = pick(r, PAL.houseRoof); b.ridgeX = r() < 0.5;
    b.floors = r() < 0.55 ? 2 : 1; b.year = ri(r, 1952, 2021); b.rooms = ri(r, 3, 6); b.area = Math.round(60 + b.rooms * 18 + r() * 30);
    const fam = genFamily(r, 4, true);
    b.ppl = fam.map(m => makePerson(m, b.id, -1).id);
    dedupeNames(b.ppl);
    b.pet = r() < 0.55 ? genPet(r) : null;
    b.garden = pick(r, GARDENS);
    b.name = 'Дом семьи ' + surPl(fam[0].s);
    b.type = 'Частный дом · ' + b.floors + ' ' + plural(b.floors, ['этаж', 'этажа', 'этажей']);
  } else if (BIZ[key]) {
    const t = BIZ[key];
    Object.assign(b, t);
    b.hours = t.hours ? [hhmm(t.hours[0]), hhmm(t.hours[1])] : null;
    b.icon = k === 'cafe' ? '☕' : k === 'rest' ? '🍽' : k === 'shop' ? (t.cat === 'health' ? '💊' : '🛍') : '💼';
    b.cat = t.cat || (k === 'cafe' ? 'cafe' : k === 'rest' ? 'food' : k === 'shop' ? 'shop' : 'office');
    b.lc = k === 'office' ? 'office' : 'biz';
    b.short = t.name.replace(/[«»]/g, '').replace(/^БЦ /, '');
    if (k === 'office') {
      b.hours = [480, 1140]; b.closed = [0, 6];
      b.type = 'Бизнес-центр · ' + b.floors + ' ' + plural(b.floors, ['этаж', 'этажа', 'этажей']);
      b.jobs = []; b.comp = [];
      let fl = 2;
      const span = Math.max(2, Math.floor((b.floors - 1) / t.cos.length));
      t.cos.forEach(([cn, ct, set, n], ci) => {
        const c = { name: cn, type: ct, from: fl, to: ci === t.cos.length - 1 ? b.floors : Math.min(b.floors, fl + span - 1), jobs: [] };
        fl = c.to + 1;
        c.jobs.push({ t: 'Генеральный директор', p: null });
        const js = JOBSETS[set], total = Math.round(n * 1.8), wsum = js.reduce((s, j) => s + j[1], 0);
        for (const [jt, w] of js) { const cnt = Math.max(1, Math.round(total * w / wsum)); for (let i = 0; i < cnt; i++) c.jobs.push({ t: jt, p: null }); }
        b.comp.push(c); b.jobs.push(...c.jobs);
      });
    } else {
      b.floors = t.floors || (k === 'rest' ? 2 : 1);
      b.jobs = expandJobs(t.staff);
    }
  } else if (LM[k]) {
    const t = LM[k];
    Object.assign(b, t);
    b.hours = t.hours ? [hhmm(t.hours[0]), hhmm(t.hours[1])] : null;
    b.jobs = expandJobs(t.jobs);
    b.short = t.name.replace(/[«»]/g, '');
    if (k === 'turbine') { turbN++; b.name = 'Ветрогенератор № ' + turbN; b.short = 'Ветряк ' + turbN; }
    if (k === 'school') SCHOOL_ID = b.id;
    if (k === 'kinder') KINDER_ID = b.id;
    if (k === 'terminal') TERMINAL_ID = b.id;
    if (k === 'stadium') STADIUM_ID = b.id;
    if (k === 'lighthouse') LIGHTHOUSE_ID = b.id;
  } else { b.cat = 'infra'; b.name = 'Здание'; b.icon = '🏢'; b.lc = 'none'; }
  if (!b.year) b.year = LM_YEAR[k] || ri(r, 1958, 2021);
}

function genApts(b, r) {
  const nb = b.kind === 'aptB';
  b.floors = nb ? ri(r, 12, 16) : ri(r, 5, 9);
  b.per = nb ? (r() < 0.5 ? 4 : 3) : (r() < 0.3 ? 2 : r() < 0.75 ? 3 : 4);
  b.year = nb ? ri(r, 2011, 2024) : ri(r, 1961, 1994);
  b.apts = [];
  const AREA = [[22, 29], [31, 42], [43, 62], [61, 84], [86, 118]];
  for (let f = 1; f <= b.floors; f++) for (let k = 0; k < b.per; k++) {
    const q = r();
    const rooms = nb ? (q < 0.14 ? 0 : q < 0.42 ? 1 : q < 0.72 ? 2 : q < 0.94 ? 3 : 4) : (q < 0.34 ? 1 : q < 0.76 ? 2 : q < 0.97 ? 3 : 4);
    const area = Math.round(lerp(AREA[rooms][0], AREA[rooms][1], r()) * 10) / 10;
    const a = { n: b.apts.length + 1, fl: f, rooms, area, ppl: [], vac: null, price: 0, pet: null };
    if (r() < 0.065) {
      a.vac = r() < 0.5 ? 'sale' : 'rent';
      a.price = a.vac === 'sale'
        ? Math.round(area * (nb ? 128000 : 96000) * (0.9 + r() * 0.25) / 10000) * 10000
        : Math.round((14000 + area * 380 * (nb ? 1.2 : 1)) / 500) * 500;
    } else {
      const fam = genFamily(r, rooms, false);
      for (const m of fam) a.ppl.push(makePerson(m, b.id, b.apts.length).id);
      dedupeNames(a.ppl);
      if (r() < 0.3) a.pet = genPet(r);
    }
    b.apts.push(a);
  }
}
function genFamily(r, rooms, isHouse) {
  const S = () => pick(r, SURNAMES);
  const fam = [], sur = S();
  const add = (g, a, s) => fam.push({ g, a: Math.round(a), s: s || sur });
  const gr = () => (r() < 0.5 ? 'm' : 'f');
  const kids = (n, pa) => { const maxA = Math.min(17, pa - 20); for (let i = 0; i < n && maxA >= 0; i++) add(gr(), ri(r, 0, maxA)); };
  const couple = (a0, a1) => { const a = ri(r, a0, a1); add('m', a + ri(r, -1, 4)); add('f', a); return a; };
  const roll = r();
  if (isHouse) {
    if (roll < 0.7) { const a = couple(30, 55); kids(ri(r, 1, 3), a); if (r() < 0.25) add(r() < 0.6 ? 'f' : 'm', ri(r, 62, 84), r() < 0.5 ? sur : S()); }
    else if (roll < 0.88) couple(55, 75);
    else { const a = couple(26, 40); kids(1, a); }
  } else if (rooms <= 1) {
    if (roll < 0.4) add(gr(), ri(r, 21, 58));
    else if (roll < 0.62) add(r() < 0.62 ? 'f' : 'm', ri(r, 64, 88));
    else { const a = couple(23, 38); if (r() < 0.3) kids(1, Math.min(a, 25)); }
  } else if (rooms === 2) {
    if (roll < 0.16) add(gr(), ri(r, 24, 62));
    else if (roll < 0.32) couple(60, 78);
    else if (roll < 0.66) { const a = couple(26, 45); kids(1 + (r() < 0.25 ? 1 : 0), a); }
    else if (roll < 0.76) { const a = ri(r, 28, 48); add(r() < 0.8 ? 'f' : 'm', a); kids(1, a); }
    else couple(23, 40);
  } else {
    if (roll < 0.55) { const a = couple(29, 50); kids(1 + (r() < 0.55 ? 1 : 0) + (rooms >= 4 && r() < 0.45 ? 1 : 0), a); }
    else if (roll < 0.72) { const a = couple(30, 48); kids(1, a); add(r() < 0.65 ? 'f' : 'm', ri(r, 63, 86), r() < 0.5 ? sur : S()); }
    else if (roll < 0.84) { const n = Math.min(rooms, 2 + (r() < 0.4 ? 1 : 0)); for (let i = 0; i < n; i++) add(gr(), ri(r, 19, 30), S()); }
    else couple(58, 76);
  }
  return fam;
}
function makePerson(spec, home, apt) {
  const g = spec.g;
  const p = { id: PPL.length, g, a: spec.a, f: pick(RN, g === 'm' ? M_NAMES : F_NAMES), sur: spec.s, l: g === 'm' ? spec.s : surF(spec.s), home, apt, job: -1, jt: '', st: '' };
  PPL.push(p);
  return p;
}
function dedupeNames(ids) {
  for (let i = 0; i < ids.length; i++) for (let j = 0; j < i; j++) {
    const a = PPL[ids[i]], b = PPL[ids[j]];
    let n = 0;
    while (a.f === b.f && n++ < 6) a.f = pick(RN, a.g === 'm' ? M_NAMES : F_NAMES);
  }
}
function genPet(r) { const [kind, names] = wpick(r, PETS, PET_W); return kind + ' ' + pick(r, names); }

function genAddresses() {
  const used = new Map(), pref = [1, 0, 3, 2];
  for (const b of BLD) {
    let hit = null;
    outer: for (let i = 0; i < b.s; i++) for (let j = 0; j < b.s; j++) {
      for (const d of pref) {
        const nx = b.x + i + DX[d], ny = b.y + j + DY[d];
        if (nx >= b.x && nx < b.x + b.s && ny >= b.y && ny < b.y + b.s) continue;
        if (isRoadAt(nx, ny)) { hit = { x: nx, y: ny, d }; break outer; }
      }
    }
    if (!hit) hit = bfsRoad(b);
    const si = tileStreets[idx(hit.x, hit.y)];
    const want = (hit.d === 1 || hit.d === 3) ? 'h' : 'v';
    const s = STREETS[si.find(q => STREETS[q].ax === want) ?? si[0]];
    const o = streetOrigin[s.n];
    const n = Math.max(1, s.ax === 'h' ? 2 * (b.x - o) + 1 + (b.y < s.c ? 0 : 1) : 2 * (b.y - o) + 1 + (b.x < s.c ? 0 : 1));
    const key = s.n + '|' + n, c = used.get(key) || 0;
    used.set(key, c + 1);
    b.street = s.n; b.num = n + (c ? 'к' + (c + 1) : ''); b.addr = s.n + ', ' + b.num;
  }
}
function bfsRoad(b) {
  const seen = new Uint8Array(W * H), q = [];
  for (let i = 0; i < b.s; i++) for (let j = 0; j < b.s; j++) { q.push([b.x + i, b.y + j]); seen[idx(b.x + i, b.y + j)] = 1; }
  for (let k = 0; k < q.length; k++) {
    const [x, y] = q[k];
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (!inMap(nx, ny) || seen[idx(nx, ny)]) continue;
      seen[idx(nx, ny)] = 1;
      if (isRoadAt(nx, ny)) return { x: nx, y: ny, d };
      q.push([nx, ny]);
    }
  }
  return { x: 3, y: 4, d: 1 };
}

function genJobs() {
  const r = mulberry32(4242);
  for (const b of BLD) {
    const groups = b.apts ? b.apts.map(a => a.ppl) : (b.ppl ? [b.ppl] : []);
    for (const g of groups) {
      if (!g.some(id => PPL[id].a <= 1)) continue;
      const mom = g.map(id => PPL[id]).find(p => p.g === 'f' && p.a >= 20 && p.a <= 45);
      if (mom && r() < 0.75) mom.st = 'mat';
    }
  }
  for (const p of PPL) {
    if (p.a < 18 || p.st) continue;
    if (p.a >= 65 || (p.a >= 60 && r() < 0.45)) p.st = 'ret';
    else if (p.a <= 22 && r() < 0.62) p.st = 'stud';
  }
  const slots = [];
  for (const b of BLD) if (b.jobs) for (const j of b.jobs) slots.push({ b, j });
  const pool = shuffle(r, PPL.filter(p => p.a >= 18 && !p.st));
  const isHead = s => HEAD_RE.test(s.j.t);
  const heads = shuffle(r, slots.filter(isHead)), rest = shuffle(r, slots.filter(s => !isHead(s)));
  const setJob = (p, s) => { p.job = s.b.id; p.jt = s.j.t; s.j.p = p.id; if (s.j.t === 'Мэр города') MAYOR = p.id; };
  for (const s of heads) { const p = pool.find(q => q.job < 0 && q.a >= 35 && q.a <= 62); if (p) setJob(p, s); }
  let k = 0;
  for (const s of rest) {
    if (r() < 0.035) continue; // a few open vacancies
    while (k < pool.length && pool[k].job >= 0) k++;
    if (k >= pool.length) break;
    setJob(pool[k++], s);
  }
  for (const p of pool) if (p.job < 0) p.st = 'misc';
}

function addS(o) { STATIC.push(o); return o; }
function addTree(r, x, y, type) {
  const tp = type ?? (r() < 0.2 ? 1 : 0);
  const autumn = tp === 0 && r() < 0.16;
  const c = tp === 1 ? pick(r, ['#3f8f5a', '#4a9a63', '#367f50']) : tp === 2 ? '#5fae4e'
    : autumn ? pick(r, ['#e0a43a', '#d9792e', '#e8c547']) : pick(r, ['#5fae4e', '#6cbb55', '#52a048', '#78c25c']);
  return addS({ t: 'tree', x, y, type: tp, s: 0.8 + r() * 0.45, c, c2: mixHex(c, '#1d3b2a', 0.28), c1: mixHex(c, '#ffffff', 0.2), ph: r() * TAU });
}
const CAR_COLORS = ['#d64545', '#2f6fb5', '#f2f2f2', '#2b2f36', '#b9c0c8', '#3f8f5a', '#e0a43a', '#7a4fb5', '#e86f51', '#5aa9c9'];
const UMB_COLORS = ['#ff6b4a', '#14a3b8', '#f2c230', '#ffffff', '#6aa98a', '#e57399'];
const carCols = c => ({ c, t: lighten(c, 0.12), l: faceL(c), r: faceR(c) });

function genDecor() {
  const r = mulberry32(555);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y), t = ground[i];
    if (occ[i] >= 0) continue;
    const air = x >= 22 && y <= 10;
    if (t === TT.TREES) {
      const spots = shuffle(r, [[0.26, 0.3], [0.72, 0.28], [0.3, 0.74], [0.74, 0.72], [0.5, 0.5]]);
      const n = 2 + (r() < 0.6 ? 1 : 0);
      for (let k = 0; k < n; k++) addTree(r, x + spots[k][0] + (r() - 0.5) * 0.1, y + spots[k][1] + (r() - 0.5) * 0.1);
    } else if (t === TT.PARK) {
      const nearWheel = Math.abs(x - 18) <= 1 && y <= 2;
      if (!nearWheel && r() < 0.6) addTree(r, x + 0.2 + r() * 0.12, y + 0.2 + r() * 0.12);
      if (!nearWheel && r() < 0.3) addS({ t: 'bench', x: x + 0.74, y: y + 0.36 });
    } else if (t === TT.COURT) {
      addTree(r, x + 0.2, y + 0.22);
      if (hashN(x, y, 5) < 0.5) addS({ t: 'swing', x: x + 0.62, y: y + 0.6, ph: r() * TAU });
      else addS({ t: 'slide', x: x + 0.64, y: y + 0.62 });
      addS({ t: 'bench', x: x + 0.24, y: y + 0.66 });
    } else if (t === TT.GRASS && !air) {
      if (r() < 0.25) addTree(r, x + 0.2 + r() * 0.6, y + 0.2 + r() * 0.6);
    } else if (t === TT.SAND && x < 23) {
      if (y === 22 && x % 2 === 0) addTree(r, x + 0.5, y + 0.2, 2);
      if (!(x === 14 && y === 23) && r() < 0.55) {
        const ux = x + 0.25 + r() * 0.5, uy = y + 0.35 + r() * 0.35;
        addS({ t: 'umb', x: ux, y: uy, c: pick(r, UMB_COLORS) });
        addS({ t: 'sunbed', x: ux + 0.14, y: uy + 0.1 });
      }
    } else if (t === TT.PARKING) {
      const full = x <= 2 && y === 20 ? 0.85 : 0.5;
      for (let row = 0; row < 2; row++) for (let k = 0; k < 4; k++) if (r() < full)
        addS({ t: 'pcar', x: x + 0.125 + k * 0.25, y: y + 0.25 + row * 0.5, h: row ? Math.PI / 2 : -Math.PI / 2, col: carCols(pick(r, CAR_COLORS)) });
    }
  }
  for (const b of BLD) if (b.kind === 'house') {
    const rr = mulberry32(b.id * 77 + 1);
    if (rr() < 0.7) addTree(rr, b.x + 0.1, b.y + 0.1);
    if (rr() < 0.45) addS({ t: 'pcar', x: b.x + 0.88, y: b.y + 0.46, h: Math.PI / 2, col: carCols(pick(rr, CAR_COLORS)) });
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (ground[i] !== TT.ROAD || hashN(x, y, 41) > 0.45) continue;
    const sides = [0, 1, 2, 3].filter(d => !(rdir[i] & (1 << d)));
    if (!sides.length) continue;
    const d = sides[(hashN(x, y, 42) * sides.length) | 0];
    addS({ t: 'lamp', x: x + 0.5 + DX[d] * 0.44, y: y + 0.5 + DY[d] * 0.44 });
  }
  addS({ t: 'fountain', x: 15.5, y: 9.0 });
  for (const b of BLD) { buildGeo(b); addS({ t: 'b', b, x: b.cx, y: b.cy }); }
  for (const s of STATIC) { s.d = s.x + s.y; setBounds(s); }
  STATIC.sort((a, b) => a.d - b.d);
  for (const s of STATIC) if (s.t === 'lamp') LAMPS.push(s);
  for (const b of BLD) {
    if (b.kind === 'apt' || b.kind === 'aptB' || b.kind === 'house' || b.kind === 'turbine') continue;
    const pri = b.cat === 'cafe' || b.cat === 'food' ? 2 : (b.kind === 'shop' || b.kind === 'office') ? 1 : 3;
    LABELS.push({ b, txt: b.short || b.name, pri, w: 0 });
  }
  LABELS.sort((a, b) => b.pri - a.pri);
}
function setBounds(s) {
  if (s.t === 'b') { s.bb = s.b.bb; return; }
  const X = ix(s.x, s.y), Y = iy(s.x, s.y, 0);
  const up = s.t === 'tree' ? 34 : s.t === 'lamp' ? 16 : 14;
  s.bb = [X - 14, Y - up, X + 14, Y + 4];
}

function computeStats() {
  STATS.pop = PPL.length;
  STATS.apts = 0; STATS.vac = 0;
  for (const b of BLD) if (b.apts) { STATS.apts += b.apts.length; STATS.vac += b.apts.filter(a => a.vac).length; }
  STATS.houses = BLD.filter(b => b.kind === 'house').length;
  STATS.homes = BLD.filter(b => b.kind === 'apt' || b.kind === 'aptB').length;
  STATS.bld = BLD.length;
  STATS.avgAge = Math.round(PPL.reduce((s, p) => s + p.a, 0) / PPL.length);
  STATS.pupils = PPL.filter(p => p.a >= 7 && p.a <= 17).length;
  STATS.kids = PPL.filter(p => p.a >= 3 && p.a <= 6).length;
  STATS.ret = PPL.filter(p => p.st === 'ret').length;
  let jobs = 0, vac = 0;
  for (const b of BLD) if (b.jobs) for (const j of b.jobs) { jobs++; if (j.p == null) vac++; }
  STATS.jobs = jobs; STATS.vacJobs = vac;
  const cnt = k => BLD.filter(b => b.kind === k).length;
  STATS.cafes = cnt('cafe'); STATS.rests = cnt('rest'); STATS.shops = cnt('shop') + 1; STATS.offices = cnt('office');
  STATS.pets = BLD.reduce((s, b) => s + (b.apts ? b.apts.filter(a => a.pet).length : (b.pet ? 1 : 0)), 0);
  STATS.companies = BLD.reduce((s, b) => s + (b.comp ? b.comp.length : 0), 0);
}
