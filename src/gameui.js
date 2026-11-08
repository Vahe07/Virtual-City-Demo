/* gameui.js — screens of the demo economy: cabinet, market, rich list, feed, object blocks, gifts, notifications */
const GAME_VIEWS = new Set(['me', 'market', 'rich', 'feed', 'player', 'b', 'gift', 'mygift', 'sell', 'city']);
let WAL = -1;

/* ---------- small pieces ---------- */
const pct = r => NFC.format(Math.round(r * 1000) / 10) + '%';
function initials(p) { if (p.id === ME) return '★'; const w = p.name.replace('.', '').split(' '); return (w[0][0] + (w[1] ? w[1][0] : '')).toUpperCase(); }
const pav = p => `<span class="pav${p.id === ME ? ' me' : ''}" style="--c:${p.col}" aria-hidden="true">${esc(initials(p))}</span>`;
const pTag = p => (p.id === ME ? '<span class="nm"><b>Вы</b></span>' : `<span class="nm"><b>${esc(p.name)}</b> <span class="flag">${p.flag}</span></span>`);
function whenStr(d, mi) { const t = today(); return (d === t ? 'сегодня' : d === t - 1 ? 'вчера' : dShort(d)) + (mi != null ? ', ' + hm(mi) : ''); }
function lotLine(l) { const a = ASSETS[l.a]; return (l.sh < 100 ? 'доля ' + l.sh + '% · ' : '') + aAddr(a); }
const ACC = { 'Квартира': 'квартиру', 'Элитная квартира': 'элитную квартиру', 'Пентхаус': 'пентхаус', 'Частный дом': 'частный дом', 'Вилла': 'виллу' };
function assetPhrase(a, sh) {
  if (a.kind === 'flat') return ACC[a.lb] + ' (кв. ' + aApt(a).n + ', ' + BLD[a.b].addr + ')';
  if (a.kind === 'house') return ACC[a.lb] + ' (' + BLD[a.b].addr + ')';
  return sh < 100 ? 'долю ' + sh + '% (' + BLD[a.b].name + ')' : BLD[a.b].name;
}
function btn(go, label, opts) {
  opts = opts || {};
  return `<button class="btn${opts.cls ? ' ' + opts.cls : ''}" data-go="${go}"${opts.dis ? ' disabled' : ''}>${label}</button>`;
}
function payBtn(go, label, price) {
  const ok = P(ME).bal >= price;
  return btn(go, label, { dis: !ok }) + (ok ? '' : `<p class="lack">Не хватает ${cpw(price - P(ME).bal)}. <button class="lnk" data-go="topup">Пополнить тестовыми купонами</button></p>`);
}
function playerPick(v, exclude, withMe) {
  const list = GS.pl.filter(p => p.id !== exclude && (withMe || p.id !== ME));
  return `<div class="ppick" role="radiogroup">${list.map(p => `<button class="pchip${v.to === p.id ? ' on' : ''}" role="radio" aria-checked="${v.to === p.id}" data-go="to:${p.id}">${pav(p)}<span>${p.id === ME ? 'Себе' : esc(p.name) + ' ' + p.flag}</span></button>`).join('')}</div>`;
}
const pubToggle = v => `<button class="check" role="switch" aria-checked="${!!v.pub}" data-go="pub"><i></i>Показать в ленте города</button>`;
function scheduleNote(a, l) {
  const y = n => fmt1(n / 12).replace(',0', '');
  const first = l ? dMid(addMonths(l.iss, 1)) : dMid(addMonths(today(), 1));
  return `<p class="sched">Начисления раз в месяц по дате покупки у платформы${l ? '' : ' (первое — ' + first + ')'}: ${a.s1} мес. до окупаемости 100% (≈ ${y(a.s1)} года), затем ${a.s2 - a.s1} мес. ещё +50%, дальше остаточные ${pct(a.rate * ECON.resid)} годовых. При перепродаже график продолжается.</p>`;
}
function stageStr(a, l) {
  if (l.k < a.s1) return 'окупаемость: ' + l.k + ' из ' + a.s1 + ' мес.';
  if (l.k < a.s2) return 'дополнительный период: ' + (l.k - a.s1) + ' из ' + (a.s2 - a.s1) + ' мес.';
  return 'остаточные начисления';
}

/* ---------- notifications and HUD ---------- */
function note(title, sub, kind, bid) {
  const box = $('#notes');
  if (!box) return;
  const el = document.createElement('button');
  el.type = 'button'; el.className = 'ntf ' + (kind || '');
  el.innerHTML = `<b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}`;
  el.addEventListener('click', () => {
    el.remove();
    if (kind === 'acc' || kind === 'biz') openView({ k: 'me' }, true);
    else if (bid != null && bid >= 0) { openView({ k: 'b', id: bid }, true); focusB(BLD[bid]); }
  });
  box.prepend(el);
  while (box.children.length > 3) box.lastChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, kind === 'err' ? 3500 : 6000);
}
function updateWallet() {
  if (!GS) return;
  const b = P(ME).bal, el = $('#walBal');
  if (b === WAL || !el) return;
  if (WAL >= 0 && b > WAL) { const w = $('#wallet'); w.classList.remove('up'); void w.offsetWidth; w.classList.add('up'); }
  WAL = b; el.textContent = fmt(b);
}
function setOwnView(on) {
  OWNVIEW = !!on; SAVE_T = 1; markDirty(false);
  const bt = $('#btnOwn');
  if (bt) bt.setAttribute('aria-pressed', String(OWNVIEW));
  document.body.classList.toggle('own-on', OWNVIEW);
}

