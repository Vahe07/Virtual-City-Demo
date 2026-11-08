/* game.js — Virtual City demo economy, layered on top of the living city.
   The platform issues every flat, house and business as an asset with a fixed price and a fixed monthly accrual.
   A player owns lots: a whole asset or a share of it. Accruals follow the asset's own schedule, counted from the
   day the platform sold that lot, and keep going after a resale. Flats earn only while «Сдать в аренду» is on.
   Gifts bought in a business pay 50% to its owners. Everything is in test coupons; no real money exists here. */
const CITY = 'Virtual City';
const ECON = { start: 250000, topup: 100000, fee: 0.02, resid: 0.1, owners: 0.5 };
const ME = 0;
const SAVE_KEY = 'vc-demo-v1';
const ASSETS = [], AOF = [], OWNC = [], FX = [];
let GS = null, GVER = 1, OWN_VER = -1, BOT_T = 0, BOT_NEXT = 6, SAVE_T = 0;

const MUNI = new Set(['school', 'kinder', 'hospital', 'police', 'fire', 'cityhall', 'library', 'post', 'museum', 'theatre', 'watertower', 'lighthouse', 'radar', 'tower']);
const LM_ASSET = {
  terminal: [20000000, 1, 'Аэропорт'], hangar: [3000000, 5, 'Техцентр аэропорта'], mall: [8000000, 2, 'Торговый центр'],
  grandhotel: [6000000, 2, 'Отель'], hotel: [2400000, 5, 'Отель'], stadium: [5000000, 2, 'Стадион'], gas: [450000, 10, 'АЗС'],
  cinema: [900000, 5, 'Кинотеатр'], ferris: [650000, 10, 'Аттракцион'], yacht: [1600000, 5, 'Яхт-клуб'],
  energy: [4000000, 2, 'Электростанция'], turbine: [700000, 10, 'Ветрогенератор'], bank: [5000000, 2, 'Банк'],
};
const SHOP_PRICE = { 'Супермаркет': 260000, 'Аптека': 150000, 'Книжный магазин': 90000, 'Зоомагазин': 85000, 'Электроника': 180000,
  'Цветы': 70000, 'Ювелирный салон': 450000, 'Автосалон': 900000 };

/* gifts: [key, icon, name, price (0 = from the menu), limited copies] */
const GIFT_GROUPS = {
  jewel: [['silver', '💍', 'Серебряный браслет', 120], ['pearl', '🦪', 'Серьги с жемчугом', 450], ['diamond', '💎', 'Кольцо с бриллиантом', 2500],
    ['star', '⭐', 'Колье «Морская звезда»', 6000], ['wave', '💍', 'Кольцо «Лазурная волна»', 25000, 5], ['watch', '⌚', 'Часы «Маяк» ручной работы', 60000, 3]],
  cars: [['scooter', '🛴', 'Электросамокат', 900], ['cabrio', '🚗', 'Кабриолет «Бриз»', 38000], ['suv', '🚙', 'Внедорожник «Атлас»', 55000],
    ['gt', '🏎', 'Спорткар «Аврора GT»', 180000, 3]],
  air: [['tbs', '✈️', 'Билет в Тбилиси', 160], ['ist', '✈️', 'Билет в Стамбул', 220], ['dxb', '✈️', 'Билет в Дубай', 350], ['par', '✈️', 'Билет в Париж', 420],
    ['biz', '🥂', 'Бизнес-класс в Дубай', 1400], ['gold', '🎫', 'Золотой билет: бизнес-класс навсегда', 75000, 3]],
  grand: [['suite', '🛎', 'Ночь в люксе', 480], ['ph', '🌇', 'Выходные в пентхаусе отеля', 1900]],
  hotel: [['sea', '🌊', 'Ночь с видом на море', 220], ['week', '🏖', 'Неделя у моря', 1300]],
  rest: [['dinner', '🍽', 'Ужин на двоих', 0], ['banquet', '🥂', 'Банкет на 10 гостей', 0]],
  cafe: [['treat', '☕', 'Кофе и десерт', 0], ['month', '🧾', 'Месяц кофе без ограничений', 90]],
  flowers: [['roses', '🌹', 'Букет из 25 роз', 60], ['basket', '💐', 'Корзина цветов', 150], ['year', '🌷', 'Цветы каждую неделю, год', 2400]],
  tech: [['buds', '🎧', 'Наушники', 65], ['phone', '📱', 'Смартфон', 420], ['fold', '📱', 'Смартфон Fold Gold', 4000, 5]],
  mall: [['c100', '🎁', 'Подарочная карта на 100', 100], ['c500', '🎁', 'Подарочная карта на 500', 500], ['style', '🛍', 'Шопинг-день со стилистом', 2000]],
  yacht: [['sunset', '⛵', 'Закатная прогулка на яхте', 120], ['day', '🛥', 'Яхта на весь день', 900]],
  ferris: [['cab', '🎡', 'Кабинка на двоих', 12]],
  cinema: [['vip', '🍿', 'VIP-зал на двоих', 40]],
  stadium: [['season', '⚽', 'Абонемент на сезон', 300], ['box', '🏟', 'VIP-ложа на матч', 1200]],
  books: [['ed', '📚', 'Подарочное издание', 60]],
  deli: [['basket', '🧺', 'Корзина деликатесов', 80]],
  gas: [['fuel', '⛽', 'Топливная карта', 100]],
};
const GCAT = {};
for (const grp in GIFT_GROUPS) for (const [k, ic, name, price, lim] of GIFT_GROUPS[grp]) GCAT[grp + '.' + k] = { key: grp + '.' + k, grp, ic, name, price, lim: lim || 0 };

