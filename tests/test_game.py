"""Проверка сайта в настоящем браузере (Playwright + Chromium).

Запуск из корня репозитория:
    python3 build.py
    python3 tests/test_game.py

Нужен Python-пакет playwright и браузер: pip install playwright && playwright install chromium.
Если Chromium уже стоит в системе, укажите путь в переменной CHROME_PATH.
Скрипт открывает каждую карточку и экран, проходит игровой сценарий
(покупка, аренда, начисления, доля аэропорта, подарок, продажа, лимитированный выпуск),
проверяет правила экономики после тысяч действий демо-игроков и сохранение после перезагрузки.
"""
import asyncio
import json
import os
import pathlib
import sys

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / 'index.html').as_uri()

ALL_VIEWS = r'''() => {
  const errors = [];
  const tryit = (label, fn) => { try { fn(); } catch (e) { errors.push(label + ': ' + e.message); } };
  for (const b of BLD) tryit('b' + b.id, () => { openView({ k: 'b', id: b.id }, true); liveTick(); if (b.apts) { const v = UI.stack[0]; for (const i of [0, b.apts.length - 1]) { v.apt = i; refreshApt(v); } } });
  for (let i = 0; i < PPL.length; i += 97) tryit('p' + i, () => openView({ k: 'p', id: i }, true));
  for (const q of ['', 'улов', 'zz']) for (const c of ['', 'cafe', 'home', 'muni']) tryit('dir', () => openView({ k: 'dir', q, cat: c }, true));
  for (const k of ['city', 'me', 'rich', 'feed']) tryit(k, () => { openView({ k }, true); liveTick(); });
  for (const t of ['d', 'a']) tryit('board', () => openView({ k: 'board', tab: t }, true));
  for (const t of ['pl', 'plat', 'gifts']) tryit('market ' + t, () => openView({ k: 'market', tab: t }, true));
  for (const f of ['flat', 'elite', 'house', 'biz', 'big']) tryit('market ' + f, () => openView({ k: 'market', tab: 'plat', f }, true));
  for (const p of GS.pl) tryit('player', () => openView({ k: 'player', id: p.id }, true));
  for (const b of BLD) for (const k of bizGifts(b)) tryit('gift ' + k, () => openView({ k: 'gift', key: k, bid: b.id, to: null, pub: true }, true));
  for (const e of GS.feed) tryit('feed ' + e.t, () => feedRow(e));
  closeSheet();
  return { errors, assets: ASSETS.length, lots: GS.lots.length };
}'''

FLOW = r'''() => {
  const log = [], errors = [];
  const click = sel => { const el = UI.body.querySelector(sel); if (!el) throw new Error('нет кнопки ' + sel); el.click(); };
  const expect = (ok, what) => { if (!ok) errors.push(what); };
  try {
    const flat = ASSETS.filter(a => a.kind === 'flat' && !a.lots.length).sort((x, y) => x.price - y.price)[0];
    const bal0 = P(ME).bal;
    openView({ k: 'b', id: flat.b, apt: flat.apt }, true);
    click(`[data-go="buy:${flat.id}:100"]`);
    const l = flat.lots[0];
    expect(l && l.o === ME && P(ME).bal === bal0 - flat.price, 'покупка квартиры');
    expect(l && !l.rent, 'новая квартира не сдана');
    const b1 = P(ME).bal; skipMonth();
    expect(P(ME).bal === b1, 'без аренды начисления нет');
    openView({ k: 'b', id: flat.b, apt: flat.apt }, true);
    click(`[data-go="rent:${l.id}"]`);
    const b2 = P(ME).bal; skipMonth();
    expect(P(ME).bal - b2 >= flat.m, 'начисление после аренды');
    const air = bizAsset(TERMINAL_ID);
    opTopUp(); opTopUp();
    openView({ k: 'b', id: TERMINAL_ID }, true);
    click(`[data-go="buy:${air.id}:1"]`);
    expect(air.lots.some(x => x.o === ME && x.sh === 1), 'доля 1% аэропорта');
    const jb = BLD.find(b => b.gift === 'jewel');
    openView({ k: 'gift', key: 'jewel.diamond', bid: jb.id, to: null, pub: true }, true);
    click('[data-go="to:2"]'); click('[data-go="gbuy"]');
    expect(GS.gifts.some(g => g.key === 'jewel.diamond' && g.o === 2 && g.fr === ME), 'подарок игроку');
    openView({ k: 'b', id: flat.b, apt: flat.apt }, true);
    click(`[data-go="sellv:${l.id}"]`);
    UI.body.querySelector('#lsPrice').value = String(flat.price);
    click(`[data-go="list:${l.id}"]`);
    let tries = 0; const k0 = l.k, iss0 = l.iss;
    while (l.o === ME && tries < 600) { botAct(true); tries++; }
    expect(l.o !== ME, 'демо-игрок купил выставленную квартиру');
    expect(l.k === k0 && l.iss === iss0, 'график начислений сохраняется при перепродаже');
    const key = 'jewel.wave', before = GS.lim[key] || 0;
    if (before < GCAT[key].lim) { opTopUp(); expect(!opBuyGift(ME, key, jb.id, ME, true) && GS.lim[key] === before + 1, 'лимитированный выпуск'); }
    log.push('продано после ' + tries + ' действий ботов, дата ' + dFull(today()));
  } catch (e) { errors.push(e.message); }
  return { log, errors };
}'''