/* ---------- object blocks inside building cards ---------- */
function myLotBox(l) {
  const a = ASSETS[l.a], resid = a.kind !== 'biz', due = nextDue(l), amt = lotPay(l, l.k + 1);
  let h = '';
  if (resid) h += `<div class="rent"><div><b>Сдать в аренду</b><small>${l.rent ? 'Сдана: ' + cpw(amt) + ' придут ' + dMid(due) : 'Не сдана: пока начислений нет'}</small></div><button class="switch" role="switch" aria-checked="${l.rent}" aria-label="Сдать в аренду" data-go="rent:${l.id}"><i></i></button></div>`;
  h += facts([['Куплено у платформы', dFull(l.iss)], ['Вы заплатили', cpn(l.cost)], ['Следующее начисление', earns(l) ? dMid(due) + ' · ' + cpn(amt) : 'после сдачи в аренду'], ['Этап', stageStr(a, l)]]);
  if (l.ls) h += `<div class="listed">Выставлено на продажу за ${cpn(l.ls)}${btn('delist:' + l.id, 'Снять с продажи', { cls: 'ghost sm' })}</div>`;
  else h += btn('sellv:' + l.id, 'Продать или подарить', { cls: 'ghost' });
  return h;
}
function assetBox(a) {
  const l = a.lots[0];
  const st = !l ? ['av', 'Продаёт платформа'] : l.o === ME ? ['mine', 'Ваша собственность'] : l.ls ? ['mk', 'Продаёт игрок'] : ['own', 'У игрока'];
  let h = `<div class="obj-h"><span class="code">№ ${a.code}</span><span class="tag ${st[0]}">${st[1]}</span></div>`;
  h += facts([['Цена', cpn(l && l.o !== ME && l.ls ? l.ls : a.price)], ['Доход в месяц', cpn(a.m)], ['Доходность', pct(a.rate) + ' годовых'], ['Окупаемость', '≈ ' + a.s1 + ' мес.']]);
  if (!l) h += payBtn('buy:' + a.id + ':100', 'Купить за ' + fmt(a.price), a.price);
  else if (l.o === ME) h += myLotBox(l);
  else {
    const o = P(l.o);
    h += `<button class="owner" data-go="player:${o.id}">${pav(o)}<span class="tx">${pTag(o)}<small>владеет с ${dMid(l.iss)} · ${earns(l) ? 'сдаёт в аренду' : 'не сдаёт'}</small></span><span class="chev" aria-hidden="true">›</span></button>`;
    if (l.ls) h += `<p class="offer">Продаёт за ${cpn(l.ls)} <span class="vs">${dev(l.ls, a.price)}</span></p>` + payBtn('mbuy:' + l.id, 'Купить у игрока за ' + fmt(l.ls), l.ls);
  }
  return h + scheduleNote(a, l);
}
function dev(price, base, short) { const d = Math.round((price / base - 1) * 100); return d === 0 ? 'как у платформы' : (d > 0 ? '+' : '−') + Math.abs(d) + (short ? '%' : '% к цене платформы'); }
function bizBlock(b, v) {
  const a = bizAsset(b.id);
  if (!a) return MUNI.has(b.kind) ? `<section class="obj muni"><div class="obj-h"><span class="tag">Городская собственность</span></div><p class="own-l">Этот объект принадлежит городу и не продаётся.</p></section>` : '';
  const av = avail(a), mine = a.lots.filter(l => l.o === ME);
  if (v.sh == null || v.sh > av || v.sh < a.min) v.sh = Math.min(av, a.min);
  let h = `<section class="obj"><div class="obj-h"><span class="code">№ ${a.code}</span><span class="tag ${mine.length ? 'mine' : av >= a.min ? 'av' : 'own'}">${a.min < 100 ? 'Доли от ' + a.min + '%' : 'Целиком'}</span></div>`;
  h += facts([['Стоимость 100%', cpn(a.price)], ['Доход в месяц, 100%', cpn(a.m)], ['Доходность', pct(a.rate) + ' годовых'], ['Окупаемость', '≈ ' + a.s1 + ' мес.']]);
  // who owns what
  const by = new Map();
  for (const l of a.lots) by.set(l.o, (by.get(l.o) || 0) + l.sh);
  const owners = [...by.entries()].sort((x, y) => (x[0] === ME ? -1 : y[0] === ME ? 1 : y[1] - x[1]));
  h += `<div class="sharebar" role="img" aria-label="У игроков ${100 - av}%, у платформы ${av}%">${owners.map(([pid, sh]) => `<i style="width:${sh}%;background:${P(pid).col}"></i>`).join('')}</div>`;
  h += `<div class="sharelg"><span>У игроков ${100 - av}%</span><span>Платформа продаёт ${av}%</span></div>`;
  if (owners.length) h += '<div class="owners">' + owners.slice(0, v.all ? 99 : 6).map(([pid, sh]) => {
    const o = P(pid);
    return `<button class="owner" data-go="player:${pid}">${pav(o)}<span class="tx">${pTag(o)}<small>${cpw(Math.round(a.m * sh / 100))} в месяц</small></span><span class="sh">${sh}%</span></button>`;
  }).join('') + '</div>';
  // your lots
  for (const l of mine) h += `<div class="mylot"><h4>Ваша доля ${l.sh}%</h4>${myLotBox(l)}</div>`;
  // offers from other players
  const offers = a.lots.filter(l => l.ls && l.o !== ME).sort((x, y) => x.ls / x.sh - y.ls / y.sh);
  if (offers.length) h += '<h4 class="obj-sub">Игроки продают</h4>' + offers.map(l => `<div class="offrow">${pav(P(l.o))}<span class="tx"><b>${l.sh}% за ${fmt(l.ls)}</b><small>${esc(P(l.o).name)} · ${dev(l.ls, shareCost(a, l.sh))}</small></span>${btn('mbuy:' + l.id, 'Купить', { cls: 'sm', dis: P(ME).bal < l.ls })}</div>`).join('');
  // buy from the platform
  if (av >= a.min) {
    const cost = shareCost(a, v.sh);
    h += `<div class="buybox"><h4 class="obj-sub">Купить долю у платформы</h4>
      <div class="stepper"><button class="stp" data-go="step:-1" aria-label="Меньше"${v.sh <= a.min ? ' disabled' : ''}>−</button><span class="stv"><b>${v.sh}%</b><small>${cpw(Math.round(a.m * v.sh / 100))} в месяц</small></span><button class="stp" data-go="step:1" aria-label="Больше"${v.sh + a.min > av ? ' disabled' : ''}>+</button></div>
      ${payBtn('buy:' + a.id + ':' + v.sh, 'Купить ' + v.sh + '% за ' + fmt(cost), cost)}</div>`;
  } else h += '<p class="own-l">Платформа продала все доли. Купить можно только у игроков.</p>';
  return h + scheduleNote(a, null) + '</section>';
}
function giftSec(b) {
  const keys = bizGifts(b);
  if (!keys.length) return '';
  const a = bizAsset(b.id);
  return `<section class="sec"><h3>Подарки и услуги</h3>${keys.map(k => {
    const g = GCAT[k], left = g.lim ? g.lim - (GS.lim[k] || 0) : 0;
    const sub = g.lim ? (left > 0 ? `Лимит ${g.lim} шт. · осталось ${left}` : `Все ${g.lim} шт. проданы`) : 'Подарить игроку или купить себе';
    return `<button class="grow" data-go="gift:${k}:${b.id}"><span class="gi" aria-hidden="true">${g.ic}</span><span class="tx"><b>${esc(g.name)}</b><small>${sub}</small></span>${g.lim ? '<span class="lim">лимит</span>' : ''}<span class="price">${cpn(gPrice(k, b))}</span></button>`;
  }).join('')}<p class="note">${a ? 'Половина каждой покупки сразу уходит владельцам «' + esc(b.short || b.name) + '» по их долям, половина — платформе.' : ''}</p></section>`;
}