const BOTS = [
  ['Alex M.', 'm', '🇺🇸', '#2f6fd6'], ['Anna K.', 'f', '🇩🇪', '#e05c8a'], ['David R.', 'm', '🇬🇧', '#0f8b8d'], ['Maria S.', 'f', '🇪🇸', '#e8793a'],
  ['Giorgi B.', 'm', '🇬🇪', '#c8463a'], ['Ani P.', 'f', '🇦🇲', '#7a4b9c'], ['Omar F.', 'm', '🇦🇪', '#3aa655'], ['Sofia L.', 'f', '🇮🇹', '#d1492e'],
  ['Michael T.', 'm', '🇨🇦', '#1769aa'], ['Lena V.', 'f', '🇰🇿', '#14a3b8'], ['Yuki H.', 'f', '🇯🇵', '#ff6b4a'], ['Lucas O.', 'm', '🇧🇷', '#5c6370'],
];

/* calendar: days are counted from 1970-01-01 and read as plain calendar dates */
const MON_G = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MON_S = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const ymdOf = d => { const t = new Date(d * 864e5); return [t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()]; };
const dayOf = (y, m, dd) => Math.floor(Date.UTC(y, m, dd) / 864e5);
function addMonths(d, n) {
  const [y, m, dd] = ymdOf(d), t = m + n, Y = y + Math.floor(t / 12), M = ((t % 12) + 12) % 12;
  return dayOf(Y, M, Math.min(dd, new Date(Date.UTC(Y, M + 1, 0)).getUTCDate()));
}
function dFull(d) { const [y, m, dd] = ymdOf(d); return dd + ' ' + MON_G[m] + ' ' + y; }
function dMid(d) { const [, m, dd] = ymdOf(d); return dd + ' ' + MON_G[m]; }
function dShort(d) { const [, m, dd] = ymdOf(d); return dd + ' ' + MON_S[m]; }
const today = () => GS.d0 + dayN();

/* the registry: built from the generated city, so it is the same on every visit */
const rnd500 = x => Math.round(x / 500) * 500;
const code4 = n => String(n).padStart(4, '0');
function mkAsset(o) {
  o.id = ASSETS.length; o.lots = [];
  o.m = Math.round(o.price * o.rate / 12);
  o.s1 = Math.ceil(o.price / o.m);          // months until 100% is paid back
  o.s2 = Math.ceil(o.price * 1.5 / o.m);    // months until +50% on top
  ASSETS.push(o); AOF[o.b].push(o.id);
  return o;
}
function buildAssets() {
  for (const b of BLD) {
    AOF[b.id] = [];
    const k = b.kind;
    if (k === 'apt' || k === 'aptB') {
      const nb = k === 'aptB';
      const loc = (b.y >= 17 ? 1.12 : 1) * (b.x >= 11 && b.x <= 19 && b.y >= 4 && b.y <= 15 ? 1.08 : 1) * (b.x < 9 ? 0.95 : 1);
      b.apts.forEach((ap, i) => {
        let lb = 'Квартира', ic = '🏢', f = 1;
        if (nb && ap.rooms >= 3 && ap.fl === b.floors) { lb = 'Пентхаус'; ic = '🌇'; f = 1.45; }
        else if (nb && ap.rooms >= 2 && ap.fl >= b.floors - 3) { lb = 'Элитная квартира'; ic = '✨'; f = 1.15; }
        const fl = ap.fl === 1 ? 0.94 : 1 + (nb ? 0.018 : 0.012) * (ap.fl - 1);
        mkAsset({ b: b.id, apt: i, kind: 'flat', lb, ic, min: 100, price: rnd500(ap.area * (nb ? 1350 : 950) * loc * fl * f),
          rate: 0.31 + hashN(b.id, i, 7) * 0.03, code: 'VC-' + code4(b.id) + '-' + String(ap.n).padStart(2, '0') });
      });
    } else if (k === 'house') {
      const villa = b.area >= 175;
      mkAsset({ b: b.id, apt: -1, kind: 'house', lb: villa ? 'Вилла' : 'Частный дом', ic: villa ? '🏝' : '🏡', min: 100,
        price: rnd500(b.area * 1700 * (b.y >= 19 ? 1.1 : 1) * (villa ? 1.25 : 1)), rate: 0.31 + hashN(b.id, 9) * 0.03, code: 'VC-' + code4(b.id) });
    } else if (!MUNI.has(k)) {
      let price = 0, min = 10, lb = '', rate = 0.31 + hashN(b.id, 3) * 0.04;
      if (k === 'cafe') { price = rnd500(40000 + b.seats * 2500 + (b.rating - 4.3) * 40000); lb = 'Кафе'; }
      else if (k === 'rest') { price = Math.round((120000 + b.seats * b.check / 60 * 120) / 1000) * 1000; lb = 'Ресторан'; rate = 0.30 + hashN(b.id, 3) * 0.04; }
      else if (k === 'shop') { price = SHOP_PRICE[b.type] || 100000; lb = b.type; if (b.type === 'Ювелирный салон' || b.type === 'Автосалон') { min = 5; rate = 0.30 + hashN(b.id, 3) * 0.04; } }
      else if (k === 'office') { price = b.floors * 110000; min = 2; lb = 'Бизнес-центр'; rate = 0.27 + hashN(b.id, 3) * 0.08; }
      else if (LM_ASSET[k]) { [price, min, lb] = LM_ASSET[k]; rate = 0.27 + hashN(b.id, 3) * 0.08; }
      if (price) mkAsset({ b: b.id, apt: -1, kind: 'biz', lb, ic: b.icon, min, price, rate, code: 'VC-' + code4(b.id) });
    }
    b.gift = b.gift || (k === 'cafe' ? 'cafe' : k === 'rest' ? 'rest' : null);
  }
}
const worldSig = () => ASSETS.length + ':' + ASSETS.reduce((s, a) => (s + a.price) % 1000003, 0);

