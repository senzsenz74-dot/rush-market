/* RUSH MARKET — весь сайт: каталог, вход через Steam, покупка, продажа, профиль. Сервер — функция rush-market и таблицы mk_* (supabase/market_site.sql). */
'use strict';
const SB_URL = 'https://gkeexoyrxnsarosymdyp.supabase.co', SB_KEY = 'sb_publishable_oczOEZFsdpzmwq8FB4Of_Q_A_JSZ3zt'; // публичный ключ — ему место в коде
const FN = SB_URL + '/functions/v1/rush-market';
const PRICES_URL = SB_URL + '/storage/v1/object/public/market/prices.json';
const sb = supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, storageKey: 'rush-market-auth' } });

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rub = v => (Math.round(+v * 100) / 100).toLocaleString('ru-RU', { maximumFractionDigits: v >= 1000 ? 0 : 2 }) + ' ₽';
const toast = (t, bad) => { const el = document.createElement('div'); el.className = 'toast' + (bad ? ' bad' : ''); el.textContent = t; $('#toasts').append(el); setTimeout(() => el.remove(), 4500); };
const IMG = (h, size = '256fx192f') => h ? `https://community.steamstatic.com/economy/image/${h}/${size}` : '';

// ---------- каталог ----------
const WEAR_EN = { FN: 'Factory New', MW: 'Minimal Wear', FT: 'Field-Tested', WW: 'Well-Worn', BS: 'Battle-Scarred' };
const WEAR_RU = { FN: 'Прямо с завода', MW: 'Немного поношенное', FT: 'После полевых', WW: 'Поношенное', BS: 'Закалённое в боях', '': 'Без износа' };
const CATS = { skin: 'Оружие', knife: 'Ножи', gloves: 'Перчатки', agent: 'Агенты', sticker: 'Наклейки', charm: 'Брелоки', patch: 'Нашивки', graffiti: 'Граффити', music: 'Музыка', pin: 'Значки' };
const RARS = { covert: 'Тайное', classified: 'Засекреченное', restricted: 'Запрещённое', milspec: 'Армейское', uncommon: 'Промышленное', common: 'Ширпотреб', rare: '★ Редкое', contraband: 'Контрабанда' };
const QUAL = { '': 'Обычный', st: 'StatTrak™', sv: 'Сувенир' };
const unImg = s => { const m = /^~(\d+)~/.exec(s || ''); return m ? CATP[+m[1]] + s.slice(m[0].length) : s; };
const ITEMS = CAT.map((e, i) => ({ i, n: e[0], b: e[1] || e[0], r: e[2], c: e[3], img: unImg(e[4]), wears: e[5] ? e[5].split(',') : [], ref: e[6] }));

let PR = null, PR_T = 0;     // цены market.csgo {hash: ₽}
let ST = { buy: false, sell: false, deposit: false, fee: 10, minBuy: 5, minDep: 100, sellRate: 0 }; // что включено на сервере
let ME = null, WALLET = null; // пользователь, кошелёк маркета

function variants(it) {
  const out = [], star = it.b.startsWith('★ ');
  const wears = it.wears.length ? it.wears : [''];
  const extra = it.wears.length && (it.c === 'knife' || it.c === 'gloves') ? [''] : []; // «ванильные» ножи — без износа
  for (const q of ['', 'st', 'sv']) {
    if (q && !['skin', 'knife'].includes(it.c)) continue;
    for (const w of [...wears, ...extra]) {
      let h = it.b;
      if (q === 'st') h = star ? '★ StatTrak™ ' + it.b.slice(2) : 'StatTrak™ ' + it.b;
      if (q === 'sv') h = 'Souvenir ' + it.b;
      if (w) h += ` (${WEAR_EN[w]})`;
      const p = PR ? PR[h] : null;
      if (p || (!q && PR == null)) out.push({ h, q, w, p: p ? sitePrice(p) : null });
    }
  }
  return out;
}
const sitePrice = p => Math.max(ST.minBuy, Math.ceil(p * (1 + ST.fee / 100)));
function indexPrices() {
  for (const it of ITEMS) {
    const v = variants(it), norm = v.filter(x => !x.q && x.p), any = v.filter(x => x.p);
    it.v = v;
    it.p = norm.length ? Math.min(...norm.map(x => x.p)) : any.length ? Math.min(...any.map(x => x.p)) : null;
    it.st = v.some(x => x.q === 'st' && x.p);
    it.sv = v.some(x => x.q === 'sv' && x.p);
    it.s = (it.n + ' ' + it.b).toLowerCase();
  }
}
async function loadPrices() {
  const urls = location.hostname === 'localhost' ? [PRICES_URL, 'data/prices.dev.json'] : [PRICES_URL];
  for (const u of urls) {
    try {
      const r = await fetch(u + '?t=' + Math.floor(Date.now() / 300e3));
      if (!r.ok) continue;
      const j = await r.json();
      PR = j.p || Object.fromEntries((j.items || []).map(x => [x.market_hash_name, +x.price])); PR_T = j.t || j.time * 1000 || Date.now();
      break;
    } catch (_) { /* следующий источник */ }
  }
  if (!PR) PR = {};
  indexPrices();
}