/* ---------- views ---------- */
VIEWS.me = v => {
  const p = P(ME), s = pStats(ME), rank = richList().findIndex(x => x.p.id === ME) + 1;
  const lots = myLots(ME), gifts = GS.gifts.filter(g => g.o === ME);
  const upcoming = lots.filter(earns).map(l => [nextDue(l), lotPay(l, l.k + 1)]).sort((x, y) => x[0] - y[0]);
  const nx = upcoming.length ? upcoming.filter(u => u[0] === upcoming[0][0]).reduce((s2, u) => s2 + u[1], 0) : 0;
  let h = `<div class="hero"><span class="avatar pbig" style="--c:${p.col}" aria-hidden="true">★</span><div class="hero-t"><p class="kind">Демо-счёт · тестовые купоны</p><h2 class="title">Мой кабинет</h2><p class="route">${rank}-е место в рейтинге из ${GS.pl.length}</p></div></div>`;
  h += `<div class="balance"><span class="lbl">Свободные купоны</span><span class="big">${cpn(p.bal)}</span><div class="row">${btn('topup', '+ ' + fmt(ECON.topup) + ' тестовых', { cls: 'sm' })}${btn('nowd', 'Вывести', { cls: 'sm ghost', dis: true })}</div><p class="note">1 купон = 1 $. В демо купоны тестовые, вывод отключён. Имущество не выводится, пока его не продали.</p></div>`;
  h += `<div class="tiles">${tile('Имущество', fmt(s.value), s.n + ' ' + plural(s.n, ['объект', 'объекта', 'объектов']) + ' и долей')}${tile('Доход в месяц', fmt(s.monthly + s.biz), 'фиксированный ' + fmt(s.monthly) + (s.biz ? ', с покупок ' + fmt(s.biz) : ''))}${tile('Заработано', fmt(s.earned), 'за всё время')}${tile('Подарки', String(s.gifts), s.gifts ? 'в вашей коллекции' : 'пока нет')}</div>`;
  h += `<section class="sec"><h3>Время в игре</h3><div class="timebox"><p>Сегодня <b>${dFull(today())}</b>${upcoming.length ? `. Ближайшее начисление <b>${dMid(upcoming[0][0])}</b>: ${cpn(nx)}` : ''}</p><div class="row">${btn('skip:d', '⏩ +1 день', { cls: 'sm ghost' })}${btn('skip:m', '⏩ +1 месяц', { cls: 'sm ghost' })}</div><p class="note">В городе время течёт само (кнопки 1×, 10×, 60× вверху). Чтобы увидеть начисления быстрее, перемотайте.</p></div></section>`;
  h += `<section class="sec"><h3>Мои объекты · ${lots.length}</h3>`;
  if (!lots.length) h += `<p class="empty">Пока ничего. Нажмите на любой дом на карте или откройте ${btn('view:market', 'Рынок', { cls: 'lnkb' })}.</p>`;
  h += lots.sort((x, y) => y.cost - x.cost).map(l => {
    const a = ASSETS[l.a];
    const chips = (a.kind !== 'biz' ? `<span class="pill ${l.rent ? 'ok' : 'warn'}">${l.rent ? 'сдана' : 'не сдана'}</span>` : '') + (l.ls ? `<span class="pill mk">продаётся</span>` : '');
    return `<button class="drow" data-go="lot:${l.id}"><span class="ic" aria-hidden="true">${a.ic}</span><span class="tx"><b>${esc(aTitle(a))}</b><small>${esc(lotLine(l))} · ${earns(l) ? cpw(lotPay(l, l.k + 1)) + '/мес' : 'без дохода'}</small></span><span class="pills">${chips}</span></button>`;
  }).join('') + '</section>';
  if (gifts.length) h += `<section class="sec"><h3>Мои подарки · ${gifts.length}</h3>${gifts.map(giftRow).join('')}</section>`;
  h += `<section class="sec"><h3>История</h3>${GS.hist.length ? GS.hist.slice(0, v.all ? 220 : 25).map(e => `<div class="hrow"><span class="tx"><b>${esc(e.txt)}</b><small>${whenStr(e.d, e.mi)}</small></span><span class="amt ${e.amt > 0 ? 'pos' : e.amt < 0 ? 'neg' : ''}">${e.amt ? (e.amt > 0 ? '+' : '−') + fmt(Math.abs(e.amt)) : ''}</span></div>`).join('') : '<p class="empty">Здесь появятся покупки, начисления и продажи.</p>'}${!v.all && GS.hist.length > 25 ? '<button class="more" data-go="all">Показать всю историю</button>' : ''}</section>`;
  h += `<section class="sec">${v.reset ? `<p class="note">Все покупки, купоны и история удалятся, город начнётся заново.</p><div class="row">${btn('reset2', 'Да, начать заново', { cls: 'sm danger' })}${btn('reset0', 'Отмена', { cls: 'sm ghost' })}</div>` : btn('reset', 'Начать демо заново', { cls: 'ghost sm' })}</section>`;
  return h;
};
function giftRow(g) {
  const c = GCAT[g.key], from = P(g.fr);
  const sub = (g.fr === g.o ? 'куплен' + (g.o === ME ? '' : 'о') : 'от ' + pName(from)) + ' · ' + dShort(g.d) + (g.ed ? ' · № ' + g.ed + ' из ' + c.lim : '');
  return `<button class="drow" data-go="mygift:${g.id}"><span class="ic" aria-hidden="true">${c.ic}</span><span class="tx"><b>${esc(c.name)}</b><small>${esc(sub)}</small></span>${g.ls ? `<span class="pill mk">${fmt(g.ls)}</span>` : `<span class="price">${cpn(g.orig)}</span>`}</button>`;
}