/* small readers */
const aApt = a => (a.apt >= 0 ? BLD[a.b].apts[a.apt] : null);
function aTitle(a) { const ap = aApt(a); return ap ? a.lb + ', кв. ' + ap.n : a.kind === 'house' ? a.lb : BLD[a.b].name; }
function aAddr(a) { const ap = aApt(a); return BLD[a.b].addr + (ap ? ', кв. ' + ap.n : ''); }
function aName(a) { return a.kind === 'biz' ? BLD[a.b].name : a.lb + ', ' + aAddr(a); }
const avail = a => 100 - a.lots.reduce((s, l) => s + l.sh, 0);
const payOf = (a, k) => (k > a.s2 ? Math.round(a.m * ECON.resid) : a.m);
const lotPay = (l, k) => Math.round(payOf(ASSETS[l.a], k) * l.sh / 100);
const nextDue = l => addMonths(l.iss, l.k + 1);
const shareCost = (a, sh) => Math.round(a.price * sh / 100);
const earns = l => ASSETS[l.a].kind === 'biz' || l.rent;
const P = id => GS.pl[id];
const pName = p => (p.id === ME ? 'Вы' : p.name);
function vb(p, forms) { const f = forms.split('|'); return p.id === ME ? f[2] : p.g === 'f' ? f[1] : f[0]; }
const myLots = pid => GS.lots.filter(l => l.o === pid);
const bizAsset = bid => { const ids = AOF[bid] || []; for (const i of ids) if (ASSETS[i].kind === 'biz') return ASSETS[i]; return null; };
function gPrice(key, b) {
  const g = GCAT[key];
  if (g.price) return g.price;
  const per = (b && b.check ? b.check : 400) / 60;
  if (key === 'cafe.treat') return Math.max(3, Math.round(per * 1.2));
  if (key === 'rest.dinner') return Math.max(10, Math.round(per * 2 / 5) * 5);
  if (key === 'rest.banquet') return Math.max(100, Math.round(per * 10 * 1.3 / 10) * 10);
  return 50;
}
const bizGifts = b => (b.gift && GIFT_GROUPS[b.gift] ? GIFT_GROUPS[b.gift].map(([k]) => b.gift + '.' + k) : []);
const giftBld = key => { for (const b of BLD) if (b.gift === GCAT[key].grp) return b; return null; };

/* totals for the rich list: value is what the owner paid; income is the fixed monthly plus 30 days of sales income */
function pStats(pid) {
  let value = 0, monthly = 0, n = 0;
  for (const l of GS.lots) if (l.o === pid) { value += l.cost; n++; if (earns(l)) monthly += lotPay(l, l.k + 1); }
  const p = P(pid), t = today();
  const biz = p.inc.reduce((s, [d, a]) => (d > t - 30 ? s + a : s), 0);
  return { value, monthly, biz, n, earned: p.earned, gifts: GS.gifts.filter(g => g.o === pid).length };
}
function richList() {
  return GS.pl.map(p => ({ p, ...pStats(p.id) })).sort((a, b) => b.value - a.value || b.monthly - a.monthly);
}

/* bookkeeping */
function bump() { GVER++; SAVE_T = 1.2; markDirty(false); }
function feed(e) { e.d = today(); e.mi = SKIP.on ? 480 + Math.floor(Math.random() * 840) : Math.floor(tod()); GS.feed.unshift(e); if (GS.feed.length > 90) GS.feed.length = 90; }
function hist(txt, amt) { GS.hist.unshift({ d: today(), mi: Math.floor(tod()), txt, amt }); if (GS.hist.length > 220) GS.hist.length = 220; }
function credit(pid, amt, kind) {
  const p = P(pid);
  p.bal += amt;
  if (kind === 'acc' || kind === 'biz') p.earned += amt;
  if (kind === 'biz') {
    const t = today(), last = p.inc[p.inc.length - 1];
    if (last && last[0] === t) last[1] += amt; else p.inc.push([t, amt]);
    while (p.inc.length && p.inc[0][0] <= t - 30) p.inc.shift();
  }
}
function fx(bid, ic, txt) { FX.push({ b: bid, ic, txt, t: performance.now() }); if (FX.length > 6) FX.shift(); }
const shTxt = sh => (sh < 100 ? sh + '% ' : '');