// ---------- сервер ----------
async function api(action, body) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch(FN + '?action=' + action, { method: 'POST', headers: { 'content-type': 'application/json', apikey: SB_KEY, authorization: 'Bearer ' + (session?.access_token || SB_KEY) }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({ error: 'сервер недоступен' }));
  if (!r.ok) { const e = new Error(j.error || 'ошибка'); e.data = j; e.status = r.status; throw e; }
  return j;
}
async function loadMe() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { ME = null; WALLET = null; return; }
  const { data: prof } = await sb.from('profiles').select('name, ava, steamid').eq('id', session.user.id).maybeSingle();
  ME = { id: session.user.id, name: prof?.name || session.user.user_metadata?.nick || 'Игрок', ava: prof?.ava || session.user.user_metadata?.avatar || '', steamid: prof?.steamid };
  const { data: w } = await sb.rpc('mk_me');
  WALLET = w || { balance: 0, trade: null, admin: false };
}
function login() { location.href = FN + '?action=login&ret=' + encodeURIComponent(location.origin + location.pathname); }
async function logout() { await sb.auth.signOut(); ME = null; WALLET = null; drawMe(); go('#/'); }

function drawMe() {
  const el = $('#me');
  if (!ME) { el.innerHTML = `<button class="btn btn-steam btn-sm" onclick="login()">${steamIco}<span>Войти через Steam</span></button>`; return; }
  el.innerHTML = `<div class="bal">${rub(WALLET?.balance || 0)}<button class="plus" title="Пополнить" onclick="openDeposit()">+</button></div>
    <a href="#/profile"><img class="ava" src="${esc(ME.ava) || 'data:image/gif;base64,R0lGODlhAQABAAAAACw='}" alt="Профиль"></a>`;
}
const steamIco = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-9.96 9.04l5.35 2.21a2.8 2.8 0 0 1 1.6-.5l2.39-3.46v-.05a3.79 3.79 0 1 1 3.79 3.79h-.09l-3.4 2.43a2.84 2.84 0 0 1-5.62.56L2.3 14.4A10 10 0 1 0 12 2zm-4.3 15.2l-1.23-.5a2.13 2.13 0 1 0 1.16-2.9l1.27.53a1.57 1.57 0 1 1-1.2 2.9zm9.47-7.4a2.52 2.52 0 1 0-2.52 2.52 2.53 2.53 0 0 0 2.52-2.52zm-4.41 0a1.9 1.9 0 1 1 1.9 1.9 1.9 1.9 0 0 1-1.9-1.9z"/></svg>';

// ---------- окна ----------
function modal(html) { const m = $('#modal'); m.innerHTML = `<div class="mbox glass"><button class="x" onclick="closeModal()" aria-label="Закрыть">×</button>${html}</div>`; m.hidden = false; }
function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function openDeposit() {
  if (!ME) return login();
  if (!ST.deposit) {
    modal(`<h3>Пополнение баланса <span class="soon">скоро</span></h3>
      <p class="muted">Пополнение рублями (СБП и карта) подключаем — касса для RUSH MARKET ещё оформляется. Как только заработает, кнопка оплаты появится здесь.</p>
      <p class="muted">Уже сейчас баланс можно пополнить, <b>продав свои скины</b>${ST.sell ? '' : ' (тоже скоро)'}.</p>
      ${ST.sell ? '<a class="btn btn-gold" href="#/sell" onclick="closeModal()">Продать скины</a>' : ''}`);
    return;
  }
  const a = [500, 1000, 2500, 5000];
  modal(`<h3>Пополнение баланса</h3>
    <p class="muted">Деньги зачисляются на баланс маркета после подтверждения оплаты кассой. Баланс тратится на покупку скинов.</p>
    <label class="muted">Сумма, ₽ (от ${ST.minDep})</label>
    <input id="depAmt" class="inp" type="number" inputmode="numeric" min="${ST.minDep}" value="1000">
    <div class="amts">${a.map(x => `<button class="chip" onclick="$('#depAmt').value=${x}">${x.toLocaleString('ru-RU')} ₽</button>`).join('')}</div>
    ${ST.provider === 'fk' ? `<button class="btn btn-gold" style="width:100%" onclick="payStart('sbp',this)">Перейти к оплате</button><p class="note">Способ оплаты выберете на странице FreeKassa.</p>` : `<div class="row2"><button class="btn btn-gold" onclick="payStart('sbp',this)">СБП</button><button class="btn btn-glass" onclick="payStart('card',this)">Карта</button></div>`}`);
}
async function payStart(method, btn) {
  const amount = Math.round(+$('#depAmt').value);
  btn.disabled = true;
  try { const r = await api('deposit', { amount, method }); location.href = r.url; }
  catch (e) { toast(e.message, true); btn.disabled = false; }
}

// ---------- роутер ----------
const ROUTES = { '': pageHome, market: pageMarket, item: pageItem, sell: pageSell, profile: pageProfile, faq: pageFaq, terms: pageTerms, refund: pageRefund, contacts: pageContacts, admin: pageAdmin };
function go(h) { if (location.hash === h) route(); else location.hash = h; }
function route() {
  const [path] = location.hash.replace(/^#\/?/, '').split('?');
  const [name, arg] = path.split('/');
  const fn = ROUTES[name] || pageHome;
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === (name || 'home')));
  const v = $('#view'); v.style.animation = 'none'; void v.offsetWidth; v.style.animation = '';
  fn(v, arg ? decodeURIComponent(arg) : '');
  scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