VIEWS.market = v => {
  v.tab = v.tab || 'pl'; v.n = v.n || 40;
  const tabs = [['pl', 'У игроков'], ['plat', 'У платформы'], ['gifts', 'Подарки']];
  let h = `<div class="hero-t solo"><p class="kind">Покупка, продажа, доли · комиссия платформы ${Math.round(ECON.fee * 100)}% с продавца</p><h2 class="title">Рынок</h2></div>`;
  h += `<div class="tabs" role="tablist">${tabs.map(([k, n]) => `<button role="tab" aria-selected="${v.tab === k}" data-go="mtab:${k}">${n}</button>`).join('')}</div>`;
  if (v.tab === 'pl') {
    const mine = GS.lots.filter(l => l.ls && l.o === ME);
    if (mine.length) h += `<h3 class="dir-h">Ваши предложения</h3>` + mine.map(l => lotRow(l)).join('');
    const offers = GS.lots.filter(l => l.ls && l.o !== ME).sort((x, y) => x.ls / shareCost(ASSETS[x.a], x.sh) - y.ls / shareCost(ASSETS[y.a], y.sh));
    h += `<h3 class="dir-h">Объекты и доли · ${offers.length}</h3>` + (offers.length ? offers.map(l => lotRow(l)).join('') : '<p class="empty">Сейчас никто не продаёт.</p>');
    h += '<p class="note">Процент — разница с ценой платформы. Сверху самые выгодные. График начислений переходит к покупателю вместе с объектом.</p>';
  } else if (v.tab === 'plat') {
    const fs = [['flat', 'Квартиры'], ['elite', 'Элитные и пентхаусы'], ['house', 'Дома и виллы'], ['biz', 'Бизнес'], ['big', 'Крупные объекты']];
    v.f = v.f || 'flat';
    h += `<div class="cats">${fs.map(([k, n]) => `<button data-go="mf:${k}" aria-pressed="${v.f === k}">${n}</button>`).join('')}</div>`;
    const ok = a => avail(a) >= a.min && (v.f === 'flat' ? a.kind === 'flat' && a.lb === 'Квартира' : v.f === 'elite' ? a.kind === 'flat' && a.lb !== 'Квартира'
      : v.f === 'house' ? a.kind === 'house' : v.f === 'biz' ? a.kind === 'biz' && a.price < 1000000 : a.kind === 'biz' && a.price >= 1000000);
    const list = ASSETS.filter(ok).sort((x, y) => shareCost(x, x.min) - shareCost(y, y.min));
    h += `<p class="note">${list.length} ${plural(list.length, ['объект', 'объекта', 'объектов'])} в продаже. Сначала дешёвые.</p>`;
    h += list.slice(0, v.n).map(a => `<button class="drow" data-go="asset:${a.id}"><span class="ic" aria-hidden="true">${a.ic}</span><span class="tx"><b>${esc(aTitle(a))}</b><small>${esc(a.kind === 'flat' ? cap(roomsStr(aApt(a).rooms)) + ', ' + fmt1(aApt(a).area) + ' м² · ' + aAddr(a) : a.min < 100 ? 'доступно ' + avail(a) + '% · доля от ' + a.min + '%' : BLD[a.b].addr)} · ${pct(a.rate)}</small></span><span class="price">${a.min < 100 ? '<small>от</small> ' : ''}${cpn(shareCost(a, a.min))}</span></button>`).join('');
    if (list.length > v.n) h += `<button class="more" data-go="more">Показать ещё (${list.length - v.n})</button>`;
  } else {
    const lims = Object.values(GCAT).filter(g => g.lim);
    h += '<h3 class="dir-h">Лимитированные выпуски</h3>' + lims.map(g => {
      const sold = GS.lim[g.key] || 0, b = giftBld(g.key);
      return `<button class="drow" data-go="gift:${g.key}:${b.id}"><span class="ic" aria-hidden="true">${g.ic}</span><span class="tx"><b>${esc(g.name)}</b><small>${esc(b.name)} · продано ${sold} из ${g.lim}</small></span><span class="price">${cpn(g.price)}</span></button>`;
    }).join('');
    const offers = GS.gifts.filter(g => g.ls && g.o !== ME).sort((x, y) => x.ls - y.ls);
    const mine = GS.gifts.filter(g => g.ls && g.o === ME);
    if (mine.length) h += '<h3 class="dir-h">Ваши предложения</h3>' + mine.map(giftRow).join('');
    h += `<h3 class="dir-h">Игроки продают подарки · ${offers.length}</h3>` + (offers.length ? offers.map(g => {
      const c = GCAT[g.key];
      return `<div class="offrow"><span class="ic" aria-hidden="true">${c.ic}</span><span class="tx"><b>${esc(c.name)}${g.ed ? ' · № ' + g.ed : ''}</b><small>${esc(P(g.o).name)} · ${c.lim ? 'свободная цена' : 'не дороже ' + fmt(g.orig)}</small></span>${btn('gmbuy:' + g.id, fmt(g.ls), { cls: 'sm', dis: P(ME).bal < g.ls })}</div>`;
    }).join('') : '<p class="empty">Сейчас никто не продаёт подарки.</p>');
    h += '<p class="note">Обычный подарок можно продать не дороже цены покупки. Лимитированный — по любой цене.</p>';
  }
  return h;
};
function lotRow(l) {
  const a = ASSETS[l.a], o = P(l.o);
  return `<button class="drow" data-go="lot:${l.id}"><span class="ic" aria-hidden="true">${a.ic}</span><span class="tx"><b>${esc(aTitle(a))}</b><small>${esc(lotLine(l))} · ${l.o === ME ? 'вы' : esc(o.name)} · ${dev(l.ls, shareCost(a, l.sh), true)}</small></span><span class="price">${cpn(l.ls)}</span></button>`;
}