INVARIANTS = r'''() => {
  const bad = [];
  for (let i = 0; i < 3000; i++) botAct(true);
  for (let m = 0; m < 24; m++) skipMonth();
  for (const a of ASSETS) {
    const s = a.lots.reduce((x, l) => x + l.sh, 0);
    if (s > 100) bad.push('больше 100% у ' + a.code);
    for (const l of a.lots) if (l.sh % a.min) bad.push('шаг доли у ' + a.code);
  }
  for (const p of GS.pl) if (p.bal < 0) bad.push('минус на балансе у ' + p.name);
  for (const k in GS.lim) if (GS.lim[k] > GCAT[k].lim) bad.push('лимит ' + k);
  for (const g of GS.gifts) if (g.ls && !GCAT[g.key].lim && g.ls > g.orig) bad.push('подарок дороже цены покупки');
  saveGame();
  const size = (localStorage.getItem(SAVE_KEY) || '').length;
  if (size > 200000) bad.push('сохранение слишком большое: ' + size);
  return { bad: bad.slice(0, 20), size, bal: P(ME).bal, lots: myLots(ME).length };
}'''


async def main():
    failures = []
    async with async_playwright() as p:
        kw = {'args': ['--no-sandbox']}
        if os.environ.get('CHROME_PATH'):
            kw['executable_path'] = os.environ['CHROME_PATH']
        br = await p.chromium.launch(**kw)
        ctx = await br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        page_errors = []
        page.on('pageerror', lambda e: page_errors.append(str(e)))
        await page.route('**/fonts.googleapis.com/**', lambda r: r.abort())
        await page.goto(URL)
        await page.wait_for_timeout(1500)
        views = await page.evaluate(ALL_VIEWS)
        print('экраны:', json.dumps({k: v for k, v in views.items() if k != 'errors'}, ensure_ascii=False))
        failures += views['errors']
        flow = await page.evaluate(FLOW)
        print('сценарий:', '; '.join(flow['log']))
        failures += flow['errors']
        inv = await page.evaluate(INVARIANTS)
        print('правила экономики:', json.dumps({k: v for k, v in inv.items() if k != 'bad'}, ensure_ascii=False))
        failures += inv['bad']
        await page.wait_for_timeout(1500)
        await page.reload()
        await page.wait_for_timeout(1500)
        after = await page.evaluate("() => ({ bal: P(ME).bal, lots: myLots(ME).length })")
        if after != {'bal': inv['bal'], 'lots': inv['lots']}:
            failures.append('после перезагрузки прогресс другой: ' + json.dumps(after))
        failures += ['ошибка на странице: ' + e for e in page_errors]
        await br.close()
    if failures:
        print('НЕ ПРОЙДЕНО:')
        for f in failures:
            print(' -', f)
        sys.exit(1)
    print('Все проверки пройдены')


asyncio.run(main())