// ---------- главная ----------
function pageHome(v) {
  const top = ITEMS.filter(x => x.p && x.p > 3000 && x.img).sort((a, b) => b.p - a.p);
  const pick = [top[3], top[12], top[25]].filter(Boolean);
  const pop = ITEMS.filter(x => x.p && x.img && x.c !== 'sticker' && x.c !== 'graffiti' && x.p > 300 && x.p < 60000).sort((a, b) => (b.i * 7919 % 101) - (a.i * 7919 % 101)).slice(0, 12);
  const onSale = ITEMS.filter(x => x.p).length;
  v.innerHTML = `
  <section class="hero">
    <div>
      <span class="soon" style="margin-bottom:14px">CS2 · вход через Steam</span>
      <h1>Скины CS2 —<br><span class="gold">купить и продать</span><br>за пару минут</h1>
      <p>Выбираете скин, оплачиваете с баланса — предмет приходит обменом в ваш Steam. Ненужные скины продаёте и получаете деньги на баланс.</p>
      <div class="hero-cta">
        <a class="btn btn-gold btn-lg" href="#/market">Открыть маркет</a>
        <a class="btn btn-glass btn-lg" href="#/sell">Продать скины</a>
      </div>
    </div>
    <div class="hero-art">${pick.map(x => `<a class="card3 glass" href="#/item/${x.i}" style="--rc:var(--c-${x.r})"><img src="${IMG(x.img, '360fx270f')}" alt=""><b>${esc(x.n)}</b><span class="gold" style="font-weight:800">${rub(x.p)}</span></a>`).join('')}</div>
  </section>
  <section class="stats">
    <div class="stat glass"><b class="gold">${onSale ? onSale.toLocaleString('ru-RU') : '—'}</b><span>предметов в продаже сейчас</span></div>
    <div class="stat glass"><b>Steam</b><span>вход и выдача обменом</span></div>
    <div class="stat glass"><b>${ST.fee}%</b><span>комиссия маркета</span></div>
    <div class="stat glass"><b>24/7</b><span>покупка автоматически</span></div>
  </section>
  <section class="steps">
    <div class="step glass"><i>1</i><h3>Войдите через Steam</h3><p>Без паролей: вход через официальную страницу Steam. Укажите трейд-ссылку в профиле.</p></div>
    <div class="step glass"><i>2</i><h3>Выберите скин</h3><p>Цены обновляются каждые 15 минут по рынку. Перед покупкой цену проверяем ещё раз.</p></div>
    <div class="step glass"><i>3</i><h3>Примите обмен</h3><p>Скин придёт предложением обмена в Steam. Не дошёл — деньги автоматически вернутся на баланс.</p></div>
  </section>
  <div class="sec-h"><h2>Сейчас в продаже</h2><a class="btn btn-glass btn-sm" href="#/market">Весь каталог →</a></div>
  <div class="items">${pop.length ? pop.map(card).join('') : Array(6).fill('<div class="skel"></div>').join('')}</div>`;
}

// ---------- каталог ----------
const F = { q: '', cat: '', rar: '', min: '', max: '', st: false, avail: true, sort: 'pop', n: 60 };
function card(x) {
  const off = !x.p;
  return `<a class="it${off ? ' off' : ''}" href="#/item/${x.i}" style="--rc:var(--c-${x.r},#666)">
    ${x.st ? '<span class="tag st">ST</span>' : ''}
    <img loading="lazy" src="${IMG(x.img)}" alt="" onerror="this.style.visibility='hidden'">
    <div class="nm">${esc(x.n)}</div>
    <div class="pr">${off ? '<b>Нет в продаже</b>' : `<b>${rub(x.p)}</b>${x.v.filter(y => y.p).length > 1 ? '<small>от</small>' : ''}`}</div>
  </a>`;
}
function filtered() {
  const q = F.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const min = +F.min || 0, max = +F.max || Infinity;
  let r = ITEMS.filter(x => (!F.cat || x.c === F.cat) && (!F.rar || x.r === F.rar) && (!F.avail || x.p) && (!F.st || x.st)
    && (!q.length || q.every(w => x.s.includes(w))) && (!x.p || (x.p >= min && x.p <= max)));
  const pp = x => x.p ?? Infinity;
  if (F.sort === 'cheap') r.sort((a, b) => pp(a) - pp(b));
  else if (F.sort === 'exp') r.sort((a, b) => (b.p || 0) - (a.p || 0));
  else if (F.sort === 'name') r.sort((a, b) => a.n.localeCompare(b.n));
  else r.sort((a, b) => (!!b.p - !!a.p) || ((['knife', 'gloves', 'skin'].indexOf(b.c) + 1) - (['knife', 'gloves', 'skin'].indexOf(a.c) + 1)) || (b.p || 0) - (a.p || 0));
  return r;
}
function pageMarket(v) {
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  if (qs.has('cat')) F.cat = qs.get('cat');
  const chip = (k, val, label, dot) => `<button class="chip${F[k] === val ? ' on' : ''}" data-k="${k}" data-v="${val}">${dot ? `<span class="dot" style="background:var(--c-${val})"></span>` : ''}${label}</button>`;
  v.innerHTML = `
  <div class="mk">
    <aside class="filters glass" id="filters">
      <div><h4>Категория</h4><div class="chips">${chip('cat', '', 'Все')}${Object.entries(CATS).map(([k, l]) => chip('cat', k, l)).join('')}</div></div>
      <div><h4>Редкость</h4><div class="chips">${chip('rar', '', 'Любая')}${Object.entries(RARS).filter(([k]) => k !== 'contraband').map(([k, l]) => chip('rar', k, l, 1)).join('')}</div></div>
      <div><h4>Цена, ₽</h4><div class="row2"><input class="inp" id="fMin" type="number" inputmode="numeric" placeholder="от" value="${esc(F.min)}"><input class="inp" id="fMax" type="number" inputmode="numeric" placeholder="до" value="${esc(F.max)}"></div></div>
      <label class="check"><input type="checkbox" id="fAvail" ${F.avail ? 'checked' : ''}> Только в продаже</label>
      <label class="check"><input type="checkbox" id="fSt" ${F.st ? 'checked' : ''}> Есть StatTrak™</label>
      <button class="btn btn-glass f-btn" onclick="$('#filters').classList.remove('open')">Показать</button>
    </aside>
    <section>
      <div class="toolbar">
        <div class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input class="inp" id="fQ" placeholder="Поиск: AK-47, Karambit, Asiimov…" value="${esc(F.q)}" autocomplete="off"></div>
        <select class="inp" id="fSort"><option value="pop">Сначала популярные</option><option value="cheap">Сначала дешёвые</option><option value="exp">Сначала дорогие</option><option value="name">По названию</option></select>
        <button class="btn btn-glass f-btn" onclick="$('#filters').classList.add('open')">Фильтры</button>
      </div>
      ${PR && !Object.keys(PR).length ? `<div class="glass pad" style="margin-bottom:14px">Цены с рынка ещё не загрузились — обычно это занимает до минуты после запуска маркета. Каталог виден, покупка появится вместе с ценами.</div>` : ''}
      <div class="count" id="cnt"></div>
      <div class="items" id="grid"></div>
      <div class="more"><button class="btn btn-glass" id="moreBtn">Показать ещё</button></div>
    </section>
  </div>`;
  $('#fSort').value = F.sort;
  const draw = (keep) => {
    if (!keep) F.n = 60;
    if (PR == null) { $('#cnt').textContent = 'Загружаем цены…'; $('#grid').innerHTML = Array(12).fill('<div class="skel"></div>').join(''); $('#moreBtn').style.display = 'none'; return; }
    const r = filtered();
    $('#cnt').textContent = `Найдено: ${r.length.toLocaleString('ru-RU')}`;
    $('#grid').innerHTML = r.length ? r.slice(0, F.n).map(card).join('') : '<div class="empty" style="grid-column:1/-1">Ничего не нашлось. Попробуйте другое название или снимите фильтры.</div>';
    $('#moreBtn').style.display = r.length > F.n ? '' : 'none';
  };
  v.querySelectorAll('.chip[data-k]').forEach(b => b.onclick = () => { F[b.dataset.k] = b.dataset.v; v.querySelectorAll(`.chip[data-k="${b.dataset.k}"]`).forEach(c => c.classList.toggle('on', c === b)); draw(); });
  let t; $('#fQ').oninput = e => { clearTimeout(t); t = setTimeout(() => { F.q = e.target.value; draw(); }, 150); };
  $('#fSort').onchange = e => { F.sort = e.target.value; draw(); };
  $('#fMin').oninput = e => { F.min = e.target.value; draw(); };
  $('#fMax').oninput = e => { F.max = e.target.value; draw(); };
  $('#fAvail').onchange = e => { F.avail = e.target.checked; draw(); };
  $('#fSt').onchange = e => { F.st = e.target.checked; draw(); };
  $('#moreBtn').onclick = () => { F.n += 60; draw(true); };
  draw(true);
}