VIEWS.rich = () => {
  const list = richList();
  return `<div class="hero-t solo"><p class="kind">По стоимости имущества: сколько игрок заплатил за свои объекты</p><h2 class="title">Богатейшие жители</h2></div>`
    + list.map((x, i) => `<button class="rrow${x.p.id === ME ? ' me' : ''}" data-go="player:${x.p.id}"><span class="rk">${i + 1}</span>${pav(x.p)}<span class="tx">${pTag(x.p)}<small>доход ${fmt(x.monthly + x.biz)}/мес · заработано ${fmt(x.earned)}</small></span><span class="rv">${cpn(x.value)}</span></button>`).join('')
    + '<p class="note">Свободные купоны в рейтинг не входят: только имущество и доход. Все игроки, кроме вас, — демо-игроки.</p>';
};
VIEWS.feed = () => `<div class="hero-t solo"><p class="kind">Покупки, сделки и подарки, которые игроки сделали публичными</p><h2 class="title">Лента города</h2></div>`
  + (GS.feed.length ? GS.feed.map(feedRow).join('') : '<p class="empty">Пока тихо.</p>');
function feedRow(e) {
  const p = P(e.p), who = p.id === ME ? 'Вы' : p.name;
  let txt = '', bid = -1, ic = '', amt = e.pr || 0;
  const a = e.a != null ? ASSETS[e.a] : null, g = e.key ? GCAT[e.key] : null;
  const toN = id => (id === ME ? 'вам' : P(id).name);
  switch (e.t) {
    case 'pbuy': txt = who + ' ' + vb(p, 'купил|купила|купили') + ' у платформы ' + assetPhrase(a, e.sh); bid = a.b; ic = '🔑'; break;
    case 'mbuy': txt = who + ' ' + vb(p, 'купил|купила|купили') + ' у ' + (e.s === ME ? 'вас' : P(e.s).name) + ' ' + assetPhrase(a, e.sh); bid = a.b; ic = '🤝'; break;
    case 'list': txt = who + ' ' + vb(p, 'продаёт|продаёт|продаёте') + ' ' + assetPhrase(a, e.sh); bid = a.b; ic = '🏷'; break;
    case 'lgift': txt = who + ' ' + vb(p, 'подарил|подарила|подарили') + ' ' + toN(e.to) + ' ' + assetPhrase(a, e.sh); bid = a.b; ic = '🎁'; amt = 0; break;
    case 'gift': txt = who + ' ' + (e.to === e.p ? vb(p, 'купил себе|купила себе|купили себе') : vb(p, 'подарил|подарила|подарили') + ' ' + toN(e.to)) + ': ' + g.name + (e.ed ? ' (№ ' + e.ed + ' из ' + g.lim + ')' : ''); bid = e.b; ic = g.ic; break;
    case 'regift': txt = who + ' ' + vb(p, 'передарил|передарила|передарили') + ' ' + toN(e.to) + ': ' + g.name; bid = e.b; ic = g.ic; break;
    case 'gbuy': txt = who + ' ' + vb(p, 'купил|купила|купили') + ' у ' + (e.s === ME ? 'вас' : P(e.s).name) + ': ' + g.name + (e.ed ? ' (№ ' + e.ed + ')' : ''); bid = e.b; ic = g.ic; break;
    default: return '';
  }
  return `<button class="frow${e.ed ? ' rare' : ''}" data-go="${bid >= 0 ? 'b:' + bid : 'none'}"><span class="fi" aria-hidden="true">${ic}</span><span class="tx"><b>${esc(txt)}</b><small>${whenStr(e.d, e.mi)}</small></span>${amt ? `<span class="amt">${fmt(amt)}</span>` : ''}</button>`;
}
VIEWS.player = v => {
  const p = P(v.id), s = pStats(p.id), rank = richList().findIndex(x => x.p.id === p.id) + 1;
  if (p.id === ME) return VIEWS.me(v);
  const lots = myLots(p.id).sort((x, y) => y.cost - x.cost), gifts = GS.gifts.filter(g => g.o === p.id && g.pub);
  return `<div class="hero"><span class="avatar pbig" style="--c:${p.col}" aria-hidden="true">${esc(initials(p))}</span><div class="hero-t"><p class="kind">Демо-игрок ${p.flag} · ${rank}-е место в рейтинге</p><h2 class="title">${esc(p.name)}</h2></div></div>`
    + `<div class="tiles">${tile('Имущество', fmt(s.value), s.n + ' ' + plural(s.n, ['объект', 'объекта', 'объектов']) + ' и долей')}${tile('Доход в месяц', fmt(s.monthly + s.biz), 'с покупок за 30 дней ' + fmt(s.biz))}${tile('Заработано', fmt(s.earned), 'за всё время')}${tile('Подарки', String(s.gifts), 'публичных ' + gifts.length)}</div>`
    + `<section class="sec"><h3>Имущество</h3>${lots.slice(0, v.all ? 999 : 12).map(l => { const a = ASSETS[l.a]; return `<button class="drow" data-go="lot:${l.id}"><span class="ic" aria-hidden="true">${a.ic}</span><span class="tx"><b>${esc(aTitle(a))}</b><small>${esc(lotLine(l))}</small></span>${l.ls ? `<span class="pill mk">${fmt(l.ls)}</span>` : `<span class="price">${cpn(l.cost)}</span>`}</button>`; }).join('')}${!v.all && lots.length > 12 ? `<button class="more" data-go="all">Показать всё (${lots.length})</button>` : ''}</section>`
    + (gifts.length ? `<section class="sec"><h3>Подарки</h3>${gifts.slice(0, 20).map(g => { const c = GCAT[g.key]; return `<div class="drow static"><span class="ic" aria-hidden="true">${c.ic}</span><span class="tx"><b>${esc(c.name)}${g.ed ? ' · № ' + g.ed + ' из ' + c.lim : ''}</b><small>${g.fr === g.o ? 'купил' + (p.g === 'f' ? 'а' : '') + ' себе' : 'от ' + esc(pName(P(g.fr)))} · ${dShort(g.d)}</small></span><span class="price">${cpn(g.orig)}</span></div>`; }).join('')}</section>` : '');
};