/* ---------- operations; each returns an error text or '' ---------- */
function opBuyPlatform(pid, aid, sh) {
  const a = ASSETS[aid], p = P(pid);
  if (sh <= 0 || sh > avail(a) || sh % a.min) return 'Такой доли сейчас нет в продаже';
  const cost = shareCost(a, sh);
  if (p.bal < cost) return 'Не хватает купонов';
  p.bal -= cost; GS.ps.sales += cost;
  const l = { id: GS.nid++, a: aid, sh, o: pid, iss: today(), k: 0, cost, rent: pid !== ME, ls: 0 };
  GS.lots.push(l); a.lots.push(l);
  feed({ t: 'pbuy', p: pid, a: aid, sh, pr: cost });
  if (pid === ME) hist('Покупка у платформы: ' + aName(a) + (sh < 100 ? ', доля ' + sh + '%' : ''), -cost);
  fx(a.b, '🔑', pName(p) + ' · ' + shTxt(sh) + (a.kind === 'flat' ? 'кв. ' + aApt(a).n : a.lb.toLowerCase()));
  bump();
  return '';
}
function opList(l, price) {
  price = Math.round(price);
  if (!(price >= 1)) return 'Укажите цену';
  l.ls = price;
  feed({ t: 'list', p: l.o, a: l.a, sh: l.sh, pr: price });
  bump();
  return '';
}
function opDelist(l) { l.ls = 0; bump(); return ''; }
function opBuyLot(pid, l) {
  const p = P(pid), price = l.ls, a = ASSETS[l.a];
  if (!price || l.o === pid) return 'Это предложение уже недоступно';
  if (p.bal < price) return 'Не хватает купонов';
  const seller = l.o, fee = Math.round(price * ECON.fee);
  p.bal -= price; credit(seller, price - fee, 'sale'); GS.ps.fees += fee;
  l.o = pid; l.cost = price; l.ls = 0; l.rent = pid !== ME && a.kind !== 'biz';
  feed({ t: 'mbuy', p: pid, s: seller, a: l.a, sh: l.sh, pr: price });
  if (pid === ME) hist('Покупка у игрока ' + P(seller).name + ': ' + aName(a) + (l.sh < 100 ? ', доля ' + l.sh + '%' : ''), -price);
  if (seller === ME) {
    hist('Продажа: ' + aName(a) + (l.sh < 100 ? ', доля ' + l.sh + '%' : '') + ' (комиссия ' + fmt(fee) + ')', price - fee);
    note('Продано! +' + fmt(price - fee) + ' купонов', P(pid).name + ' ' + vb(P(pid), 'купил|купила|купили') + ' ' + shTxt(l.sh) + aTitle(a).toLowerCase() + ' за ' + fmt(price), 'sale', a.b);
  }
  fx(a.b, '🤝', pName(p) + ' · ' + shTxt(l.sh) + 'за ' + fmt(price));
  bump();
  return '';
}
function opGiveLot(l, to) {
  if (l.o === to) return 'Это уже ваш объект';
  const from = l.o, a = ASSETS[l.a];
  l.o = to; l.ls = 0; l.rent = to !== ME && a.kind !== 'biz';
  feed({ t: 'lgift', p: from, to, a: l.a, sh: l.sh });
  if (from === ME) hist('Подарок игроку ' + P(to).name + ': ' + aName(a), 0);
  fx(a.b, '🎁', pName(P(from)) + ' → ' + pName(P(to)));
  bump();
  return '';
}
function opRent(l, on) { l.rent = !!on; if (l.o === ME) hist((on ? 'Сдана в аренду: ' : 'Аренда выключена: ') + aName(ASSETS[l.a]), 0); bump(); return ''; }
function opTopUp() { const p = P(ME); p.bal += ECON.topup; GS.ps.dep += ECON.topup; hist('Пополнение тестовыми купонами', ECON.topup); bump(); return ''; }

/* gifts */
function payOwners(bid, amount, buyer) {
  // half of every purchase goes to the owners of the business, by their shares; the rest stays with the platform
  const a = bizAsset(bid);
  let paid = 0;
  const half = amount * ECON.owners;
  if (a) for (const l of a.lots) {
    const part = Math.floor(half * l.sh / 100);
    if (part <= 0) continue;
    credit(l.o, part, 'biz'); paid += part;
    if (l.o === ME && buyer !== ME) { MYBIZ.day += part; MYBIZ.sum += part; MYBIZ.b = bid; MYBIZ.who = buyer; }
  }
  GS.ps.gcut += amount - paid;
}
const MYBIZ = { sum: 0, day: 0, b: -1, who: 0, what: '' };
function opBuyGift(pid, key, bid, to, pub) {
  const g = GCAT[key], b = BLD[bid], p = P(pid), price = gPrice(key, b);
  if (g.lim && (GS.lim[key] || 0) >= g.lim) return 'Все экземпляры уже проданы';
  if (p.bal < price) return 'Не хватает купонов';
  p.bal -= price;
  payOwners(bid, price, pid);
  MYBIZ.what = g.name;
  const ed = g.lim ? (GS.lim[key] = (GS.lim[key] || 0) + 1) : 0;
  const gi = { id: GS.gid++, key, b: bid, o: to, fr: pid, d: today(), pub: !!pub, ed, orig: price, paid: price, ls: 0 };
  GS.gifts.push(gi);
  if (GS.gifts.length > 420) trimGifts();
  if (pub) feed({ t: 'gift', p: pid, to, key, b: bid, pr: price, ed });
  if (pid === ME) hist('Подарок ' + (to === ME ? 'себе' : 'для ' + P(to).name) + ': ' + g.name + ' (' + b.name + ')', -price);
  if (to === ME && pid !== ME) note('Вам подарок! ' + g.ic, P(pid).name + ' ' + vb(P(pid), 'подарил|подарила|подарили') + ' вам: ' + g.name, 'gift', bid);
  if (pub || pid === ME) fx(bid, '🎁', pName(p) + ' → ' + (to === pid ? 'себе' : pName(P(to))) + ': ' + g.name);
  bump();
  return '';
}
function opGiveGift(gi, to, pub) {
  if (gi.o === to) return 'Подарок уже у этого игрока';
  const from = gi.o;
  gi.fr = from; gi.o = to; gi.ls = 0; gi.d = today(); gi.pub = !!pub;
  if (pub) feed({ t: 'regift', p: from, to, key: gi.key, b: gi.b, ed: gi.ed });
  if (from === ME) hist('Передарили ' + P(to).name + ': ' + GCAT[gi.key].name, 0);
  if (to === ME) note('Вам подарок! ' + GCAT[gi.key].ic, P(from).name + ' ' + vb(P(from), 'подарил|подарила|подарили') + ' вам: ' + GCAT[gi.key].name, 'gift', gi.b);
  bump();
  return '';
}
function trimGifts() {
  // old everyday gifts of demo players are forgotten; limited editions, offers and your own gifts stay
  let drop = GS.gifts.length - 360;
  GS.gifts = GS.gifts.filter(g => { if (drop > 0 && g.o !== ME && g.fr !== ME && !g.ed && !g.ls) { drop--; return false; } return true; });
}
const giftCap = gi => (GCAT[gi.key].lim ? Infinity : gi.orig);
function opListGift(gi, price) {
  price = Math.round(price);
  if (!(price >= 1)) return 'Укажите цену';
  if (price > giftCap(gi)) return 'Обычный подарок нельзя продать дороже ' + fmt(gi.orig);
  gi.ls = price; bump();
  return '';
}
function opDelistGift(gi) { gi.ls = 0; bump(); return ''; }
function opBuyGiftLot(pid, gi) {
  const p = P(pid), price = gi.ls;
  if (!price || gi.o === pid) return 'Это предложение уже недоступно';
  if (p.bal < price) return 'Не хватает купонов';
  const seller = gi.o, fee = Math.round(price * ECON.fee);
  p.bal -= price; credit(seller, price - fee, 'sale'); GS.ps.fees += fee;
  gi.o = pid; gi.fr = seller; gi.paid = price; gi.ls = 0; gi.d = today();
  feed({ t: 'gbuy', p: pid, s: seller, key: gi.key, b: gi.b, pr: price, ed: gi.ed });
  if (pid === ME) hist('Покупка у игрока ' + P(seller).name + ': ' + GCAT[gi.key].name, -price);
  if (seller === ME) {
    hist('Продажа подарка: ' + GCAT[gi.key].name + ' (комиссия ' + fmt(fee) + ')', price - fee);
    note('Подарок продан: +' + fmt(price - fee), P(pid).name + ' ' + vb(P(pid), 'купил|купила|купили') + ' ' + GCAT[gi.key].name, 'sale', gi.b);
  }
  bump();
  return '';
}