// ---------- карточка предмета ----------
let SEL = null;
function pageItem(v, id) {
  const x = ITEMS[+id];
  if (!x) return go('#/market');
  const vs = x.v.filter(y => y.p);
  const norm = vs.filter(y => !y.q);
  SEL = (norm.length ? norm : vs).reduce((a, y) => !a || y.p < a.p ? y : a, null);
  const vbtn = y => `<button class="var${SEL === y ? ' on' : ''}" data-h="${esc(y.h)}"><small>${QUAL[y.q]}${y.w || y.q ? ' · ' : ''}${WEAR_RU[y.w] && y.w ? WEAR_RU[y.w] : ''}</small><b>${rub(y.p)}</b></button>`;
  v.innerHTML = `
  <a href="#/market" class="btn btn-glass btn-sm" style="margin-bottom:16px">← Каталог</a>
  <div class="item-page" style="--rc:var(--c-${x.r},#666)">
    <div class="item-art glass"><img src="${IMG(x.img, '512fx384f')}" alt="${esc(x.n)}"></div>
    <div>
      <span class="rar">${RARS[x.r] || ''} · ${CATS[x.c] || ''}</span>
      <h1 style="font-size:clamp(22px,3vw,32px);margin-top:10px">${esc(x.n)}</h1>
      ${x.b !== x.n ? `<div class="muted">${esc(x.b)}</div>` : ''}
      ${vs.length ? `<div class="vars">${vs.map(vbtn).join('')}</div>` : `<div class="glass pad" style="margin:16px 0">Сейчас этого предмета нет в продаже на рынке. Загляните позже — цены обновляются каждые 15 минут.</div>`}
      <div class="buybox glass" id="buybox"></div>
    </div>
  </div>`;
  v.querySelectorAll('.var').forEach(b => b.onclick = () => { SEL = vs.find(y => y.h === b.dataset.h); v.querySelectorAll('.var').forEach(c => c.classList.toggle('on', c === b)); drawBuy(x); });
  drawBuy(x);
}
function drawBuy(x) {
  const b = $('#buybox'); if (!b) return;
  if (!SEL) { b.innerHTML = `<div class="muted">Нет в продаже</div>`; return; }
  const can = ST.buy && ME;
  b.innerHTML = `
    <div class="muted" style="font-size:13px">${esc(SEL.h)}</div>
    <div class="big gold">${rub(SEL.p)}</div>
    ${!ST.buy ? '<p class="note"><span class="soon">скоро</span> Покупка подключается — каталог и цены уже настоящие.</p>' : ''}
    <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
      ${ME ? `<button class="btn btn-gold btn-lg" ${can ? '' : 'disabled'} onclick="buyAsk(${x.i})">Купить</button>` : `<button class="btn btn-steam btn-lg" onclick="login()">${steamIco} Войти, чтобы купить</button>`}
    </div>
    <p class="note">Скин придёт <b>предложением обмена в Steam</b> от продавца market.csgo, обычно за 1–15 минут. Если обмен не пришёл или не принят — <b>деньги автоматически вернутся</b> на баланс.<br>Нужны: открытый инвентарь Steam, мобильный аутентификатор, трейд-ссылка в профиле.</p>`;
}
function buyAsk(i) {
  const x = ITEMS[i];
  if (!WALLET?.trade) { modal(`<h3>Нужна трейд-ссылка</h3><p class="muted">Без неё мы не сможем отправить скин. Её можно взять в Steam: Инвентарь → Предложения обмена → «Кто может отправлять мне предложения обмена?».</p>${tradeForm()}`); bindTrade(() => buyAsk(i)); return; }
  if ((WALLET.balance || 0) < SEL.p) { modal(`<h3>Не хватает денег</h3><p class="muted">На балансе ${rub(WALLET.balance)}, а скин стоит ${rub(SEL.p)}.</p><button class="btn btn-gold" onclick="openDeposit()">Пополнить</button>${ST.sell ? ' <a class="btn btn-glass" href="#/sell" onclick="closeModal()">Продать скины</a>' : ''}`); return; }
  modal(`<h3>Купить скин?</h3>
    <div class="li" style="margin:12px 0"><img src="${IMG(x.img)}" alt=""><div class="t"><b>${esc(x.n)}</b><small>${esc(SEL.h)}</small></div><div class="s gold">${rub(SEL.p)}</div></div>
    <p class="muted" style="font-size:13px">Перед покупкой проверим цену на рынке ещё раз. Если она выросла, покажем новую — ничего не спишем без вашего согласия.</p>
    <button class="btn btn-gold btn-lg" style="width:100%" id="buyGo">Купить за ${rub(SEL.p)}</button>`);
  $('#buyGo').onclick = () => buyGo(i, SEL.p);
}
async function buyGo(i, price) {
  const x = ITEMS[i], btn = $('#buyGo');
  btn.disabled = true; btn.textContent = 'Покупаем…';
  try {
    await api('buy', { h: SEL.h, price, name: x.n, img: x.img });
    closeModal(); toast('Готово! Скин покупается — ждите обмен в Steam. Статус — в профиле.');
    await loadMe(); drawMe(); go('#/profile');
  } catch (e) {
    if (e.data?.error === 'price') {
      btn.disabled = false; btn.textContent = `Купить за ${rub(e.data.price)} (цена изменилась)`;
      btn.onclick = () => buyGo(i, e.data.price);
      return;
    }
    closeModal(); toast(e.message, true); await loadMe(); drawMe();
  }
}
const tradeForm = () => `<input class="inp" id="tradeInp" placeholder="https://steamcommunity.com/tradeoffer/new/?partner=…&token=…" value="${esc(WALLET?.trade || '')}">
  <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap"><button class="btn btn-gold btn-sm" id="tradeSave">Сохранить</button>
  <a class="btn btn-glass btn-sm" target="_blank" rel="noopener" href="https://steamcommunity.com/${ME?.steamid ? 'profiles/' + ME.steamid : 'my'}/tradeoffers/privacy#trade_offer_access_url">Где взять ссылку ↗</a></div>`;