VIEWS.gift = v => {
  const g = GCAT[v.key], b = BLD[v.bid], price = gPrice(v.key, b), sold = GS.lim[v.key] || 0, out = g.lim && sold >= g.lim;
  if (v.pub == null) v.pub = true;
  let h = `<div class="hero"><div class="badge" style="--tint:#f2b705" aria-hidden="true">${g.ic}</div><div class="hero-t"><p class="kind">${esc(b.name)}</p><h2 class="title">${esc(g.name)}</h2><p class="route">${cpn(price)}</p></div></div>`;
  if (g.lim) {
    const copies = GS.gifts.filter(x => x.key === v.key).sort((x, y) => x.ed - y.ed);
    h += `<section class="sec"><h3>Лимитированный выпуск · ${sold} из ${g.lim}</h3><p class="note">Всего ${g.lim} экземпляров за всю историю города. Владельцы видны всем, перепродажа по свободной цене.</p>`
      + Array.from({ length: g.lim }, (_, i) => { const c = copies.find(x => x.ed === i + 1); return c ? `<button class="owner" data-go="player:${c.o}">${pav(P(c.o))}<span class="tx"><b>№ ${i + 1} · ${esc(pName(P(c.o)))}</b><small>${c.ls ? 'продаёт за ' + fmt(c.ls) : 'не продаёт'}</small></span>${c.ls && c.o !== ME ? btn('gmbuy:' + c.id, 'Купить', { cls: 'sm', dis: P(ME).bal < c.ls }) : ''}</button>` : `<div class="owner free"><span class="pav free" aria-hidden="true">${i + 1}</span><span class="tx"><b>№ ${i + 1}</b><small>ещё не продан</small></span></div>`; }).join('') + '</section>';
  }
  if (out) return h + '<p class="note">Все экземпляры разошлись. Купить можно только у владельцев, если они продают.</p>';
  h += `<section class="sec"><h3>Кому</h3>${playerPick(v, -1, true)}${pubToggle(v)}</section>`;
  h += `<div class="buybox">${v.to == null ? btn('none', 'Выберите, кому подарить', { dis: true }) : payBtn('gbuy', (v.to === ME ? 'Купить себе за ' : 'Подарить за ') + fmt(price), price)}</div>`;
  const a = bizAsset(v.bid);
  h += `<p class="note">${a ? 'Из ' + cpw(price) + ' половина (' + fmt(price / 2) + ') сразу уйдёт владельцам «' + esc(b.short || b.name) + '» по их долям, половина — платформе.' : ''} Подарок появится в профиле получателя: его можно хранить, передарить или продать${g.lim ? '' : ' не дороже ' + fmt(price)}.</p>`;
  return h;
};
VIEWS.mygift = v => {
  const gi = GS.gifts.find(x => x.id === v.id);
  if (!gi) return '<p class="desc">Этого подарка уже нет.</p>';
  if (gi.o !== ME) return '<p class="desc">Этот подарок больше не ваш.</p>' + btn('view:me', 'В кабинет', { cls: 'ghost' });
  const g = GCAT[gi.key], b = BLD[gi.b];
  if (v.pub == null) v.pub = true;
  let h = `<div class="hero"><div class="badge" style="--tint:#f2b705" aria-hidden="true">${g.ic}</div><div class="hero-t"><p class="kind">${esc(b.name)}</p><h2 class="title">${esc(g.name)}</h2><p class="route">${gi.fr === ME ? 'куплен вами' : 'подарок от ' + esc(P(gi.fr).name)}</p></div></div>`;
  h += facts([['Цена покупки', cpn(gi.orig)], ['Когда', dFull(gi.d)], ['Экземпляр', gi.ed ? '№ ' + gi.ed + ' из ' + g.lim : 'обычный'], ['Продать можно', g.lim ? 'по любой цене' : 'до ' + fmt(gi.orig)]]);
  if (gi.ls) return h + `<div class="listed">Выставлен на продажу за ${cpn(gi.ls)}${btn('gdelist', 'Снять с продажи', { cls: 'ghost sm' })}</div>`;
  const def = g.lim ? Math.round(gi.orig * 1.3) : gi.orig;
  h += `<section class="sec"><h3>Продать</h3><label class="search-l" for="gsPrice">Цена в купонах${g.lim ? '' : ', не больше ' + fmt(gi.orig)}</label><input id="gsPrice" class="search" type="number" inputmode="numeric" min="1" ${g.lim ? '' : 'max="' + gi.orig + '"'} value="${def}"><p class="note" id="gsNet">${netStr(def)}</p>${btn('glist', 'Выставить на продажу', { cls: 'ghost' })}</section>`;
  h += `<section class="sec"><h3>Передарить</h3>${playerPick(v, ME, false)}${pubToggle(v)}${btn('ggive', v.to == null ? 'Выберите игрока' : 'Подарить ' + esc(P(v.to).name), { dis: v.to == null })}</section>`;
  return h;
};
const netStr = price => { const p = Math.max(0, Math.round(+price || 0)), f = Math.round(p * ECON.fee); return `Комиссия платформы ${Math.round(ECON.fee * 100)}%: ${fmt(f)} · вы получите ${fmt(p - f)}`; };
VIEWS.sell = v => {
  const l = GS.lots.find(x => x.id === v.id);
  if (!l || l.o !== ME) return '<p class="desc">Этот объект больше не ваш.</p>' + btn('view:me', 'В кабинет', { cls: 'ghost' });
  const a = ASSETS[l.a], def = l.ls || rnd500(l.cost * 1.1);
  let h = `<div class="hero"><div class="badge" style="--tint:#f2b705" aria-hidden="true">${a.ic}</div><div class="hero-t"><p class="kind">${esc(lotLine(l))}</p><h2 class="title">${esc(aTitle(a))}</h2></div></div>`;
  h += facts([['Ваша доля', l.sh + '%'], ['Вы заплатили', cpn(l.cost)], ['Цена у платформы', cpn(shareCost(a, l.sh))], ['Этап графика', stageStr(a, l)]]);
  h += `<section class="sec"><h3>Продать на рынке</h3><label class="search-l" for="lsPrice">Ваша цена в купонах</label><input id="lsPrice" class="search" type="number" inputmode="numeric" min="1" value="${def}"><p class="note" id="lsNet">${netStr(def)}</p>${btn('list:' + l.id, l.ls ? 'Изменить цену' : 'Выставить на продажу')}<p class="note">Покупатель получит объект вместе с оставшимся графиком: ${a.s2 > l.k ? (a.s2 - l.k) + ' мес. полных начислений' : 'остаточные начисления'}. Деньги придут на баланс сразу после сделки.</p></section>`;
  h += `<section class="sec"><h3>Или подарить</h3>${playerPick(v, ME, false)}${btn('lgive:' + l.id, v.to == null ? 'Выберите игрока' : 'Подарить ' + esc(P(v.to).name), { cls: 'ghost', dis: v.to == null })}</section>`;
  return h;
};