/* ---------- the calendar runs: accruals on each lot's own dates ---------- */
const SKIP = { on: false, mine: 0, n: 0, missed: [] };
function processDays(t) {
  let mine = 0, n = 0;
  const missed = [];
  for (const l of GS.lots) {
    let guard = 0;
    while (nextDue(l) <= t && guard++ < 240) {
      l.k++;
      const amt = lotPay(l, l.k);
      if (!earns(l)) { if (l.o === ME) missed.push([l, amt]); continue; }
      credit(l.o, amt, 'acc'); GS.ps.paid += amt;
      if (l.o === ME) { mine += amt; n++; hist('Начисление: ' + aName(ASSETS[l.a]) + (l.sh < 100 ? ' (' + l.sh + '%)' : '') + ', ' + l.k + '-й месяц', amt); }
    }
  }
  if (GS.last && t > GS.last && !SKIP.on) bizDay(t - 1);
  GS.last = t;
  if (SKIP.on) { SKIP.mine += mine; SKIP.n += n; SKIP.missed.push(...missed); }
  else {
    if (mine) note('+' + fmt(mine) + ' купонов', 'Начисления за ' + dMid(t) + ' по ' + n + ' ' + plural(n, ['объекту', 'объектам', 'объектам']), 'acc');
    noteMissed(missed);
    flushBiz();
  }
  bump();
}
function noteMissed(missed) {
  if (!missed.length) return;
  const [l, amt] = missed[0], more = missed.length - 1;
  note('Начисление пропущено', aName(ASSETS[l.a]) + ': не сдана в аренду: ' + fmt(amt) + ' купонов не пришло' + (more ? ' (и ещё ' + more + ' ' + plural(more, ['раз', 'раза', 'раз']) + ')' : ''), 'miss', ASSETS[l.a].b);
}
function flushBiz(force) {
  // the money is already on the balance; this only tells you about it, without a message for every coffee
  if (MYBIZ.sum >= 20 || (force && MYBIZ.sum > 0)) {
    const b = BLD[MYBIZ.b], who = P(MYBIZ.who);
    note('+' + fmt(MYBIZ.sum) + ' от покупок', force ? 'Ваша половина выручки ваших бизнесов за этот период' : who.name + ' ' + vb(who, 'купил|купила|купили') + ' «' + MYBIZ.what + '» в «' + (b.short || b.name) + '»', 'biz', MYBIZ.b);
    MYBIZ.sum = 0;
  }
}
function bizDay(d) { if (MYBIZ.day > 0) { hist('Половина выручки ваших бизнесов за ' + dMid(d), MYBIZ.day); MYBIZ.day = 0; } }
function skipDays(n) {
  SKIP.on = true; SKIP.mine = 0; SKIP.n = 0; SKIP.missed = [];
  const from = today();
  for (let i = 0; i < n; i++) {
    SIM.min += 1440;
    processDays(today());
    botAct(true); if (Math.random() < 0.7) botAct(true);
  }
  SKIP.on = false;
  if (MYBIZ.day > 0) { hist('Половина выручки ваших бизнесов с ' + dMid(from) + ' по ' + dMid(today()), MYBIZ.day); MYBIZ.day = 0; }
  flushBiz(true);
  if (SKIP.mine) note('+' + fmt(SKIP.mine) + ' купонов', 'Начисления с ' + dMid(from) + ' по ' + dMid(today()) + ': ' + SKIP.n + ' ' + plural(SKIP.n, ['выплата', 'выплаты', 'выплат']), 'acc');
  else if (!SKIP.missed.length) note('Прошло ' + n + ' ' + plural(n, ['день', 'дня', 'дней']), 'Сегодня ' + dFull(today()) + '. Начислений пока не было', 'acc');
  noteMissed(SKIP.missed);
  HUD_MIN = -1; computeLight(); updateHourly();
  bump();
}
function skipMonth() { const t = today(); skipDays(addMonths(t, 1) - t); }