function bindTrade(after) {
  $('#tradeSave').onclick = async () => {
    const t = $('#tradeInp').value.trim();
    const { error } = await sb.rpc('mk_set_trade', { p_trade: t });
    if (error) return toast('Ссылка не подходит. Нужен вид https://steamcommunity.com/tradeoffer/new/?partner=…&token=…', true);
    WALLET.trade = t; toast('Трейд-ссылка сохранена'); closeModal(); if (after) after(); else route();
  };
}

// ---------- продажа ----------
function pageSell(v) {
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  if (qs.get('sell') === 'fail') toast('Продажа не завершена. Попробуйте ещё раз.', true);
  v.innerHTML = `
  <h1>Продать скины <span class="gold">CS2</span></h1>
  <div class="sell-hero">
    <div class="glass pad">
      ${ST.sell ? `<p class="muted">Курс сейчас</p><div class="big-num gold">${rub(ST.sellRate)} <span class="muted" style="font-size:18px">за 1 $</span></div>
        <p class="muted">Стоимость скинов считает Skinslink по рынку в долларах; вы видите сумму в рублях ещё до обмена. Комиссия маркета ${ST.fee}% уже учтена в курсе.</p>`
      : `<p><span class="soon">скоро</span></p><p class="muted">Продажа скинов подключается. Как только заработает, здесь появится кнопка и курс.</p>`}
      <div style="margin-top:18px">${!ME ? `<button class="btn btn-steam btn-lg" onclick="login()">${steamIco} Войти через Steam</button>` : `<button class="btn btn-gold btn-lg" id="sellBtn" ${ST.sell ? '' : 'disabled'}>Выбрать скины для продажи</button>`}</div>
    </div>
    <div class="glass pad">
      <h3>Как это работает</h3>
      <ul class="ul">
        <li>Откроется страница партнёра Skinslink — выберите скины из инвентаря Steam.</li>
        <li>Подтвердите обмен в Steam (мобильный аутентификатор).</li>
        <li>Steam держит проданный скин 7 дней — в это время обмен можно откатить. Поэтому деньги приходят на баланс <b>через 7 дней</b>, после повторной проверки.</li>
        <li>Статус продажи — в профиле, вкладка «Продажи».</li>
        <li>Деньги с баланса тратятся на покупку скинов. Вывод рублей на карту — <span class="soon">скоро</span>.</li>
      </ul>
    </div>
  </div>`;
  const b = $('#sellBtn');
  if (b) b.onclick = async () => { b.disabled = true; try { location.href = (await api('sell')).url; } catch (e) { toast(e.message, true); b.disabled = false; } };
}