VIEWS.city = () => {
  const s = STATS, bk = platformBook(), owe = bk.bal + bk.fut, cover = owe ? bk.dep / owe : 1;
  const sold = ASSETS.filter(a => a.lots.length).length;
  return `<div class="city-hero"><div class="citysign big" aria-hidden="true"><span class="cs-name">VIRTUAL CITY</span><span class="cs-sub">демо · тестовые купоны</span></div>
  <p class="desc">Один общий город. Каждая квартира, дом и бизнес — отдельный объект с номером, ценой и ежемесячным доходом. Объекты покупают целиком или долями, сдают, продают и дарят. Это демо: игроки, кроме вас, — боты, а деньги ненастоящие.</p></div>
  <div class="tiles">${tile('Объекты', fmt(ASSETS.length), fmt(sold) + ' уже у игроков')}${tile('Игроки', String(GS.pl.length), 'вы и 12 демо-игроков')}${tile('Жители', fmt(s.pop), `средний возраст ${s.avgAge} ${plural(s.avgAge, ['год', 'года', 'лет'])}`)}${tile('Квартиры', fmt(s.apts), 'и ' + s.houses + ' частных домов')}${tile('Бизнесы', String(ASSETS.filter(a => a.kind === 'biz').length), 'кафе, отели, аэропорт…')}${tile('Где поесть', String(s.cafes + s.rests), `${s.cafes} кафе и ${s.rests} ресторанов`)}</div>
  <div class="links">${btn('view:board', '✈ Табло рейсов', { cls: 'ghost sm' })}${btn('view:feed', '🎁 Лента', { cls: 'ghost sm' })}<button class="check" role="switch" aria-checked="${SHOW_LABELS}" data-go="labels"><i></i>Подписи</button><button class="check" role="switch" aria-checked="${OWNVIEW}" data-go="own"><i></i>Карта владения</button></div>
  <section class="sec"><h3>Экономика платформы · для основателя</h3><div class="enr">
    <div class="enr-row"><span>Игроки внесли денег</span><b>${fmt(bk.dep)}</b></div>
    <div class="enr-row"><span>Продано объектов</span><b>${fmt(bk.sales)}</b></div>
    <div class="enr-row"><span>Комиссии и доля с подарков</span><b>${fmt(bk.fees)}</b></div>
    <div class="enr-row"><span>Уже выплачено начислений</span><b>${fmt(bk.paid)}</b></div>
    <div class="enr-row"><span>На балансах игроков (к выводу)</span><b>${fmt(bk.bal)}</b></div>
    <div class="enr-row"><span>Ещё обещано по графикам до 150%</span><b>${fmt(bk.fut)}</b></div>
    <div class="meter${cover < 1 ? ' warn' : ''}" role="img" aria-label="Покрытие ${Math.round(cover * 100)}%"><i style="width:${Math.round(Math.min(1, cover) * 100)}%"></i></div>
    <p class="enr-note">Деньги игроков покрывают обязательства на <b>${Math.round(cover * 100)}%</b>. Каждая продажа у платформы обещает вернуть 150% цены. Без нового дохода разницу можно закрыть только деньгами следующих покупателей. Плюс бессрочные остаточные начисления. Комиссии и половина выручки с подарков — доход, который новых обязательств не создаёт.</p></div></section>
  <section class="sec"><h3>Энергия сейчас</h3><div data-live="energy">${energyHtml()}</div></section>
  <section class="sec"><h3>Сейчас в городе</h3><dl class="facts">${fact('Машин на дорогах', live('cars'))}${fact('Пешеходов', live('peds'))}${fact('Погода', live('wx'))}${fact('Футбол', live('match'))}</dl></section>
  ${MAYOR >= 0 ? `<section class="sec"><h3>Мэр города</h3>${personRow(PPL[MAYOR], 'мэр города')}</section>` : ''}
  <p class="note">Жители, адреса, рейсы и демо-игроки выдуманы. Прогресс сохраняется в этом браузере на этом устройстве.</p>`;
};