/* ---------- demo players ---------- */
const rndOf = arr => arr[Math.floor(Math.random() * arr.length)];
function botTop(p) { if (p.bal < 120000 && Math.random() < 0.5) { const add = rnd500(200000 + Math.random() * 900000); p.bal += add; GS.ps.dep += add; } }
function botBuyPlatform(p) {
  const roll = Math.random();
  for (let tries = 0; tries < 40; tries++) {
    const a = rndOf(ASSETS);
    if (roll < 0.62 ? a.kind !== 'flat' : roll < 0.72 ? a.kind !== 'house' : a.kind !== 'biz') continue;
    const av = avail(a);
    if (av < a.min) continue;
    let sh = a.min;
    if (a.kind === 'biz') sh = Math.min(av, a.min * (1 + Math.floor(Math.random() * 3)));
    if (shareCost(a, sh) > p.bal * 0.7) continue;
    return !opBuyPlatform(p.id, a.id, sh);
  }
  return false;
}
function botList(p) {
  const mine = myLots(p.id).filter(l => !l.ls);
  if (mine.length < 2) return false;
  const l = rndOf(mine);
  return !opList(l, rnd500(l.cost * (1.04 + Math.random() * 0.32)));
}
function botBuyMarket(p) {
  const offers = GS.lots.filter(l => l.ls && l.o !== p.id && l.ls <= p.bal * 0.8);
  if (!offers.length) return false;
  // buyers like fair prices: an offer is weighed by how close it is to the platform price
  const w = offers.map(l => { const r = l.ls / shareCost(ASSETS[l.a], l.sh); return l.o === ME ? clamp(1.7 - r, 0.04, 1) * 2.2 : Math.pow(1 / r, 4); });
  const l = wpick(Math.random, offers, w);
  if (l.o === ME && Math.random() > clamp(1.65 - l.ls / shareCost(ASSETS[l.a], l.sh), 0.05, 0.95)) return false;
  return !opBuyLot(p.id, l);
}
function botGift(p) {
  const shops = BLD.filter(b => b.gift);
  const b = rndOf(shops), keys = bizGifts(b);
  const w = keys.map(k => { const g = GCAT[k], pr = gPrice(k, b); if (g.lim && ((GS.lim[k] || 0) >= g.lim || Math.random() > 0.12)) return 0; return 1 / Math.pow(pr, 0.55); });
  if (!w.some(x => x > 0)) return false;
  const key = wpick(Math.random, keys, w), price = gPrice(key, b);
  if (price > p.bal * 0.3) return false;
  const others = GS.pl.filter(q => q.id !== p.id && q.id !== ME);
  const to = Math.random() < 0.06 ? ME : rndOf(others).id;
  return !opBuyGift(p.id, key, b.id, to, Math.random() < 0.8);
}
function botGiftMarket(p) {
  const mine = GS.gifts.filter(g => g.o === p.id && !g.ls);
  if (mine.length && Math.random() < 0.5) {
    const gi = rndOf(mine), cap = giftCap(gi);
    return !opListGift(gi, Math.min(cap, Math.round(gi.paid * (GCAT[gi.key].lim ? 1.1 + Math.random() * 0.6 : 0.7 + Math.random() * 0.3))));
  }
  const offers = GS.gifts.filter(g => g.ls && g.o !== p.id && g.ls <= p.bal * 0.25);
  if (!offers.length) return false;
  const gi = rndOf(offers);
  if (gi.o === ME && Math.random() > clamp(1.5 - gi.ls / gi.orig, 0.05, 0.9)) return false;
  return !opBuyGiftLot(p.id, gi);
}
function botAct(quiet) {
  const p = GS.pl[1 + Math.floor(Math.random() * (GS.pl.length - 1))];
  botTop(p);
  const r = Math.random();
  if (r < 0.28) botBuyPlatform(p);
  else if (r < 0.40) botList(p);
  else if (r < 0.62) botBuyMarket(p);
  else if (r < 0.92) botGift(p);
  else botGiftMarket(p);
  if (!quiet) flushBiz();
}

/* ---------- a new world: the demo players already own part of the city ---------- */
function newGame() {
  const r = mulberry32(20261108), now = new Date();
  GS = { v: 1, sig: worldSig(), d0: dayOf(now.getFullYear(), now.getMonth(), now.getDate()), min: SIM.min, wd0: SIM.wd0,
    nid: 1, gid: 1, pl: [], lots: [], gifts: [], lim: {}, feed: [], hist: [], ps: { dep: 0, sales: 0, fees: 0, gcut: 0, paid: 0 }, own: false, last: 0 };
  GS.pl.push({ id: ME, name: 'Вы', g: 'x', flag: '⭐', col: '#f2b705', bal: ECON.start, earned: 0, inc: [] });
  BOTS.forEach(([name, g, flag, col], i) => GS.pl.push({ id: i + 1, name, g, flag, col, bal: rnd500(150000 + r() * 2400000), earned: 0, inc: [] }));
  const t0 = today(), ev = [];
  GS.last = t0;
  let spent = 0, recv = 0;
  const bot = () => 1 + Math.floor(r() * BOTS.length);
  const seedLot = (pid, a, sh, fresh) => {
    const ago = fresh ? Math.floor(r() * 12) : 15 + Math.floor(r() * 680);
    const l = { id: GS.nid++, a: a.id, sh, o: pid, iss: t0 - ago, k: 0, cost: shareCost(a, sh), rent: true, ls: 0 };
    while (nextDue(l) <= t0) { l.k++; const amt = lotPay(l, l.k); P(pid).earned += amt; GS.ps.paid += amt; recv += amt; }
    GS.lots.push(l); a.lots.push(l); GS.ps.sales += l.cost; spent += l.cost;
    if (fresh) ev.push({ t: 'pbuy', p: pid, a: a.id, sh, pr: l.cost, d: l.iss });
    return l;
  };
  for (const a of ASSETS) {
    if (a.kind === 'flat') { if (r() < 0.07) seedLot(bot(), a, 100, r() < 0.06); }
    else if (a.kind === 'house') { if (r() < 0.3) seedLot(bot(), a, 100, r() < 0.15); }
    else {
      const n = a.min === 1 ? 6 : r() < 0.35 ? 0 : 1 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const av = avail(a), sh = Math.min(av, a.min * (1 + Math.floor(r() * (a.min <= 2 ? 4 : 3))));
        if (av - sh < Math.max(30, a.min)) break;
        seedLot(bot(), a, sh, r() < 0.2);
      }
    }
  }
  // offers on the market from the first minute
  const owned = GS.lots.slice();
  for (let i = 0; i < 16 && owned.length; i++) {
    const l = owned.splice(Math.floor(r() * owned.length), 1)[0];
    l.ls = rnd500(l.cost * (1.06 + r() * 0.3));
    ev.push({ t: 'list', p: l.o, a: l.a, sh: l.sh, pr: l.ls, d: t0 - Math.floor(r() * 9) });
  }
  // gifts already given, including a few copies of the limited editions
  const shops = BLD.filter(b => b.gift);
  const seedGift = (key, b) => {
    if (!b) return;
    const from = bot(); let to = bot();
    if (to === from) to = 1 + (from % BOTS.length);
    const g = GCAT[key], price = gPrice(key, b), ed = g.lim ? (GS.lim[key] = (GS.lim[key] || 0) + 1) : 0, d = t0 - Math.floor(r() * 14);
    GS.gifts.push({ id: GS.gid++, key, b: b.id, o: to, fr: from, d, pub: true, ed, orig: price, paid: price, ls: 0 });
    spent += price;
    const a = bizAsset(b.id);
    let paid = 0;
    if (a) for (const l of a.lots) { const part = Math.floor(price * ECON.owners * l.sh / 100); P(l.o).earned += part; paid += part; }
    recv += paid; GS.ps.gcut += price - paid;
    ev.push({ t: 'gift', p: from, to, key, b: b.id, pr: price, ed, d });
  };
  for (const [key, n] of [['jewel.wave', 2], ['cars.gt', 1], ['air.gold', 1], ['tech.fold', 2], ['jewel.watch', 1]]) for (let i = 0; i < n; i++) seedGift(key, giftBld(key));
  for (let i = 0; i < 24; i++) {
    const b = shops[Math.floor(r() * shops.length)], keys = bizGifts(b).filter(k => !GCAT[k].lim);
    if (keys.length) seedGift(keys[Math.floor(r() * keys.length)], b);
  }
  for (const e of ev) e.mi = Math.floor(480 + r() * 900);
  GS.feed = ev.sort((x, y) => y.d - x.d || y.mi - x.mi).slice(0, 90);
  // the money that must have come in for this world to exist
  GS.ps.dep = GS.pl.reduce((s, p) => s + p.bal, 0) + spent - recv;
}