// ---------- профиль ----------
const OST = { buying: ['Покупаем', 'st-wait'], sent: ['Обмен отправлен — примите в Steam', 'st-wait'], prot: ['Обмен принят, идёт защита Steam', 'st-wait'], done: ['Получен', 'st-ok'], wait: ['Проверяем вручную', 'st-wait'], refunded: ['Деньги возвращены', 'st-bad'], fail: ['Не удалось', 'st-bad'] };
const SST = { new: ['Ждём обмен', 'st-wait'], hold: ['7 дней проверки', 'st-wait'], done: ['Зачислено', 'st-ok'], fail: ['Отменено', 'st-bad'] };
const DST = { new: ['Ждём оплату', 'st-wait'], paid: ['Зачислено', 'st-ok'], fail: ['Не оплачено', 'st-bad'] };
let PTAB = 'orders';
async function pageProfile(v) {
  if (!ME) { v.innerHTML = `<div class="glass pad" style="max-width:520px;margin:40px auto;text-align:center"><h2>Профиль</h2><p class="muted">Войдите через Steam, чтобы покупать и продавать скины.</p><button class="btn btn-steam btn-lg" onclick="login()">${steamIco} Войти через Steam</button></div>`; return; }
  await loadMe(); drawMe();
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  if (qs.get('sell') === 'ok') toast('Обмен отправлен! Деньги придут после 7 дней проверки.');
  v.innerHTML = `
  <div class="glass pad prof-head">
    <img src="${esc(ME.ava)}" alt="" onerror="this.style.visibility='hidden'">
    <div><h2 style="margin:0">${esc(ME.name)}</h2><span class="muted">${ME.steamid ? 'Steam ID ' + esc(ME.steamid) : ''}</span></div>
    <div class="prof-bal"><span class="muted">Баланс маркета</span><b class="gold">${rub(WALLET.balance)}</b>
      <div style="display:flex;gap:8px;justify-content:inherit;flex-wrap:wrap;margin-top:8px"><button class="btn btn-gold btn-sm" onclick="openDeposit()">Пополнить</button><button class="btn btn-glass btn-sm" onclick="cashOut()">Вывести</button></div></div>
  </div>
  <div class="glass pad" style="margin-top:14px"><h3 style="font-size:15px">Трейд-ссылка Steam</h3>${tradeForm()}</div>
  <div class="tabs">${[['orders', 'Покупки'], ['sales', 'Продажи'], ['deps', 'Пополнения'], ['ledger', 'История баланса']].map(([k, l]) => `<button class="chip${PTAB === k ? ' on' : ''}" data-t="${k}">${l}</button>`).join('')}
    ${WALLET.admin ? '<a class="chip" href="#/admin">Админка</a>' : ''}<button class="chip" onclick="logout()">Выйти</button></div>
  <div class="list" id="plist"><div class="skel" style="height:70px"></div></div>`;
  bindTrade();
  v.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { PTAB = b.dataset.t; v.querySelectorAll('[data-t]').forEach(c => c.classList.toggle('on', c === b)); drawList(); });
  drawList();
}
const dt = s => new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
async function drawList() {
  const el = $('#plist'); if (!el) return;
  const T = { orders: 'mk_orders', sales: 'mk_sales', deps: 'mk_deposits', ledger: 'mk_ledger' }[PTAB];
  const { data, error } = await sb.from(T).select('*').eq('uid', ME.id).order('created_at', { ascending: false }).limit(50);
  if (error) { el.innerHTML = '<div class="empty">Не удалось загрузить</div>'; return; }
  if (!data.length) { el.innerHTML = `<div class="empty">Пока пусто${PTAB === 'orders' ? ' — <a class="gold" href="#/market">выберите первый скин</a>' : ''}</div>`; return; }
  el.innerHTML = data.map(r => {
    if (PTAB === 'orders') { const [s, c] = OST[r.status] || [r.status, '']; return `<div class="li"><img src="${IMG(r.img)}" alt=""><div class="t"><b>${esc(r.name)}</b><small>${dt(r.created_at)} · №${r.id}${r.err ? ' · ' + esc(r.err) : ''}</small></div><div class="s"><div>${rub(r.price)}</div><small class="${c}">${s}</small>${r.status === 'sent' ? '<br><a class="gold" style="font-size:12px" target="_blank" rel="noopener" href="https://steamcommunity.com/my/tradeoffers/">Открыть обмены ↗</a>' : ''}</div></div>`; }
    if (PTAB === 'sales') { const [s, c] = SST[r.status] || [r.status, '']; return `<div class="li"><div class="t"><b>Продажа скинов</b><small>${dt(r.created_at)}${r.hold_until && r.status === 'hold' ? ' · зачислим после ' + dt(r.hold_until) : ''}</small></div><div class="s"><div>${r.amount ? rub(r.amount) : '—'}</div><small class="${c}">${s}</small></div></div>`; }
    if (PTAB === 'deps') { const [s, c] = DST[r.status] || [r.status, '']; return `<div class="li"><div class="t"><b>Пополнение · ${r.method === 'card' ? 'карта' : 'СБП'}</b><small>${dt(r.created_at)}</small></div><div class="s"><div>${rub(r.amount)}</div><small class="${c}">${s}</small></div></div>`; }
    return `<div class="li"><div class="t"><b>${esc(r.note || { dep: 'Пополнение', buy: 'Покупка', refund: 'Возврат', sale: 'Продажа' }[r.kind] || r.kind)}</b><small>${dt(r.created_at)} · ${{ dep: 'пополнение', buy: 'покупка', refund: 'возврат', sale: 'продажа', admin: 'поддержка' }[r.kind] || ''}</small></div><div class="s ${r.delta > 0 ? 'st-ok' : ''}">${r.delta > 0 ? '+' : ''}${rub(r.delta)}</div></div>`;
  }).join('');
}
function cashOut() {
  modal(`<h3>Вывод</h3><p class="muted">Деньги с баланса выводятся <b>скинами</b>: купите любой скин в маркете — он придёт обменом в Steam.</p>
    <p class="muted">Вывод рублей на карту — <span class="soon">скоро</span>: подключим, когда будет договор на выплаты.</p><a class="btn btn-gold" href="#/market" onclick="closeModal()">В маркет</a>`);
}

