/* ui.js — HUD, info sheet, gestures, picking, boot */
const $ = s => document.querySelector(s);
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const norm = s => s.toLowerCase().replace(/ё/g, 'е');
const uniq = a => [...new Set(a)];
const UI = { stack: [], open: false };
const ZMIN = 0.28, ZMAX = 3.2;
let FLY = null, FOLLOW = false, REDUCED = false, HUD_MIN = -1, LAST = 0;
const INERT = { vx: 0, vy: 0 };
const PTR = new Map();
let TAP = null, PINCH = null, LASTMV = 0;

function initUI() {
  REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  UI.sheet = $('#sheet'); UI.body = $('#shBody'); UI.back = $('#shBack'); UI.toast = $('#toast');
  $('#shClose').addEventListener('click', closeSheet);
  UI.back.addEventListener('click', goBack);
  UI.body.addEventListener('click', onSheetClick);
  UI.body.addEventListener('input', onSheetInput);
  document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => setSpeed(+b.dataset.speed)));
  $('#citySign').addEventListener('click', () => openView({ k: 'city' }, true));
  document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.open;
    openView(k === 'dir' ? { k: 'dir', q: '', cat: '' } : { k }, true);
  }));
  $('#wallet').addEventListener('click', () => openView({ k: 'me' }, true));
  $('#btnOwn').addEventListener('click', () => setOwnView(!OWNVIEW));
  setOwnView(OWNVIEW);
  CV.addEventListener('pointerdown', onDown);
  CV.addEventListener('pointermove', onMove);
  CV.addEventListener('pointerup', onUp);
  CV.addEventListener('pointercancel', onUp);
  CV.addEventListener('wheel', onWheel, { passive: false });
  addEventListener('keydown', onKey);
  $('#citySub').textContent = fmt(ASSETS.length) + ' ' + plural(ASSETS.length, ['объект', 'объекта', 'объектов']) + ' · демо';
  setSpeed(SIM.sp);
  setInterval(liveTick, 1000);
  setTimeout(hideToast, 9000);
  initSheetDrag();
}
function initSheetDrag() {
  const head = $('#sheetHead');
  let y0 = null, dy = 0;
  head.addEventListener('pointerdown', e => {
    if (VW >= 860 || e.target.closest('button')) return;
    y0 = e.clientY; dy = 0; head.setPointerCapture(e.pointerId); UI.sheet.style.transition = 'none';
  });
  head.addEventListener('pointermove', e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); UI.sheet.style.transform = `translateY(${dy}px)`; });
  const end = () => { if (y0 == null) return; y0 = null; UI.sheet.style.transition = ''; UI.sheet.style.transform = ''; if (dy > 80) closeSheet(); };
  head.addEventListener('pointerup', end); head.addEventListener('pointercancel', end);
}
function setSpeed(i) {
  SIM.sp = i;
  document.querySelectorAll('[data-speed]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.speed === i)));
}
function hideToast() { if (UI.toast) UI.toast.classList.add('hide'); }
function updateHUD() {
  const m = Math.floor(SIM.min);
  if (m === HUD_MIN) return;
  HUD_MIN = m;
  $('#ckTime').textContent = hm(m);
  $('#ckDay').textContent = DAYS_SHORT[wday()] + ', ' + dShort(today());
  const t = tempNow();
  $('#ckTemp').textContent = (t > 0 ? '+' : '') + t + '°';
  $('#ckIco').className = 'ck-ico ' + (LIGHT.d > 0.4 ? 'sun' : 'moon');
}

/* camera */
function clampCam() { CAM.z = clamp(CAM.z, ZMIN, ZMAX); CAM.x = clamp(CAM.x, -W * HW, W * HW); CAM.y = clamp(CAM.y, -80, (W + H) * HH); }
function zoomAt(sx, sy, nz) {
  nz = clamp(nz, ZMIN, ZMAX);
  const wx = CAM.x + (sx - VW / 2) / CAM.z, wy = CAM.y + (sy - VH / 2) / CAM.z;
  CAM.z = nz; CAM.x = wx - (sx - VW / 2) / nz; CAM.y = wy - (sy - VH / 2) / nz;
  clampCam();
}
function sheetH() { return UI.open ? (UI.sheet.getBoundingClientRect().height || VH * 0.6) : 0; }
function focusPoint() {
  if (!UI.open) return [VW / 2, VH / 2];
  if (VW >= 860) return [(VW - 420) / 2, VH / 2];
  return [VW / 2, Math.max(120, (VH - sheetH()) / 2 + 40)];
}
function flyTo(wx, wy, z) {
  const tz = clamp(z || CAM.z, ZMIN, ZMAX), f = focusPoint();
  const tx = wx - (f[0] - VW / 2) / tz, ty = wy - (f[1] - VH / 2) / tz;
  if (REDUCED) { CAM.x = tx; CAM.y = ty; CAM.z = tz; clampCam(); return; }
  FLY = { x0: CAM.x, y0: CAM.y, z0: CAM.z, x1: tx, y1: ty, z1: tz, t: 0 };
}
function focusB(b, zoom) { flyTo(ix(b.cx, b.cy), iy(b.cx, b.cy, b.topZ * 0.45), zoom || Math.max(CAM.z, 1.25)); }
function ensureVisible(b) {
  const X = (ix(b.cx, b.cy) - CAM.x) * CAM.z + VW / 2, Y = (iy(b.cx, b.cy, b.topZ * 0.5) - CAM.y) * CAM.z + VH / 2;
  const hidden = VW >= 860 ? X > VW - 440 : Y > VH - sheetH() - 20;
  if (hidden || Y < 90) flyTo(ix(b.cx, b.cy), iy(b.cx, b.cy, b.topZ * 0.5), CAM.z);
}
function stepCamera(dt) {
  if (FLY) {
    FLY.t = Math.min(1, FLY.t + dt / 0.75);
    const t = FLY.t, e = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
    CAM.x = lerp(FLY.x0, FLY.x1, e); CAM.y = lerp(FLY.y0, FLY.y1, e); CAM.z = Math.exp(lerp(Math.log(FLY.z0), Math.log(FLY.z1), e));
    if (FLY.t >= 1) FLY = null;
    clampCam();
  } else if (FOLLOW && SEL && !PTR.size) {
    const o = selObj();
    if (o) {
      const f = focusPoint(), tx = ix(o.x, o.y) - (f[0] - VW / 2) / CAM.z, ty = iy(o.x, o.y, (o.z || 0) + 4) - (f[1] - VH / 2) / CAM.z, k = 1 - Math.exp(-dt * 3);
      CAM.x += (tx - CAM.x) * k; CAM.y += (ty - CAM.y) * k; clampCam();
    } else FOLLOW = false;
  } else if (!PTR.size && Math.abs(INERT.vx) + Math.abs(INERT.vy) > 2) {
    CAM.x += INERT.vx * dt; CAM.y += INERT.vy * dt;
    const k = Math.exp(-dt * 4.5); INERT.vx *= k; INERT.vy *= k;
    clampCam();
  }
}

/* gestures */
function pinchOf() { const [a, b] = [...PTR.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; }
function onDown(e) {
  if (CV.setPointerCapture) { try { CV.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
  PTR.set(e.pointerId, { x: e.clientX, y: e.clientY });
  FLY = null; INERT.vx = INERT.vy = 0;
  if (PTR.size === 1) TAP = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
  else { TAP = null; PINCH = pinchOf(); }
}
function onMove(e) {
  const p = PTR.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (PTR.size === 1) {
    if (TAP && !TAP.moved && Math.hypot(e.clientX - TAP.x, e.clientY - TAP.y) > 8) TAP.moved = true;
    if (!TAP || TAP.moved) {
      CAM.x -= dx / CAM.z; CAM.y -= dy / CAM.z; FOLLOW = false;
      const now = performance.now(), dtm = Math.max(8, now - LASTMV); LASTMV = now;
      INERT.vx = lerp(INERT.vx, -dx / CAM.z / dtm * 1000, 0.5); INERT.vy = lerp(INERT.vy, -dy / CAM.z / dtm * 1000, 0.5);
      clampCam();
    }
  } else if (PTR.size === 2 && PINCH) {
    const s = pinchOf();
    zoomAt(s.mx, s.my, CAM.z * s.d / PINCH.d);
    CAM.x -= (s.mx - PINCH.mx) / CAM.z; CAM.y -= (s.my - PINCH.my) / CAM.z;
    clampCam(); PINCH = s; FOLLOW = false;
  }
}
function onUp(e) {
  if (!PTR.has(e.pointerId)) return;
  PTR.delete(e.pointerId);
  if (PTR.size < 2) PINCH = null;
  if (PTR.size === 0) {
    if (TAP && !TAP.moved && performance.now() - TAP.t < 650) handleTap(e.clientX, e.clientY);
    if (performance.now() - LASTMV > 90) INERT.vx = INERT.vy = 0;
    TAP = null;
  }
}
function onWheel(e) { e.preventDefault(); FLY = null; zoomAt(e.clientX, e.clientY, CAM.z * Math.exp(-e.deltaY * 0.0016)); }
function onKey(e) {
  if (e.target && e.target.tagName === 'INPUT') { if (e.key === 'Escape') e.target.blur(); return; }
  const k = e.key, step = 80 / CAM.z;
  if (k === 'Escape') closeSheet();
  else if (k === 'ArrowLeft') CAM.x -= step;
  else if (k === 'ArrowRight') CAM.x += step;
  else if (k === 'ArrowUp') CAM.y -= step;
  else if (k === 'ArrowDown') CAM.y += step;
  else if (k === '+' || k === '=') zoomAt(VW / 2, VH / 2, CAM.z * 1.25);
  else if (k === '-') zoomAt(VW / 2, VH / 2, CAM.z / 1.25);
  else return;
  clampCam();
}

/* picking */
function handleTap(sx, sy) {
  hideToast();
  const wx = CAM.x + (sx - VW / 2) / CAM.z, wy = CAM.y + (sy - VH / 2) / CAM.z, tol = 14 / CAM.z;
  for (const p of PLANES) {
    if (p.alpha < 0.3) continue;
    if (Math.hypot(ix(p.x, p.y) - wx, iy(p.x, p.y, p.z + 4) - wy) < Math.max(20, tol)) return pickObj({ t: 'plane', id: p.id });
  }
  let best = null, bd = Math.max(8, tol * 0.7);
  for (const c of CARS) {
    if (!c.on) continue;
    const d = Math.hypot(ix(c.x, c.y) - wx, iy(c.x, c.y, 3) - wy);
    if (d < bd) { bd = d; best = { t: 'car', id: c.id }; }
  }
  BOATS.forEach((b, i) => { const d = Math.hypot(ix(b.x, b.y) - wx, iy(b.x, b.y, 7) - wy); if (d < bd + 5) { bd = d; best = { t: 'boat', id: i }; } });
  if (best) return pickObj(best);
  for (let i = STATIC.length - 1; i >= 0; i--) {
    const s = STATIC[i];
    if (s.t !== 'b') continue;
    const bb = s.b.bb;
    if (wx < bb[0] || wx > bb[2] || wy < bb[1] || wy > bb[3]) continue;
    if (inPoly(s.b.hull, wx, wy)) { FOLLOW = false; openView({ k: 'b', id: s.b.id }, true); ensureVisible(s.b); return; }
  }
  const tx = Math.floor((wx / HW + wy / HH) / 2), ty = Math.floor((wy / HH - wx / HW) / 2);
  if (inMap(tx, ty) && tileInfo(tx, ty)) { FOLLOW = false; openView({ k: 'tile', x: tx, y: ty }, true); return; }
  closeSheet();
}
function pickObj(sel) { FOLLOW = true; openView({ k: sel.t, id: sel.id }, true); }

/* sheet */
function openView(v, fresh) {
  if (fresh) UI.stack = []; else if (UI.stack.length) UI.stack[UI.stack.length - 1].scroll = UI.body.scrollTop;
  UI.stack.push(v);
  renderView();
  if (!UI.open) { UI.open = true; UI.sheet.classList.add('open'); UI.sheet.setAttribute('aria-hidden', 'false'); document.body.classList.add('sheet-open'); }
}
function goBack() { UI.stack.pop(); if (!UI.stack.length) { closeSheet(); return; } renderView(); }
function closeSheet() {
  UI.open = false; UI.stack = [];
  UI.sheet.classList.remove('open'); UI.sheet.setAttribute('aria-hidden', 'true'); document.body.classList.remove('sheet-open');
  SEL = null; FOLLOW = false;
}
function renderView() {
  const v = UI.stack[UI.stack.length - 1];
  UI.back.hidden = UI.stack.length < 2;
  UI.body.innerHTML = (VIEWS[v.k] || (() => ''))(v);
  UI.body.scrollTop = v.scroll || 0;
  UI.body.querySelectorAll('canvas[data-portrait]').forEach(cv => drawPortrait(cv, BLD[+cv.dataset.portrait]));
  if (v.k === 'b') SEL = { t: 'b', id: v.id };
  else if (v.k === 'p') SEL = { t: 'b', id: PPL[v.id].home };
  else if (v.k === 'plane' || v.k === 'car' || v.k === 'boat') SEL = { t: v.k, id: v.id };
  else if (v.k === 'tile') SEL = { t: 'tile', x: v.x, y: v.y };
  else if (v.bid != null) SEL = { t: 'b', id: v.bid };
  else SEL = null;
  UI.gver = GVER; UI.vsig = GAME_VIEWS.has(v.k) ? viewSig(v) : '';
}
function viewSig(v) {
  // a building card only redraws when something about this building or your balance changed
  if (v.k !== 'b') return String(GVER);
  let s = P(ME).bal + '|';
  for (const i of AOF[v.id] || []) for (const l of ASSETS[i].lots) s += l.id + ',' + l.o + ',' + l.ls + ',' + l.rent + ',' + l.k + ';';
  const b = BLD[v.id];
  if (b.gift) s += '|' + bizGifts(b).map(k => GS.lim[k] || 0).join(',');
  return s;
}
function rerender() {
  const v = UI.stack[UI.stack.length - 1];
  if (!v) return;
  v.scroll = UI.body.scrollTop;
  renderView();
}
function onSheetClick(e) {
  const el = e.target.closest('[data-go]');
  if (!el) return;
  e.preventDefault();
  const parts = el.dataset.go.split(':'), k = parts[0], a = parts[1], c = parts[2], v = UI.stack[UI.stack.length - 1];
  if (gameClick(k, parts, v, el)) return;
  if (k === 'b') { FOLLOW = false; openView({ k: 'b', id: +a }); focusB(BLD[+a]); }
  else if (k === 'p') { FOLLOW = false; openView({ k: 'p', id: +a }); focusB(BLD[PPL[+a].home]); }
  else if (k === 'apt') {
    if (v.k === 'b' && v.id === +a) { v.apt = +c; refreshApt(v); }
    else { FOLLOW = false; openView({ k: 'b', id: +a, apt: +c }); focusB(BLD[+a]); }
  } else if (k === 'cat') { v.cat = a || ''; refreshDir(v); }
  else if (k === 'tab') { v.tab = a; renderView(); }
  else if (k === 'view') openView(a === 'dir' ? { k: 'dir', q: '', cat: '' } : { k: a, tab: c });
  else if (k === 'all') { v.all = true; const sc = UI.body.scrollTop; renderView(); UI.body.scrollTop = sc; }
}
function onSheetInput(e) {
  if (gameInput(e)) return;
  if (e.target.id !== 'dirQ') return;
  const v = UI.stack[UI.stack.length - 1];
  v.q = e.target.value;
  const l = $('#dirList'); if (l) l.innerHTML = dirList(v);
}
function refreshDir(v) {
  const l = $('#dirList'), c = $('#dirCats');
  if (l) l.innerHTML = dirList(v);
  if (c) c.querySelectorAll('[data-go]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.go === 'cat:' + (v.cat || ''))));
}
function refreshApt(v) {
  const b = BLD[v.id], w = $('#aptWrap'), d = $('#aptDetail');
  if (w) w.innerHTML = aptGrid(b, v.apt);
  if (d) { d.innerHTML = aptDetail(b, v.apt); if (d.scrollIntoView) d.scrollIntoView({ block: 'nearest', behavior: REDUCED ? 'auto' : 'smooth' }); }
}

/* small builders */
const NFC = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
// flavour prices of the old city were in lazuriki; the game counts in coupons (1 coupon = $1)
const cz = n => { const v = n / 60; return NFC.format(v < 20 ? Math.max(0.5, Math.round(v * 2) / 2) : Math.round(v)); };
const cpn = n => `<span class="cp">${fmt(n)}<i class="cn" aria-hidden="true"></i></span>`;
const cpw = n => fmt(n) + ' ' + plural(Math.round(n), ['купон', 'купона', 'купонов']);
const fact = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
const facts = arr => `<dl class="facts">${arr.map(([k, v]) => fact(esc(k), v)).join('')}</dl>`;
const tile = (l, v, s) => `<div class="tile"><div class="lbl">${l}</div><div class="val">${v}</div><div class="sub">${s}</div></div>`;
const live = key => `<span data-live="${key}">${liveVal(key)}</span>`;
const roomsStr = n => (n === 0 ? 'студия' : n + '-комнатная');
function hoursStr(b) {
  if (!b.hours) return 'круглосуточно';
  const s = hm(b.hours[0]) + '–' + (b.hours[1] >= 1440 ? '24:00' : hm(b.hours[1]));
  if (!b.closed || !b.closed.length) return s;
  if (b.closed.length === 2) return 'по будням, ' + s;
  return s + ', кроме ' + (b.closed[0] === 1 ? 'понедельника' : 'воскресенья');
}
function plate(b) { return `<div class="plate" title="${esc(b.addr)}"><span class="plate-st">${esc(b.street)}</span><span class="plate-n">${esc(b.num)}</span></div>`; }
function heroB(b) {
  return `<div class="hero"><canvas class="portrait" data-portrait="${b.id}" aria-hidden="true"></canvas><div class="hero-t"><p class="kind">${esc(b.type || '')}</p><h2 class="title">${esc(b.name)}</h2>${plate(b)}</div></div>`;
}
function avatar(p) {
  if (p.a <= 2) return '👶';
  if (p.a <= 12) return p.g === 'f' ? '👧' : '👦';
  if (p.a >= 66) return p.g === 'f' ? '👵' : '👴';
  return p.g === 'f' ? '👩' : '👨';
}
function occText(p) {
  if (p.a <= 2) return gf('малыш|малышка', p.g);
  if (p.a <= 6) return gf('воспитанник|воспитанница', p.g) + ' детского сада';
  if (p.a <= 17) return gf('ученик|ученица', p.g) + ' ' + (p.a - 6) + ' «' + 'АБВ'[p.id % 3] + '» класса';
  if (p.st === 'ret') return gf('пенсионер|пенсионерка', p.g) + ', ' + HOBBIES[p.id % HOBBIES.length];
  if (p.st === 'stud') return gf('студент|студентка', p.g) + ' морского колледжа';
  if (p.st === 'mat') return 'в декретном отпуске';
  if (p.job >= 0) return lc1(gf(p.jt, p.g)) + ', ' + BLD[p.job].name;
  return lc1(gf(MISC_JOBS[p.id % MISC_JOBS.length], p.g));
}
function occHtml(p) {
  if (p.job >= 0) {
    const b = BLD[p.job];
    return `${esc(gf(p.jt, p.g))}, <button class="lnk" data-go="b:${b.id}">${esc(b.name)}</button>${p.co ? ', компания ' + esc(p.co) : ''}`;
  }
  if (p.a >= 7 && p.a <= 17 && SCHOOL_ID >= 0) return `${esc(cap(occText(p)))}, <button class="lnk" data-go="b:${SCHOOL_ID}">Школа № 1</button>`;
  if (p.a >= 3 && p.a <= 6 && KINDER_ID >= 0) return `${esc(cap(gf('воспитанник|воспитанница', p.g)))} <button class="lnk" data-go="b:${KINDER_ID}">детского сада «Солнышко»</button>`;
  return esc(cap(occText(p)));
}
function personRow(p, role) {
  return `<button class="prow" data-go="p:${p.id}"><span class="av" aria-hidden="true">${avatar(p)}</span><span class="pn"><b>${esc(p.f + ' ' + p.l)}</b><small>${esc(ageStr(p.a))} · ${esc(role || occText(p))}</small></span><span class="chev" aria-hidden="true">›</span></button>`;
}
function staffSec(b, v, title) {
  if (!b.jobs || !b.jobs.length) return '';
  const filled = b.jobs.filter(j => j.p != null), vac = b.jobs.filter(j => j.p == null), lim = v.all ? 9999 : 8;
  const rows = filled.slice(0, lim).map(j => personRow(PPL[j.p], lc1(gf(j.t, PPL[j.p].g)))).join('');
  const more = filled.length > lim ? `<button class="more" data-go="all">Показать всех (${filled.length})</button>` : '';
  const vt = vac.length ? `<p class="vacs"><b>${vac.length} ${plural(vac.length, ['вакансия', 'вакансии', 'вакансий'])}:</b> ${esc(uniq(vac.map(j => lc1(gf(j.t, 'm')))).slice(0, 3).join(', '))}</p>` : '';
  return `<section class="sec"><h3>${title || 'Сотрудники'} · ${filled.length}</h3>${rows}${more}${vt}</section>`;
}
function openHtml(b) {
  if (b.lc === 'none') return '<i class="dot ok"></i>Работает';
  if (!b.hours) return '<i class="dot ok"></i>Круглосуточно';
  if (OPEN[b.id]) return `<i class="dot ok"></i>Открыто до ${b.hours[1] >= 1440 ? '24:00' : hm(b.hours[1])}`;
  if (b.closed && b.closed.includes(wday())) return '<i class="dot off"></i>Сегодня выходной';
  return `<i class="dot off"></i>Закрыто, откроется в ${hm(b.hours[0])}`;
}
const chipOpen = b => `<span class="chip" data-live="open:${b.id}">${openHtml(b)}</span>`;
const gauss = (h, m, s) => Math.exp(-((h - m) ** 2) / (2 * s * s));
function visitors(b) {
  if (!OPEN[b.id]) return 0;
  const h = tod() / 60;
  const f = b.kind === 'rest' ? 0.12 + 0.55 * gauss(h, 13.5, 1.2) + 0.85 * gauss(h, 19.8, 1.5) : 0.15 + 0.55 * gauss(h, 9, 1) + 0.7 * gauss(h, 13.2, 1.1) + 0.45 * gauss(h, 18, 1.5);
  return Math.max(1, Math.round(b.seats * clamp(f + hashN(b.id, Math.floor(SIM.min / 20)) * 0.3 - 0.15, 0.05, 1)));
}
function visitorsHtml(b) {
  const n = visitors(b);
  if (!n) return 'никого: заведение закрыто';
  return `${n} из ${b.seats} мест<div class="meter" role="img" aria-label="Заполнено ${Math.round(n / b.seats * 100)}%"><i style="width:${Math.round(n / b.seats * 100)}%"></i></div>`;
}
function shopVisitors(b) {
  if (!OPEN[b.id]) return 'никого, закрыто';
  const h = tod() / 60;
  return String(Math.max(1, Math.round(2 + 16 * (0.3 + 0.7 * gauss(h, 18, 2.5)) * (0.7 + hashN(b.id, Math.floor(SIM.min / 15)) * 0.6))));
}
const countJobs = (b, re) => String(b.jobs.filter(j => re.test(j.t) && j.p != null).length);
const carsOn = () => CARS.filter(c => c.on).length;
const pedsOn = () => PEDS.filter(c => c.on).length;
function weatherStr() { const t = tempNow(); return `${t > 0 ? '+' : ''}${t}°, ветер ${fmt1(2 + 9 * windF())} м/с`; }
function matchStr() {
  const m = matchInfo(), wd = wday();
  if (m.state === 'live') return `«Волна» ${m.h}:${m.a} ${m.rival}, ${m.minute}-я минута`;
  if (m.state === 'over') return `«Волна» ${m.h}:${m.a} ${m.rival}, матч окончен`;
  if (m.state === 'soon') return `сегодня в 19:00, соперник ${m.rival}`;
  return 'следующий матч в ' + (wd < 3 ? 'среду' : 'субботу');
}
function schoolNow() {
  const t = tod(), wd = wday();
  if (wd === 0 || wd === 6) return 'выходной';
  if (t >= 480 && t < 870) return `идёт ${Math.floor((t - 480) / 55) + 1}-й урок`;
  if (t >= 870 && t < 1080) return 'кружки и продлёнка';
  return 'уроков нет';
}
function playToday() { return wday() === 1 ? 'выходной' : PLAYS[wday()]; }
function beachCount() {
  const h = tod() / 60;
  if (h < 7 || h > 21) return 3;
  return Math.round((30 + 520 * gauss(h, 14.5, 2.6)) * (tempNow() >= 20 ? 1 : 0.45));
}
function energyHtml() {
  const e = energyNow(), over = e.cons > e.prod, pct = Math.round(Math.min(1, e.cons / Math.max(e.prod, 0.1)) * 100);
  return `<div class="enr"><div class="enr-row"><span>Выработка</span><b>${fmt1(e.prod)} МВт</b></div><div class="enr-row"><span>Потребление</span><b>${fmt1(e.cons)} МВт</b></div>
  <div class="meter${over ? ' warn' : ''}" role="img" aria-label="Загрузка ${pct}%"><i style="width:${pct}%"></i></div>
  <p class="enr-note">${over ? `<span class="st warn">▲ Не хватает</span> город берёт ${fmt1(e.cons - e.prod)} МВт из общей сети` : `<span class="st ok">● Хватает</span> запас ${fmt1(e.prod - e.cons)} МВт`}</p>
  <div class="enr-src"><span><i class="sw sun"></i>Солнце ${fmt1(e.solar)} МВт</span><span><i class="sw wind"></i>Ветер ${fmt1(e.wind)} МВт</span></div></div>`;
}

/* airport */
function boardList(type) {
  const now = SIM.min, day = dayN(), out = [];
  for (let d = day - 1; d <= day + 1; d++) for (let i = 0; i < FL.length; i++) {
    const f = FL[i];
    if (f.type !== type) continue;
    const S = d * 1440 + f.t, dl = delayOf(i, d), T = S + dl;
    if (T < now - 50) continue;
    out.push({ i, f, S, T, dl });
  }
  return out.sort((a, b) => a.S - b.S);
}
function statusOf(r, type) {
  const now = SIM.min, T = r.T;
  if (type === 'd') {
    if (now >= T) return ['Вылетел', 'done'];
    if (now >= T - 15) return ['Посадка окончена', 'closed'];
    if (now >= T - 40) return ['Идёт посадка', 'go'];
    if (now >= T - 130) return ['Регистрация', 'reg'];
    return r.dl ? ['Задержан до ' + hm(T), 'bad'] : ['По расписанию', 'ok'];
  }
  if (now >= T) return ['Прибыл', 'done'];
  if (now >= T - 25) return ['Заходит на посадку', 'go'];
  return r.dl ? ['Задержан до ' + hm(T), 'bad'] : ['Ожидается', 'ok'];
}
function boardRows(type, n) {
  return boardList(type).slice(0, n || 9).map(r => {
    const [s, c] = statusOf(r, type);
    return `<div class="brow"><span class="t">${hm(r.S)}</span><span class="fl">${r.f.code}</span><span class="city">${type === 'a' && n ? 'из ' : ''}${esc(r.f.city)}</span><span class="bst ${c}">${s}</span></div>`;
  }).join('');
}
function planeStatus(p) {
  switch (p.st) {
    case 'parked': return 'Стоит у выхода № ' + (p.gate + 1);
    case 'push': return 'Буксировка от выхода';
    case 'taxiOut': return 'Рулит к полосе';
    case 'hold': return 'Ждёт разрешения на взлёт';
    case 'lineup': case 'rotate': return 'Выруливает на полосу';
    case 'roll': return p.z > 1 ? 'Набирает высоту' : 'Разбег';
    case 'approach': return 'Заходит на посадку';
    case 'rollout': return 'Пробег после посадки';
    case 'exit': case 'taxiIn': return 'Рулит к выходу';
    default: return 'Рулит в ангар';
  }
}
const planeAlt = p => (p.z > 0.5 ? fmt(p.z * 9) + ' м' : 'на земле');
const planeSpd = p => (p.st === 'parked' || p.st === 'hold' || p.st === 'rotate' ? '0 км/ч' : fmt(p.v * 62) + ' км/ч');
function crewOf(p) {
  const T = BLD[TERMINAL_ID];
  if (!T) return [];
  const pil = T.jobs.filter(j => j.p != null && j.t === 'Пилот'), att = T.jobs.filter(j => j.p != null && j.t.indexOf('Бортпроводник') === 0), out = [];
  if (pil.length) {
    const a = p.id % pil.length, b = (a + 1 + (p.id * 7) % Math.max(1, pil.length - 1)) % pil.length;
    out.push([pil[a].p, 'командир воздушного судна']);
    if (b !== a) out.push([pil[b].p, 'второй пилот']);
  }
  for (let k = 0; k < 2 && att.length; k++) { const j = att[(p.id * 5 + k * 11) % att.length]; out.push([j.p, lc1(gf(j.t, PPL[j.p].g))]); }
  return out;
}
function nextFlightStr() {
  const r = boardList('d').concat(boardList('a')).filter(q => q.T >= SIM.min).sort((x, y) => x.T - y.T)[0];
  return r ? `${r.f.code} в ${hm(r.T)}` : 'нет';
}
function driverOf(c) {
  if (c.driver >= 0) return c.driver;
  let pool;
  if (c.type === 'police') { const P = BLD.find(b => b.kind === 'police'); pool = P ? P.jobs.filter(j => j.p != null).map(j => j.p) : []; }
  if (!pool || !pool.length) pool = PPL.filter(p => p.a >= 21 && p.a <= 66 && (p.st === 'misc' || p.job >= 0)).map(p => p.id);
  c.driver = pool[Math.floor(hashN(c.id, 5) * pool.length)];
  return c.driver;
}
const carWhere = c => esc(uniq(tileStreets[idx(c.tx, c.ty)].map(k => STREETS[k].n)).join(', '));
const carSpd = c => fmt(c.v * 55) + ' км/ч';

const LIVEF = {
  beds: () => fmt(18 + Math.floor(hashN(dayN(), Math.floor(SIM.min / 60), 3) * 26)),
  docs: () => (tod() < 480 || tod() >= 1200 ? 7 : 19) + ' врачей',
  parcels: () => fmt(Math.max(0, Math.floor((tod() - 480) / 720 * 380))),
  rooms120: () => String(6 + Math.floor(hashN(dayN(), 120) * 30)),
  rooms60: () => String(2 + Math.floor(hashN(dayN(), 60) * 15)),
  water: () => Math.round(64 + 18 * Math.sin(SIM.min / 180)) + '%',
  cops: () => (tod() < 420 || tod() >= 1320 ? 9 : 16) + ' полицейских',
  tout: () => fmt1(2.5 * windF()) + ' МВт',
  windms: () => fmt1(2 + 9 * windF()) + ' м/с',
  rpm: () => fmt(4 + 12 * windF()) + ' об/мин',
  solar: () => fmt1(energyNow().solar) + ' МВт',
  match: () => esc(matchStr()),
  catch: () => (tod() < 360 ? 'лодки ещё в море' : fmt(Math.min(420, (tod() - 360) * 0.9)) + ' кг'),
  lamp: () => (LIGHT.nf > 0.3 ? 'горит' : 'включится на закате'),
  cars: () => String(carsOn()),
  peds: () => String(pedsOn()),
  wx: () => weatherStr(),
  energy: () => energyHtml(),
  beach: () => fmt(beachCount()),
  school: () => schoolNow(),
  next: () => nextFlightStr(),
  rwy: () => (runway ? 'занята' : 'свободна'),
  gates: () => String(PLANES.filter(p => p.st === 'parked').length),
  shopv: id => shopVisitors(BLD[id]),
};
function liveVal(key) {
  const i = key.indexOf(':'), k = i < 0 ? key : key.slice(0, i), a = i < 0 ? '' : key.slice(i + 1), id = +a;
  const plane = () => PLANES.find(q => q.id === id);
  switch (k) {
    case 'open': return openHtml(BLD[id]);
    case 'vis': return visitorsHtml(BLD[id]);
    case 'board': return boardRows(a[0], +a.slice(1) || 9);
    case 'clock': return hm(tod());
    case 'plst': { const p = plane(); return p ? planeStatus(p) : 'улетел'; }
    case 'alt': { const p = plane(); return p ? planeAlt(p) : 'нет данных'; }
    case 'spd': { const p = plane(); return p ? planeSpd(p) : 'нет данных'; }
    case 'car': return carWhere(CARS[id]);
    case 'cspd': return carSpd(CARS[id]);
    case 'where': return esc(whereNow(PPL[id]));
    case 'scars': return String(CARS.filter(c => c.on && tileStreets[idx(c.tx, c.ty)].includes(id)).length);
    case 'speds': return String(PEDS.filter(c => c.on && tileStreets[idx(c.tx, c.ty)].includes(id)).length);
    default: return LIVEF[k] ? LIVEF[k](id) : '';
  }
}
function liveTick() {
  updateWallet();
  if (!UI.open) return;
  if (UI.gver !== GVER) {
    UI.gver = GVER;
    const top = UI.stack[UI.stack.length - 1], ae = document.activeElement;
    if (GAME_VIEWS.has(top.k) && viewSig(top) !== UI.vsig && !(ae && ae.tagName === 'INPUT' && UI.body.contains(ae))) { rerender(); return; }
  }
  UI.body.querySelectorAll('[data-live]').forEach(el => { const s = liveVal(el.dataset.live); if (el.innerHTML !== s) el.innerHTML = s; });
}
function whereNow(p) {
  const h = tod() / 60, wd = wday(), weekday = wd >= 1 && wd <= 5;
  if (p.a <= 2) return h >= 21 || h < 7 ? 'спит' : (hashN(p.id, dayN()) < 0.5 ? 'гуляет с родителями' : 'дома');
  if (h >= 23.5 || h < 6.5) return 'спит дома';
  if (p.job >= 0) { const b = BLD[p.job]; if (OPEN[b.id] && h >= 8 && h < 18.5 && (weekday || !b.closed)) return 'на работе: ' + b.name; }
  if (p.a >= 7 && p.a <= 17 && weekday && h >= 8 && h < 14.5) return 'на уроках в школе';
  if (p.a >= 3 && p.a <= 6 && weekday && h >= 8 && h < 18) return 'в детском саду';
  const opts = ['дома', 'гуляет по набережной', 'в Приморском парке', 'на пляже', 'в магазине', 'в кафе', 'дома, смотрит кино'];
  return opts[(hashN(p.id, Math.floor(SIM.min / 90)) * opts.length) | 0];
}

/* views */
const VIEWS = {};
VIEWS.b = v => {
  const b = BLD[v.id];
  let h = heroB(b);
  if (b.kind === 'apt' || b.kind === 'aptB') h += viewApt(b, v);
  else if (b.kind === 'house') h += viewHouse(b);
  else if (b.kind === 'cafe' || b.kind === 'rest') h += viewFood(b, v);
  else if (b.kind === 'shop') h += viewShop(b, v);
  else if (b.kind === 'office') h += viewOffice(b, v);
  else h += viewPlace(b, v);
  return h;
};
function defaultApt(b) {
  const ids = AOF[b.id];
  let i = ids.findIndex(id => ASSETS[id].lots.some(l => l.o === ME));
  if (i < 0) i = ids.findIndex(id => ASSETS[id].lots.some(l => l.ls));
  if (i < 0) i = b.apts.findIndex((a, k) => a.ppl.length > 1 && !ASSETS[ids[k]].lots.length);
  return i < 0 ? 0 : i;
}
function aptState(a) {
  const l = a.lots[0];
  if (!l) return 'av';
  if (l.o === ME) return 'mine';
  return l.ls ? 'mk' : 'own';
}
const APT_ST = { av: 'продаёт платформа', mine: 'ваша', mk: 'продаёт игрок', own: 'у игрока' };
function aptGrid(b, sel) {
  let h = `<div class="aptgrid" style="--cols:${b.per}">`;
  for (let f = b.floors; f >= 1; f--) {
    h += `<span class="fl">${f}</span>`;
    for (let k = 0; k < b.per; k++) {
      const i = (f - 1) * b.per + k, a = b.apts[i], st = aptState(ASSETS[AOF[b.id][i]]);
      h += `<button class="apt ${st}${i === sel ? ' on' : ''}" data-go="apt:${b.id}:${i}" aria-label="Квартира ${a.n}, ${APT_ST[st]}">${a.n}</button>`;
    }
  }
  return h + '</div>';
}
function aptDetail(b, i) {
  const a = b.apts[i], as = ASSETS[AOF[b.id][i]];
  let h = `<div class="aptd-h"><b>${esc(as.lb)}, кв. ${a.n}</b><span>${cap(roomsStr(a.rooms))}, ${fmt1(a.area)} м², ${a.fl} этаж</span></div>`;
  h += assetBox(as);
  if (a.ppl.length) h += `<h4 class="aptd-sub">Сейчас живут</h4>` + a.ppl.map(id => personRow(PPL[id])).join('') + (a.pet ? `<p class="pet">Питомец: ${esc(a.pet)}</p>` : '');
  return h;
}
function viewApt(b, v) {
  if (v.apt == null) v.apt = defaultApt(b);
  const ids = AOF[b.id], people = b.apts.reduce((s, a) => s + a.ppl.length, 0);
  const free = ids.filter(id => !ASSETS[id].lots.length).length, mine = ids.filter(id => ASSETS[id].lots.some(l => l.o === ME)).length;
  return facts([['Квартир', String(b.apts.length)], ['Продаёт платформа', String(free)], ['У игроков', String(b.apts.length - free) + (mine ? ', ваших ' + mine : '')], ['Жильцов', String(people)]])
    + `<section class="sec"><h3>Квартиры по этажам</h3><div class="legend"><span><i class="lg av"></i>продаёт платформа</span><span><i class="lg own"></i>у игроков</span><span><i class="lg mk"></i>игрок продаёт</span><span><i class="lg mine"></i>ваши</span></div><div id="aptWrap">${aptGrid(b, v.apt)}</div></section>`
    + `<section class="sec aptd" id="aptDetail">${aptDetail(b, v.apt)}</section>`;
}
function viewHouse(b) {
  return `<section class="obj">${assetBox(ASSETS[AOF[b.id][0]])}</section>`
    + facts([['Комнат', String(b.rooms)], ['Площадь', b.area + ' м²'], ['Этажей', String(b.floors)], ['Год постройки', String(b.year)]])
    + `<section class="sec"><h3>Жильцы · ${b.ppl.length}</h3>${b.ppl.map(id => personRow(PPL[id])).join('')}</section>`
    + `<p class="desc">Во дворе: ${esc(b.garden)}.${b.pet ? ' Питомец: ' + esc(b.pet) + '.' : ''}</p>`;
}
function viewFood(b, v) {
  return `<div class="chips">${chipOpen(b)}<span class="chip">★ ${fmt1(b.rating)}</span><span class="chip">Средний чек ${cz(b.check)} куп.</span></div>`
    + bizBlock(b, v) + giftSec(b)
    + facts([['Сейчас в зале', `<span data-live="vis:${b.id}">${visitorsHtml(b)}</span>`], ['Часы работы', hoursStr(b)]])
    + (b.note ? `<p class="desc">${esc(b.note)}</p>` : '')
    + `<section class="sec"><h3>Меню</h3><ul class="menu">${b.menu.map(([n, p]) => `<li><span>${esc(n)}</span><span class="price">${cz(p)} куп.</span></li>`).join('')}</ul></section>`
    + staffSec(b, v);
}
function viewShop(b, v) {
  return `<div class="chips">${chipOpen(b)}<span class="chip">${esc(hoursStr(b))}</span></div>`
    + (b.note ? `<p class="desc">${esc(b.note)}</p>` : '')
    + bizBlock(b, v) + giftSec(b)
    + facts([['Часы работы', hoursStr(b)], ['Покупателей сейчас', live('shopv:' + b.id)]])
    + (b.goods && b.goods.length && !b.gift ? `<section class="sec"><h3>${b.cat === 'health' ? 'В наличии' : 'Цены'}</h3><ul class="menu">${b.goods.map(([n, p]) => `<li><span>${esc(n)}</span><span class="price">${cz(p)} куп.</span></li>`).join('')}</ul></section>` : '')
    + staffSec(b, v);
}
function viewOffice(b, v) {
  const emp = b.jobs.filter(j => j.p != null).length;
  let h = `<div class="chips">${chipOpen(b)}</div>` + bizBlock(b, v) + facts([['Этажей', String(b.floors)], ['Компаний', String(b.comp.length)], ['Сотрудников', String(emp)], ['Построен', b.year + ' год']]);
  h += '<section class="sec"><h3>Кто здесь работает</h3><p class="note">1 этаж: лобби и кофе-точка.</p>';
  for (const c of b.comp) {
    const ppl = c.jobs.filter(j => j.p != null);
    h += `<div class="co"><div class="co-h"><b>${esc(c.name)}</b><span>${c.from === c.to ? c.from + ' этаж' : c.from + '–' + c.to + ' этажи'}</span></div><p class="co-t">${esc(cap(c.type))}, ${ppl.length} ${plural(ppl.length, ['сотрудник', 'сотрудника', 'сотрудников'])}</p>`;
    h += ppl.slice(0, v.all ? 9999 : 3).map(j => personRow(PPL[j.p], lc1(gf(j.t, PPL[j.p].g)))).join('') + '</div>';
  }
  if (!v.all) h += '<button class="more" data-go="all">Показать всех сотрудников</button>';
  return h + '</section>';
}
const PLACE_FACTS = {
  school: b => [['Учеников', fmt(STATS.pupils)], ['Классов', '33'], ['Учителей', countJobs(b, /^Учит/)], ['Сейчас', live('school')]],
  kinder: b => [['Воспитанников', fmt(STATS.kids)], ['Групп', '6'], ['Воспитателей', countJobs(b, /^Воспит/)]],
  ferris: () => [['Высота', '32 м'], ['Кабинок', '8'], ['Один оборот', '12 минут'], ['Билет', '5 купонов']],
  radar: () => [['Дальность', '150 км'], ['Один оборот', '4 секунды']],
  tower: () => [['Высота', '46 м'], ['Ближайший рейс', live('next')], ['Полоса', live('rwy')]],
  museum: () => [['Экспонатов', '12 400'], ['Билет', '4 купона'], ['Выходной', 'понедельник']],
  theatre: () => [['Сегодня', esc(playToday())], ['Начало', '19:00'], ['Зал', '420 мест']],
  cinema: () => [['Залов', '3'], ['Мест', '640'], ['Билет', 'от 6 купонов']],
  terminal: () => [['Код', 'VCY'], ['Полоса', '2 800 м'], ['Рейсов в день', String(FL.length)], ['Самолётов у выходов', live('gates')]],
  cityhall: b => [['Сотрудников', String(b.jobs.filter(j => j.p != null).length)], ['Город основан', '1898 год'], ['Жителей', fmt(STATS.pop)], ['Бюджет', '40 млн купонов']],
  bank: () => [['Валюта', 'купоны (тестовые)'], ['Курс', '1 купон = 1 $'], ['Банкоматов в городе', '14']],
  hangar: () => [['Работает', 'круглосуточно'], ['Мест для самолётов', '2']],
  hospital: () => [['Коек', '180'], ['Свободно', live('beds')], ['На смене', live('docs')], ['Машин скорой', '4']],
  library: () => [['Книг', '48 000'], ['Читальный зал', '60 мест'], ['Выходной', 'понедельник']],
  post: b => [['Посылок сегодня', live('parcels')], ['Почтальонов', countJobs(b, /^Почтальон/)]],
  mall: () => [['Магазинов', '46'], ['Этажей', '3'], ['Парковка', '600 мест']],
  grandhotel: () => [['Номеров', '120'], ['Свободно сегодня', live('rooms120')], ['Ресторан', '«Терраса» на крыше']],
  fire: () => [['Машин', '4'], ['Катер', '1'], ['Дежурный караул', '6 человек']],
  gas: () => [['АИ-95', '1 купон/л'], ['Дизель', '1,1 купона/л'], ['Электрозарядка', '0,3 купона/кВт·ч'], ['Колонок', '4']],
  watertower: () => [['Объём бака', '800 м³'], ['Уровень воды', live('water')], ['Высота', '24 м']],
  police: () => [['Патрульных машин', '3'], ['На смене', live('cops')], ['Последний вызов', esc(cap(INCIDENTS[((dayN() % INCIDENTS.length) + INCIDENTS.length) % INCIDENTS.length]))]],
  energy: () => [['Солнечных панелей', '1 920'], ['Ветряков', '4']],
  turbine: () => [['Мощность', '2,5 МВт'], ['Выработка сейчас', live('tout')], ['Ветер', live('windms')], ['Обороты', live('rpm')]],
  stadium: () => [['Вместимость', '8 000'], ['Команда', 'ФК «Волна»'], ['Матч', live('match')]],
  hotel: () => [['Номеров', '60'], ['Свободно сегодня', live('rooms60')], ['Бассейн', 'на крыше']],
  yacht: () => [['Яхт', '6'], ['Прогулка', '25 купонов/час'], ['Улов за сегодня', live('catch')]],
  lighthouse: () => [['Высота', '28 м'], ['Дальность огня', '18 миль'], ['Огонь', live('lamp')], ['Построен', '1898']],
};
function sessionsHtml() {
  const t = tod(), day = dayN(), times = [660, 820, 980, 1140, 1290];
  return '<section class="sec"><h3>Сеансы сегодня</h3><ul class="menu">' + times.map((m, i) => {
    const f = FILMS[(day + i) % FILMS.length];
    return `<li class="${t > m + 10 ? 'past' : ''}"><span><b class="tm">${hm(m)}</b> ${esc(f[0])}</span><span class="price">${f[1]}</span></li>`;
  }).join('') + '</ul></section>';
}
const PLACE_EXTRA = {
  terminal: () => `<section class="sec"><h3>Ближайшие рейсы</h3><div class="board mini"><div data-live="board:d3">${boardRows('d', 3)}</div><div data-live="board:a3">${boardRows('a', 3)}</div></div><button class="more" data-go="view:board">Открыть табло</button></section>`,
  cinema: () => sessionsHtml(),
  mall: () => `<section class="sec"><h3>Внутри</h3><ul class="menu">${MALL_SHOPS.map(s => `<li><span>${esc(s)}</span></li>`).join('')}</ul></section>`,
  energy: () => `<section class="sec"><h3>Энергия города сейчас</h3><div data-live="energy">${energyHtml()}</div></section>`,
  cityhall: () => (MAYOR >= 0 ? `<section class="sec"><h3>Мэр города</h3>${personRow(PPL[MAYOR], 'мэр города')}</section>` : ''),
};
function viewPlace(b, v) {
  let h = `<div class="chips">${chipOpen(b)}${b.hours ? `<span class="chip">${esc(hoursStr(b))}</span>` : ''}</div>`;
  if (b.desc) h += `<p class="desc">${esc(b.desc)}</p>`;
  h += bizBlock(b, v) + giftSec(b);
  if (PLACE_FACTS[b.kind]) h += facts(PLACE_FACTS[b.kind](b));
  if (PLACE_EXTRA[b.kind]) h += PLACE_EXTRA[b.kind](b);
  return h + staffSec(b, v);
}
VIEWS.p = v => {
  const p = PPL[v.id], home = BLD[p.home], apt = p.apt >= 0 ? home.apts[p.apt] : null;
  const mates = (apt ? apt.ppl : home.ppl).filter(id => id !== p.id).map(id => PPL[id]);
  const family = mates.some(q => q.sur === p.sur), pet = apt ? apt.pet : home.pet;
  return `<div class="hero"><span class="avatar" aria-hidden="true">${avatar(p)}</span><div class="hero-t"><p class="kind">${esc(ageStr(p.a))}</p><h2 class="title">${esc(p.f + ' ' + p.l)}</h2></div></div>
  <dl class="facts one">${fact('Чем занят' + (p.g === 'f' ? 'а' : ''), occHtml(p))}${fact('Живёт', `<button class="lnk" data-go="b:${home.id}">${esc(home.addr)}${apt ? ', кв. ' + apt.n : ''}</button>`)}${fact('Сейчас', live('where:' + p.id))}</dl>
  ${mates.length ? `<section class="sec"><h3>${family ? 'Семья' : 'Соседи по квартире'}</h3>${mates.map(q => personRow(q)).join('')}</section>` : ''}
  ${pet ? `<p class="pet">Питомец: ${esc(pet)}</p>` : ''}`;
};
VIEWS.dir = v => `<div class="hero-t solo"><p class="kind">${STATS.bld} зданий · ${fmt(STATS.pop)} жителей</p><h2 class="title">Справочник города</h2></div>
  <label class="search-l" for="dirQ">Поиск по зданиям, улицам и жителям</label>
  <input id="dirQ" class="search" type="search" placeholder="Например, Пенка или Соколова" value="${esc(v.q || '')}" autocomplete="off" enterkeyhint="search">
  <div class="cats" id="dirCats">${catChips(v.cat)}</div>
  <div id="dirList">${dirList(v)}</div>`;
function catChips(cur) {
  const cnt = {};
  for (const b of BLD) cnt[b.cat] = (cnt[b.cat] || 0) + 1;
  let h = `<button data-go="cat:" aria-pressed="${!cur}">Все</button>`;
  for (const [k, n] of CATS) if (cnt[k]) h += `<button data-go="cat:${k}" aria-pressed="${cur === k}">${n}</button>`;
  return h + `<button data-go="cat:muni" aria-pressed="${cur === 'muni'}">Не продаются</button>`;
}
const CAT_ORDER = Object.fromEntries(CATS.map(([k], i) => [k, i]));
function dirRow(b) {
  const res = b.kind === 'apt' || b.kind === 'aptB';
  const title = res ? b.addr : b.name;
  const free = res ? AOF[b.id].filter(id => !ASSETS[id].lots.length).length : 0;
  const sub = res ? (b.kind === 'aptB' ? b.name + ', ' : '') + b.floors + ' эт., ' + b.apts.length + ' кв.' + (free ? ', ' + free + ' в продаже' : '') : b.type + ' · ' + b.addr;
  const st = !res && b.kind !== 'house' && b.lc !== 'none' ? (OPEN[b.id] ? '<span class="st ok">открыто</span>' : '<span class="st">закрыто</span>') : '';
  return `<button class="drow" data-go="b:${b.id}"><span class="ic" aria-hidden="true">${b.icon}</span><span class="tx"><b>${esc(title)}</b><small>${esc(sub)}</small></span>${st}</button>`;
}
function dirList(v) {
  const q = norm((v.q || '').trim());
  let items = BLD.filter(b => !v.cat || (v.cat === 'muni' ? !AOF[b.id].length : b.cat === v.cat));
  if (q) items = items.filter(b => norm(b.name + ' ' + b.addr + ' ' + (b.type || '')).includes(q));
  items.sort((a, b) => (CAT_ORDER[a.cat] ?? 99) - (CAT_ORDER[b.cat] ?? 99) || (a.cat === 'home' ? 0 : a.name.localeCompare(b.name, 'ru')) || a.addr.localeCompare(b.addr, 'ru', { numeric: true }));
  let h = items.map(dirRow).join('');
  if (q.length >= 2) {
    const ppl = PPL.filter(p => norm(p.f + ' ' + p.l).includes(q)).slice(0, 30);
    if (ppl.length) h += '<h3 class="dir-h">Жители</h3>' + ppl.map(p => personRow(p)).join('');
  }
  return h || '<p class="empty">Ничего не нашлось. Попробуйте название кафе, улицу или имя жителя.</p>';
}
VIEWS.board = v => {
  v.tab = v.tab || 'd';
  return `<div class="hero-t solo"><p class="kind">Аэропорт Virtual City · VCY</p><h2 class="title">Табло рейсов</h2></div>
  <div class="board">
    <div class="btabs" role="tablist"><button role="tab" aria-selected="${v.tab === 'd'}" data-go="tab:d">Вылет</button><button role="tab" aria-selected="${v.tab === 'a'}" data-go="tab:a">Прилёт</button></div>
    <div class="board-now">Местное время <b data-live="clock">${hm(tod())}</b></div>
    <div class="brow head"><span>Время</span><span>Рейс</span><span>${v.tab === 'd' ? 'Куда' : 'Откуда'}</span><span>Статус</span></div>
    <div data-live="board:${v.tab}">${boardRows(v.tab)}</div>
  </div>
  <p class="note">Рейсы на табло летают по-настоящему: самолёт выруливает, взлетает и садится на полосу по расписанию. Нажмите на самолёт на карте, чтобы узнать рейс и экипаж.</p>`;
};
VIEWS.plane = v => {
  const p = PLANES.find(q => q.id === v.id);
  if (!p) return '<p class="desc">Этот самолёт уже улетел за горизонт.</p>';
  const f = p.fi != null ? FL[p.fi] : null, A = AIRLINE[p.al];
  const route = f ? (f.type === 'd' ? 'Virtual City → ' + f.city : f.city + ' → Virtual City') : 'ждёт следующего рейса';
  return `<div class="hero"><div class="badge" style="--tint:${A.tail}" aria-hidden="true">✈</div><div class="hero-t"><p class="kind">${esc(A.name)} · ${esc(p.ac)}</p><h2 class="title">${f ? f.code : 'Самолёт у терминала'}</h2><p class="route">${esc(route)}</p></div></div>`
    + facts([['Статус', live('plst:' + p.id)], ['Высота', live('alt:' + p.id)], ['Скорость', live('spd:' + p.id)], ['Пассажиров', f ? String(70 + Math.floor(hashN(p.id, 3) * 96)) : '0']])
    + `<section class="sec"><h3>Экипаж</h3>${crewOf(p).map(([pid, role]) => personRow(PPL[pid], role)).join('')}</section>`;
};
VIEWS.car = v => {
  const c = CARS[v.id];
  const title = c.type === 'bus' ? 'Автобус № ' + c.route : c.type === 'taxi' ? 'Такси «Лазурь»' : c.type === 'police' ? 'Патрульная машина' : 'Автомобиль';
  const icon = c.type === 'bus' ? '🚌' : c.type === 'police' ? '🚓' : c.type === 'taxi' ? '🚕' : '🚗';
  const d = PPL[driverOf(c)];
  const role = c.type === 'bus' ? 'водитель автобуса' : c.type === 'taxi' ? 'таксист' : c.type === 'police' ? lc1(gf(d.jt || 'Полицейский', d.g)) : occText(d);
  return `<div class="hero"><div class="badge" style="--tint:${c.col.c}" aria-hidden="true">${icon}</div><div class="hero-t"><p class="kind">${c.type === 'bus' ? 'Городской маршрут' : 'На дороге'}</p><h2 class="title">${title}</h2></div></div>`
    + facts([['Едет по', live('car:' + c.id)], ['Скорость', live('cspd:' + c.id)]])
    + `<section class="sec"><h3>За рулём</h3>${personRow(d, role)}</section>`;
};
VIEWS.boat = v => {
  const b = BOATS[v.id], Y = BLD.find(x => x.kind === 'yacht');
  const crew = Y ? Y.jobs.filter(j => j.p != null && /^(Капитан|Инструктор)/.test(j.t)) : [];
  const cj = crew.length ? crew[v.id % crew.length] : null;
  return `<div class="hero"><div class="badge" style="--tint:#14a3b8" aria-hidden="true">⛵</div><div class="hero-t"><p class="kind">Яхт-клуб «Парус»</p><h2 class="title">${esc(b.name)}</h2></div></div>`
    + facts([['Сейчас', b.dock ? 'стоит у пирса' : 'идёт вдоль берега'], ['Длина', b.sail ? '9 м' : '7 м'], ['На борту', b.dock ? 'никого' : (2 + v.id % 5) + ' человека']])
    + (cj ? `<section class="sec"><h3>Капитан</h3>${personRow(PPL[cj.p], lc1(gf(cj.t, PPL[cj.p].g)))}</section>` : '');
};
function tileInfo(x, y) {
  const i = idx(x, y), t = ground[i];
  if (t === TT.ROAD || t === TT.BRIDGE) {
    const si = tileStreets[i], names = uniq(si.map(k => STREETS[k].n));
    return { icon: '🛣', tint: '#5c6370', title: names.join(' и '), kind: t === TT.BRIDGE ? 'Мост через реку Лазурку' : names.length > 1 ? 'Перекрёсток' : 'Улица',
      facts: [['Машин на улице', live('scars:' + si[0])], ['Пешеходов', live('speds:' + si[0])]] };
  }
  if (t === TT.WATER || t === TT.PIER) {
    if (x >= 12 && x <= 15 && y <= 3) return { icon: '🦆', tint: '#43b2c6', title: 'Пруд', kind: 'Приморский парк', desc: 'Здесь живут утки и два лебедя. Зимой пруд заливают под каток.' };
    if (x >= 9 && x <= 10 && y <= 23) return { icon: '🌊', tint: '#43b2c6', title: 'Река Лазурка', kind: 'Река', desc: 'Течёт с гор через весь город и впадает в Лазурное море. Через неё перекинуты три моста.', facts: [['Мостов', '3'], ['Вода', '+17 °C']] };
    return { icon: '🌊', tint: '#2c98b9', title: 'Лазурное море', kind: 'Море', desc: 'Тёплое и спокойное. С пирса уходят прогулочные яхты, а рыбаки возвращаются к утру.', facts: [['Вода', '+21 °C'], ['Яхт в море', String(BOATS.filter(b => !b.dock).length)]] };
  }
  if (t === TT.SAND) return { icon: '🏖', tint: '#e0b04a', title: 'Городской пляж', kind: 'Песчаный пляж', facts: [['Отдыхающих', live('beach')], ['Вода', '+21 °C'], ['Спасательных вышек', '3']] };
  if (t === TT.PARK) return { icon: '🌳', tint: '#4f9a45', title: 'Приморский парк', kind: 'Парк', desc: 'Аллеи, пруд с утками, колесо обозрения и чайная «Сова».', facts: [['Площадь', '12 га'], ['Скамеек', String(STATIC.filter(s => s.t === 'bench' && s.y < 4).length)]] };
  if (t === TT.TREES) return { icon: '🌲', tint: '#3f8f5a', title: 'Сквер', kind: 'Зелёная зона', desc: 'Тенистые деревья, тропинки и белки.' };
  if (t === TT.PLAZA && x >= 14 && x <= 16 && y >= 8 && y <= 9) return { icon: '⛲', tint: '#14a3b8', title: 'Центральная площадь', kind: 'Площадь у мэрии', desc: 'Фонтан, часы на башне мэрии и грузинский ресторан через дорогу.' };
  if (t === TT.COURT) return { icon: '🛝', tint: '#d98a63', title: 'Двор', kind: 'Детская площадка', desc: 'Качели, горка, песочница и лавочки.' };
  if (t === TT.PARKING) return { icon: '🅿', tint: '#5c6370', title: 'Парковка', kind: 'Стоянка', facts: [['Мест', '8'], ['Занято', String(STATIC.filter(s => s.t === 'pcar' && Math.floor(s.x) === x && Math.floor(s.y) === y).length)]] };
  if (t === TT.FIELD) return { icon: '⚽', tint: '#4f9a45', title: 'Школьное поле', kind: 'Футбольное поле', desc: 'После уроков здесь играют в футбол, а по выходным тренируется детская команда «Волны».' };
  if (t === TT.SOLAR) return { icon: '☀', tint: '#f2b705', title: 'Солнечное поле', kind: 'Энергоцентр', facts: [['Панелей', '1 920'], ['Выработка сейчас', live('solar')]] };
  if (t === TT.RUNWAY) return { icon: '🛫', tint: '#14a3b8', title: 'Взлётная полоса', kind: 'Аэропорт Virtual City', facts: [['Длина', '2 800 м'], ['Сейчас', live('rwy')]] };
  if (t === TT.APRON) return { icon: '✈', tint: '#14a3b8', title: 'Перрон', kind: 'Аэропорт Virtual City', facts: [['Выходов', '3'], ['Самолётов у выходов', live('gates')]] };
  return null;
}
VIEWS.tile = v => {
  const T = tileInfo(v.x, v.y);
  if (!T) return '';
  return `<div class="hero"><div class="badge" style="--tint:${T.tint}" aria-hidden="true">${T.icon}</div><div class="hero-t"><p class="kind">${esc(T.kind)}</p><h2 class="title">${esc(T.title)}</h2></div></div>`
    + (T.desc ? `<p class="desc">${esc(T.desc)}</p>` : '') + (T.facts ? facts(T.facts) : '');
};

/* main loop and boot */
const PERF = { ema: 16, t: 0 };
function loop(now) {
  const raw = now - LAST, dt = Math.min(0.05, Math.max(0, raw / 1000));
  LAST = now;
  if (raw > 0 && raw < 250) {
    // if frames are slow, render at a lower pixel density
    PERF.ema = lerp(PERF.ema, raw, 0.04); PERF.t += raw;
    if (PERF.t > 3000) { PERF.t = 0; if (PERF.ema > 30 && DPR > 1.25) { QDPR = Math.max(1.25, DPR - 0.25); resize(); } }
  }
  stepCamera(dt);
  update(dt);
  gameTick(raw > 0 && raw < 1000 ? raw / 1000 : 0);
  render();
  updateHUD();
  requestAnimationFrame(loop);
}
function start() {
  const now = new Date();
  SIM.wd0 = now.getDay();
  SIM.min = now.getHours() * 60 + now.getMinutes();
  genWorld();
  OPEN = new Uint8Array(BLD.length);
  for (const b of BLD) if (b.comp) for (const c of b.comp) for (const j of c.jobs) if (j.p != null) PPL[j.p].co = c.name;
  initGame();
  buildGround();
  initAgents();
  initCanvas();
  initUI();
  CAM.z = VW < 700 ? 0.62 : clamp(Math.min(VW / 1500, VH / 820), 0.5, 1.1);
  CAM.x = ix(14.5, 11); CAM.y = iy(14.5, 11, 20);
  clampCam();
  computeLight(); updateHourly();
  if (LIGHT.sa > 0) buildShadows(LIGHT.sdx, LIGHT.sdy);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { for (const L of LABELS) L.w = 0; for (const b of BLD) { if (b.sgn) b.sgn.fs = 0; if (b.lab) b.lab.w = 0; } });
  window.__city = {
    setTime: m => { SIM.min = Math.floor(SIM.min / 1440) * 1440 + m; HUD_MIN = -1; },
    open: (k, id) => openView(k === 'b' ? { k, id } : { k, id, q: '', cat: '' }, true),
    find: s => BLD.filter(b => b.name.includes(s) || b.kind === s).map(b => b.id),
    cam: CAM, sim: SIM, stats: STATS, planes: PLANES, game: () => GS, assets: ASSETS, aof: AOF, skip: skipDays, bot: botAct,
  };
  setTimeout(() => {
    if (CLOUD.loaded) return;
    if (FRESH) note('Добро пожаловать в Virtual City', 'У вас ' + fmt(ECON.start) + ' тестовых купонов. Нажмите на любой дом, кафе или аэропорт', 'ok');
    else note('С возвращением!', 'В игре ' + dFull(today()) + '. На счёте ' + cpw(P(ME).bal), 'ok');
  }, 1400);
  requestAnimationFrame(t => { LAST = t; loop(t); });
}