/* ---------- save and load ----------
   The game is packed into a compact form and kept in this browser. When the page is opened inside Claude,
   it is also kept in the viewer's own private space of the artifact's database, so progress follows them
   between devices. Either store may be missing: the game then simply runs without it. */
const SAVE_V = 2;
function packGame() {
  GS.min = SIM.min; GS.wd0 = SIM.wd0; GS.own = OWNVIEW; GS.labels = SHOW_LABELS;
  return {
    v: SAVE_V, sig: GS.sig, ts: GS.ts || 0, d0: GS.d0, min: GS.min, wd0: GS.wd0, nid: GS.nid, gid: GS.gid, own: !!GS.own, labels: !!GS.labels, last: GS.last,
    pl: GS.pl.map(p => p.bal + ',' + p.earned + ',' + p.inc.map(x => x[0] + ':' + x[1]).join('|')).join(';'),
    lots: GS.lots.map(l => [l.id, l.a, l.sh, l.o, l.iss, l.k, l.cost, l.rent ? 1 : 0, l.ls].join(',')).join(';'),
    gifts: GS.gifts.map(g => [g.id, g.key, g.b, g.o, g.fr, g.d, g.pub ? 1 : 0, g.ed, g.orig, g.paid, g.ls].join(',')).join(';'),
    lim: GS.lim, ps: GS.ps, feed: GS.feed, hist: GS.hist,
  };
}
function unpackGame(s) {
  if (!s || s.v !== SAVE_V || s.sig !== worldSig() || typeof s.lots !== 'string') return null;
  const nums = str => str.split(',').map(Number);
  const g = { v: 1, sig: s.sig, ts: s.ts, d0: s.d0, min: s.min, wd0: s.wd0, nid: s.nid, gid: s.gid, own: s.own, labels: s.labels, last: s.last,
    lim: s.lim || {}, ps: s.ps, feed: s.feed || [], hist: s.hist || [], pl: [], lots: [], gifts: [] };
  const rows = s.pl.split(';');
  if (rows.length !== BOTS.length + 1) return null;
  rows.forEach((row, i) => {
    const [bal, earned, inc] = row.split(',');
    const base = i === ME ? ['Вы', 'x', '⭐', '#f2b705'] : BOTS[i - 1];
    g.pl.push({ id: i, name: base[0], g: base[1], flag: base[2], col: base[3], bal: +bal, earned: +earned, inc: inc ? inc.split('|').map(x => x.split(':').map(Number)) : [] });
  });
  if (s.lots) for (const r of s.lots.split(';')) { const [id, a, sh, o, iss, k, cost, rent, ls] = nums(r); if (!ASSETS[a]) return null; g.lots.push({ id, a, sh, o, iss, k, cost, rent: rent === 1, ls }); }
  if (s.gifts) for (const r of s.gifts.split(';')) {
    const f = r.split(',');
    if (!GCAT[f[1]]) continue;
    g.gifts.push({ id: +f[0], key: f[1], b: +f[2], o: +f[3], fr: +f[4], d: +f[5], pub: f[6] === '1', ed: +f[7], orig: +f[8], paid: +f[9], ls: +f[10] });
  }
  return g;
}
function useGame(g) {
  for (const a of ASSETS) a.lots.length = 0;
  GS = g;
  for (const l of GS.lots) ASSETS[l.a].lots.push(l);
  SIM.min = GS.min; SIM.wd0 = GS.wd0;
  OWNVIEW = !!GS.own;
  if (typeof GS.labels === 'boolean') SHOW_LABELS = GS.labels;
}
function saveGame() {
  if (!GS) return;
  GS.ts = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(packGame())); } catch (e) { /* storage may be unavailable: the game still runs */ }
}
function loadGame() {
  let s = null;
  try { const raw = localStorage.getItem(SAVE_KEY); if (raw) s = JSON.parse(raw); } catch (e) { s = null; }
  const g = unpackGame(s);
  if (!g) return false;
  useGame(g);
  return true;
}