// ---------- владелец ----------
async function pageAdmin(v) {
  if (!WALLET?.admin) { v.innerHTML = '<div class="empty">Только для владельца</div>'; return; }
  v.innerHTML = `<h1>Админка маркета</h1>
    <div class="grid2"><div class="glass pad"><span class="muted">Баланс market.csgo</span><div class="big-num gold" id="mMoney">…</div><p class="note">С этого баланса покупаются скины игрокам (он общий с выводом RUSH CASE).</p></div>
    <div class="glass pad"><span class="muted">Комиссия маркета, %</span><div style="display:flex;gap:8px;margin-top:8px"><input class="inp" id="aFee" type="number" value="${ST.fee}" style="max-width:120px"><button class="btn btn-gold" id="aFeeSave">Сохранить</button></div>
    <p class="note">Наценка на покупку и скидка с выплаты за продажу.<br>Включено: покупка ${ST.buy ? '✅' : '❌'} · продажа ${ST.sell ? '✅' : '❌'} · пополнение ${ST.deposit ? '✅' : '❌ (нужны секреты MK_PAY_*)'}</p></div></div>
    <h3 style="margin-top:26px">Покупки, которые нужно проверить</h3><p class="note">Маркет не подтвердил покупку. Проверьте историю на market.csgo (номер вида mk123): скин ушёл — «Дошёл»; не ушёл — «Вернуть деньги».</p>
    <div class="list" id="aWait"></div>
    <h3 style="margin-top:26px">Последние покупки</h3><div class="list" id="aLast"></div>`;
  api('money').then(r => $('#mMoney').textContent = rub(r.money)).catch(e => $('#mMoney').textContent = e.message);
  $('#aFeeSave').onclick = async () => { const { error } = await sb.rpc('mk_admin_fee', { p_fee: +$('#aFee').value }); if (error) return toast(error.message, true); ST.fee = +$('#aFee').value; indexPrices(); toast('Сохранено'); };
  const row = r => `<div class="li"><img src="${IMG(r.img)}" alt=""><div class="t"><b>${esc(r.name)}</b><small>mk${r.id} · ${dt(r.created_at)} · ${esc(r.status)}${r.err ? ' · ' + esc(r.err) : ''}</small></div><div class="s">${rub(r.price)}${r.status === 'wait' ? `<br><button class="btn btn-glass btn-sm" onclick="admOrder(${r.id},'done')">Дошёл</button> <button class="btn btn-glass btn-sm" onclick="admOrder(${r.id},'refund')">Вернуть деньги</button>` : ''}</div></div>`;
  const { data: w } = await sb.from('mk_orders').select('*').eq('status', 'wait').order('id').limit(100);
  $('#aWait').innerHTML = w?.length ? w.map(row).join('') : '<div class="empty">Всё в порядке</div>';
  const { data: l } = await sb.from('mk_orders').select('*').order('id', { ascending: false }).limit(30);
  $('#aLast').innerHTML = l?.length ? l.map(row).join('') : '<div class="empty">Покупок ещё не было</div>';
}
async function admOrder(id, a) {
  if (!confirm(a === 'refund' ? 'Вернуть деньги игроку?' : 'Отметить, что скин дошёл?')) return;
  const { error } = await sb.rpc('mk_admin_order', { p_id: id, p_action: a });
  if (error) toast(error.message, true); else { toast('Готово'); route(); }
}