/* ---------- clicks and inputs ---------- */
function done(err, ok, back) {
  if (!err) markDirty(true);
  if (err) note(err, '', 'err');
  else if (ok) note(ok, '', 'ok');
  updateWallet();
  if (back && !err) { if (UI.stack.length > 1) { UI.stack.pop(); renderView(); } else closeSheet(); }
  else rerender();
  return true;
}
function gameClick(k, parts, v, el) {
  const a = parts[1], c = parts[2];
  const lot = id => GS.lots.find(x => x.id === +id), gift = id => GS.gifts.find(x => x.id === +id);
  switch (k) {
    case 'none': return true;
    case 'buy': {
      const as = ASSETS[+a], e = opBuyPlatform(ME, +a, +c), m = as.lb === 'Пентхаус' || as.lb === 'Частный дом';
      return done(e, e ? '' : as.kind === 'biz' ? 'Доля ' + c + '% теперь ваша' : aTitle(as) + (m ? ' теперь ваш. Сдайте его' : ' теперь ваша. Сдайте её') + ' в аренду, чтобы шёл доход');
    }
    case 'mbuy': { const l = lot(a); return done(l ? opBuyLot(ME, l) : 'Предложение уже снято', l && l.o === ME ? 'Куплено! Объект теперь ваш' : ''); }
    case 'rent': { const l = lot(a); if (l) opRent(l, !l.rent); return done('', l && l.rent ? 'Сдано в аренду. Доход придёт ' + dMid(nextDue(l)) : ''); }
    case 'sellv': { const l = lot(a); if (l) openView({ k: 'sell', id: l.id, bid: ASSETS[l.a].b }); return true; }
    case 'list': { const l = lot(a), inp = $('#lsPrice'); if (!l || !inp) return true; const e = opList(l, +inp.value); return done(e, e ? '' : 'Выставлено на продажу за ' + fmt(+inp.value), true); }
    case 'delist': { const l = lot(a); if (l) opDelist(l); return done('', 'Снято с продажи'); }
    case 'lgive': { const l = lot(a); if (!l || v.to == null) return true; const to = P(v.to), e = opGiveLot(l, v.to); return done(e, e ? '' : 'Подарено: ' + to.name, true); }
    case 'to': v.to = +a; rerender(); return true;
    case 'pub': v.pub = !v.pub; rerender(); return true;
    case 'gift': openView({ k: 'gift', key: a, bid: +c, to: null, pub: true }); return true;
    case 'gbuy': { if (v.to == null) return true; const to = v.to, e = opBuyGift(ME, v.key, v.bid, to, v.pub); if (!e) v.to = null; return done(e, e ? '' : (to === ME ? 'Куплено! Подарок в вашем кабинете' : 'Подарено: ' + P(to).name)); }
    case 'mygift': { const g = gift(a); if (g) openView({ k: 'mygift', id: g.id, bid: g.b }); return true; }
    case 'ggive': { const g = gift(v.id); if (!g || v.to == null) return true; const to = P(v.to), e = opGiveGift(g, v.to, v.pub); return done(e, e ? '' : 'Передарено: ' + to.name, true); }
    case 'glist': { const g = gift(v.id), inp = $('#gsPrice'); if (!g || !inp) return true; return done(opListGift(g, +inp.value), ''); }
    case 'gdelist': { const g = gift(v.id); if (g) opDelistGift(g); return done('', 'Снято с продажи'); }
    case 'gmbuy': { const g = gift(a); return done(g ? opBuyGiftLot(ME, g) : 'Предложение уже снято', g && g.o === ME ? 'Куплено! Подарок в вашем кабинете' : ''); }
    case 'step': { const as = bizAsset(v.id); if (as) { v.sh = clamp(v.sh + (+a) * as.min, as.min, avail(as)); rerender(); } return true; }
    case 'topup': opTopUp(); return done('', '+' + fmt(ECON.topup) + ' тестовых купонов');
    case 'nowd': return true;
    case 'skip': { if (a === 'm') skipMonth(); else skipDays(1); updateHUD(); return done('', ''); }
    case 'player': openView({ k: 'player', id: +a }); return true;
    case 'lot': { const l = lot(a); if (l) openAsset(ASSETS[l.a]); return true; }
    case 'asset': openAsset(ASSETS[+a]); return true;
    case 'reset': v.reset = true; rerender(); return true;
    case 'reset0': v.reset = false; rerender(); return true;
    case 'reset2': resetGame(); WAL = -1; updateWallet(); closeSheet(); note('Демо началось заново', 'У вас ' + cpw(ECON.start) + ' тестовых купонов', 'ok'); return true;
    case 'own': setOwnView(!OWNVIEW); rerender(); return true;
    case 'labels': SHOW_LABELS = !SHOW_LABELS; SAVE_T = 1; rerender(); return true;
    case 'mtab': v.tab = a; v.n = 40; v.scroll = 0; renderView(); return true;
    case 'mf': v.f = a; v.n = 40; rerender(); return true;
    case 'more': v.n = (v.n || 40) + 40; rerender(); return true;
  }
  return false;
}
function openAsset(a) {
  FOLLOW = false;
  const b = BLD[a.b];
  openView(a.apt >= 0 ? { k: 'b', id: b.id, apt: a.apt } : { k: 'b', id: b.id });
  focusB(b);
}
function gameInput(e) {
  const id = e.target.id;
  if (id === 'lsPrice') { const n = $('#lsNet'); if (n) n.textContent = netStr(e.target.value); return true; }
  if (id === 'gsPrice') { const n = $('#gsNet'); if (n) n.textContent = netStr(e.target.value); return true; }
  return false;
}