/* the viewer's own copy in Claude: read once at start, written after your actions and at most every 45 s otherwise */
const CLOUD = { ref: null, on: false, busy: false, dirty: false, due: 0, last: 0 };
function markDirty(mine) {
  if (!CLOUD.on) return;
  const now = Date.now();
  const at = mine ? now + 2000 : Math.max(now + 2000, CLOUD.last + 45000);
  CLOUD.due = CLOUD.dirty ? Math.min(CLOUD.due, at) : at;
  CLOUD.dirty = true;
}
async function cloudSave() {
  if (!CLOUD.on || CLOUD.busy || !CLOUD.ref) return;
  CLOUD.busy = true; CLOUD.dirty = false; CLOUD.last = Date.now();
  try {
    GS.ts = Date.now();
    await CLOUD.ref.set(packGame());
  } catch (e) {
    const c = e && e.code;
    if (c === 'invalid_argument' || c === 'revoked' || c === 'not_granted' || c === 'capability_disabled' || c === 'capability_removed' || c === 'quota_exceeded') CLOUD.on = false;
    else { CLOUD.dirty = true; CLOUD.due = Date.now() + (c === 'resource_exhausted' ? 90000 : 8000); }
  }
  CLOUD.busy = false;
}
function timeout(p, ms) { return Promise.race([p, new Promise((_, no) => setTimeout(() => no({ code: 'timeout' }), ms))]); }
async function initCloud(tries) {
  try {
    const cl = window.claude;
    if (!cl || typeof cl.use !== 'function') { if ((tries || 0) < 15) setTimeout(() => initCloud((tries || 0) + 1), 300); return; }
    const [db, user] = await Promise.all([cl.use('db'), cl.use('user')]);
    if (!db || !user) return;
    const uid = await user.id();
    if (!uid) return;
    const ref = db.doc('data/users/' + uid + '/game');
    const snap = await timeout(ref.get(), 10000);
    CLOUD.ref = ref; CLOUD.on = true;
    const remote = snap && snap.exists ? unpackGame(snap.data()) : null;
    // on a device without a saved game the copy in Claude is the real progress; otherwise the newer copy wins
    if (remote && (FRESH || (remote.ts || 0) > (GS.ts || 0))) {
      useGame(remote);
      FRESH = false; CLOUD.loaded = true;
      afterLoad();
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(packGame())); } catch (e) { /* ignore */ }
      note('Ваша игра загружена', 'Сегодня в игре ' + dFull(today()) + ', на счёте ' + cpw(P(ME).bal), 'ok');
    } else cloudSave();
  } catch (e) { /* no cloud copy this time: the browser copy still works */ }
}
function afterLoad() {
  GVER++; OWN_VER = -1; FX.length = 0;
  HUD_MIN = -1; computeLight(); updateHourly();
  if (LIGHT.sa > 0) buildShadows(LIGHT.sdx, LIGHT.sdy);
  if (typeof setOwnView === 'function') setOwnView(OWNVIEW);
  WAL = -1; updateWallet();
  if (UI.open) { UI.stack = UI.stack.slice(0, 1); renderView(); }
}
let FRESH = false;
function initGame() {
  buildAssets();
  if (!loadGame()) { newGame(); FRESH = true; }
  OWNVIEW = !!GS.own;
  if (typeof GS.labels === 'boolean') SHOW_LABELS = GS.labels;
  const flush = () => { saveGame(); if (CLOUD.dirty) cloudSave(); };
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  setTimeout(() => initCloud(0), 0);
}
function resetGame() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  for (const a of ASSETS) a.lots.length = 0;
  const now = new Date();
  SIM.wd0 = now.getDay(); SIM.min = now.getHours() * 60 + now.getMinutes();
  newGame(); OWNVIEW = false; bump(); saveGame(); markDirty(true);
  HUD_MIN = -1; computeLight(); updateHourly();
}
function gameTick(dt) {
  if (!GS) return;
  const t = today();
  if (t !== GS.last) processDays(t);
  if (SIM.sp > 0 && !document.hidden) {
    BOT_T += dt;
    if (BOT_T > BOT_NEXT) { BOT_T = 0; BOT_NEXT = 14 + Math.random() * 16; botAct(false); }
  }
  if (SAVE_T > 0) { SAVE_T -= dt; if (SAVE_T <= 0) saveGame(); }
  if (CLOUD.dirty && !CLOUD.busy && Date.now() >= CLOUD.due) cloudSave();
}

/* map colours for the ownership view */
const OWN_COL = { mine: '#f2b705', mk: '#ff6b4a', av: '#1fae6a', own: '#6c63ff' };
function ownCache() {
  if (OWN_VER === GVER) return;
  OWN_VER = GVER;
  for (const b of BLD) {
    const ids = AOF[b.id];
    if (!ids || !ids.length) { OWNC[b.id] = null; continue; }
    let mine = false, mk = false, av = false;
    for (const i of ids) { const a = ASSETS[i]; if (avail(a) >= a.min) av = true; for (const l of a.lots) { if (l.o === ME) mine = true; else if (l.ls) mk = true; } }
    OWNC[b.id] = mine ? 'mine' : mk ? 'mk' : av ? 'av' : 'own';
  }
}

/* what the platform owes, for the founder's panel */
function platformBook() {
  let fut = 0;
  for (const l of GS.lots) { const a = ASSETS[l.a]; if (l.k < a.s2) fut += (a.s2 - l.k) * a.m * l.sh / 100; }
  const bal = GS.pl.reduce((s, p) => s + p.bal, 0);
  return { dep: GS.ps.dep, sales: GS.ps.sales, fees: GS.ps.fees + GS.ps.gcut, paid: GS.ps.paid, bal, fut: Math.round(fut) };
}