// ---------- тексты ----------
const FAQ = [
  ['Откуда берутся скины?', 'Мы покупаем скин у продавца на market.csgo в момент вашей покупки, и продавец отправляет его вам обменом в Steam. Цены в каталоге — цены рынка плюс комиссия маркета.'],
  ['Сколько ждать скин?', 'Обычно 1–15 минут. Предложение обмена приходит в Steam (вкладка «Предложения обмена»). Примите его в течение 12 часов.'],
  ['Что если скин не пришёл?', 'Если продавец не отправил обмен или обмен не был принят, деньги автоматически возвращаются на баланс маркета. Статус видно в профиле.'],
  ['Почему цена при покупке могла измениться?', 'Рынок живой: цены в каталоге обновляются каждые 15 минут, а перед покупкой мы проверяем цену ещё раз. Если она выросла — покажем новую, без вашего согласия ничего не спишется.'],
  ['Что нужно для покупки?', 'Вход через Steam, трейд-ссылка в профиле, открытый инвентарь и мобильный аутентификатор Steam Guard (без него Steam задерживает обмены).'],
  ['Как продать скины?', 'Раздел «Продать»: выбираете скины на странице партнёра Skinslink и подтверждаете обмен. Steam 7 дней держит проданный скин (обмен можно откатить), поэтому деньги приходят на баланс через 7 дней после проверки.'],
  ['Можно вывести деньги на карту?', 'Пока нет — баланс тратится на покупку скинов (это и есть вывод: скин в ваш Steam). Вывод рублей на карту — скоро.'],
  ['Это тот же аккаунт, что на RUSH CASE?', 'Вход через тот же Steam, но баланс маркета отдельный от баланса кейсов.'],
];
function pageFaq(v) { v.innerHTML = `<div class="doc glass"><h1>Частые вопросы</h1>${FAQ.map(([q, a]) => `<details class="q"><summary>${q}</summary><p>${a}</p></details>`).join('')}<p class="note" style="margin-top:20px">Не нашли ответ? Пишите: <a class="gold" href="mailto:rushcasesupport@gmail.com">rushcasesupport@gmail.com</a> или <a class="gold" href="https://t.me/rushcasse" target="_blank" rel="noopener">Telegram</a>.</p></div>`; }
function pageContacts(v) { v.innerHTML = `<div class="doc glass"><h1>Контакты</h1><p><b>ИП Сенин Роман Сергеевич</b></p><p>ИНН 540362051527, ОГРНИП 326547600108321</p><p>Сайт: rush-case.site</p><p>E-mail поддержки: <a class="gold" href="mailto:rushcasesupport@gmail.com">rushcasesupport@gmail.com</a></p><p>Telegram: <a class="gold" href="https://t.me/rushcasse" target="_blank" rel="noopener">@rushcasse</a></p><p class="muted">Отвечаем ежедневно. В письме укажите ваш Steam ID и номер покупки из профиля.</p></div>`; }
function pageTerms(v) {
  v.innerHTML = `<div class="doc glass"><h1>Пользовательское соглашение</h1>
  <h3>1. Общие положения</h3><p>Соглашение регулирует отношения между ИП Сенин Роман Сергеевич (ИНН 540362051527, ОГРНИП 326547600108321, далее — Администрация), владельцем сайта RUSH MARKET (rush-case.site, далее — Сайт), и пользователем. Используя Сайт, пользователь принимает условия Соглашения. Сайт предназначен для лиц старше 18 лет.</p>
  <h3>2. Услуги</h3><p>Сайт помогает купить и продать цифровые предметы игры Counter-Strike 2 (скины). Покупка: Сайт приобретает выбранный предмет у продавца на площадке market.csgo и организует его передачу пользователю обменом Steam. Продажа: предметы пользователя принимает партнёр Skinslink; стоимость зачисляется на баланс Сайта.</p>
  <h3>3. Баланс</h3><p>Баланс Сайта отображается в рублях и используется для покупки предметов. Баланс не является банковским счётом, проценты не начисляются. Вывод денежных средств на карту в настоящее время не предоставляется; об изменении будет сообщено на Сайте.</p>
  <h3>4. Цены и комиссия</h3><p>Цена предмета = рыночная цена на market.csgo + комиссия Сайта (сейчас ${ST.fee}%). Перед списанием цена проверяется повторно; если она выросла, пользователю показывается новая цена.</p>
  <h3>5. Передача предмета</h3><p>Для получения предмета пользователь обязан указать действующую трейд-ссылку, держать инвентарь Steam открытым и принять предложение обмена. Если предмет не передан по причине продавца или обмен не принят, стоимость возвращается на баланс автоматически.</p>
  <h3>6. Продажа предметов</h3><p>Зачисление за проданные предметы производится через 7 дней после обмена (период, в который Steam позволяет откатить обмен), после повторной проверки у партнёра. При откате обмена зачисление не производится.</p>
  <h3>7. Ограничения</h3><p>Запрещено использовать Сайт для мошенничества, отмывания средств, с чужими аккаунтами или платёжными средствами. Администрация вправе приостановить операции при подозрении на нарушение.</p>
  <h3>8. Ответственность</h3><p>Сайт не связан с Valve Corporation. Администрация не отвечает за блокировки и ограничения, наложенные Steam на аккаунт пользователя.</p>
  <h3>9. Контакты</h3><p>Вопросы и претензии: <a class="gold" href="mailto:rushcasesupport@gmail.com">rushcasesupport@gmail.com</a>.</p></div>`;
}
function pageRefund(v) {
  v.innerHTML = `<div class="doc glass"><h1>Возвраты</h1>
  <p>Если купленный предмет не был передан (продавец не отправил обмен, обмен отменён или не принят), его стоимость <b>автоматически</b> возвращается на баланс маркета — обычно в течение нескольких минут.</p>
  <p>Если статус покупки «Проверяем вручную», поддержка проверит покупку у площадки и либо подтвердит передачу, либо вернёт деньги на баланс — как правило, в течение суток.</p>
  <p>Предмет, полученный в Steam, вернуть нельзя: это цифровой товар, переданный пользователю.</p>
  <p>Пополнение, зачисленное на баланс, но не потраченное, можно вернуть на исходный способ оплаты по заявке в поддержку: <a class="gold" href="mailto:rushcasesupport@gmail.com">rushcasesupport@gmail.com</a>.</p></div>`;
}

// ---------- запуск ----------
(async function start() {
  const qs = new URLSearchParams(location.search), tok = qs.get('steam_token'), err = qs.get('steam_error');
  if (tok || err) history.replaceState(null, '', location.pathname + location.hash);
  if (tok) { const { error } = await sb.auth.verifyOtp({ token_hash: tok, type: 'magiclink' }); if (error) toast('Не удалось войти через Steam: ' + error.message, true); else toast('Вы вошли через Steam'); }
  if (err) toast(err === 'cancel' ? 'Вход через Steam отменён' : 'Не удалось войти через Steam', true);
  if (qs.get('pay') === 'ok') toast('Оплата прошла — деньги появятся на балансе после подтверждения кассой');
  if (qs.get('pay') === 'fail') toast('Оплата не прошла, деньги не списаны. Попробуйте ещё раз.', true);
  indexPrices(); route();
  const st = api('status').then(s => { ST = { ...ST, ...s }; }).catch(() => { /* функция ещё не выложена — всё «скоро» */ });
  await Promise.all([loadPrices(), loadMe(), st]);
  drawMe(); route();
  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { ME = null; WALLET = null; drawMe(); } });
})();
