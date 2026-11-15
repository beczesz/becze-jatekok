// Várvédők: telefonos vezérlő. Csak parancsot küld, a játék a kivetítőn fut.
import { connectPhone, isLocal, validRoom } from './transport.js';
import {
  PLAYERS, PLAYER_IDS, EASE, SLOTS, TOWERS, TOWER_ORDER, ENEMIES, GIFT, MAX_LEVEL, WAND_RECIPES, upgradeCost,
  ROLES, ROLE_ORDER, defaultRole, towerCost, isStrength, LEVEL_LOOK, REACH_LEVEL, DOUBLE_LEVEL, fmtGold, VERSION, NUKE,
} from './rules.js';

let net = null;
const $ = (id) => document.getElementById(id);
const KEY = 'varvedok-szin', EKEY = 'varvedok-nehezseg', RKEY = 'varvedok-szoba';

const qs = new URLSearchParams(location.search);
let room = (qs.get('room') || '').toUpperCase();
let me = Number(qs.get('p')) || Number(safeGet(KEY)) || 0;
let ease = qs.get('ease') || safeGet(EKEY) || 'normal';
if (!EASE[ease]) ease = 'normal';
const ROLEKEY = 'varvedok-szerep';
let role = qs.get('role') || safeGet(ROLEKEY) || '';
if (!ROLES[role]) role = '';
const myRole = () => role || defaultRole(me || 1);
const stars = (lvl) => (lvl <= 5 ? '★'.repeat(lvl) : `★ ${lvl}`);
// a szint színe CSS-ben (a telefon helyein)
const levelBg = (lvl) => {
  const c = LEVEL_LOOK[lvl].color;
  if (!c) return '';
  if (c === 'rainbow') return 'background:conic-gradient(#f87171,#facc15,#4ade80,#38bdf8,#a78bfa,#f472b6,#f87171);';
  return `background:radial-gradient(circle, ${c} 0 45%, var(--soft) 46%);`;
};
let view = 0;           // kinek a sávját nézzük (0 = a sajátunkat)
let st = null;          // utolsó állapot a kivetítőtől
let lastState = 0;
let sheetSlot = null;   // nyitott választó: melyik helyhez
const keys = {};        // mit rajzoltunk ki utoljára (csak változáskor rajzolunk újra)

function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* privát mód */ } }
const send = (type, extra = {}) => { if (net && me) net.send({ kind: 'in', p: me, type, ...extra }); };
const buzz = (ms = 30) => {
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; // érintés előtt a böngésző nem engedi
  try { navigator.vibrate?.(ms); } catch (e) { /* nincs rezgés */ }
};
function changed(name, val) { const k = JSON.stringify(val); if (keys[name] === k) return false; keys[name] = k; return true; }
const lane = () => view || me;

// ---------- színválasztás és nehézség ----------
function renderEase() {
  $('ease').innerHTML = Object.entries(EASE).map(([k, e]) =>
    `<button class="easebtn ${k === ease ? 'on' : ''}" data-e="${k}"><span class="emo">${e.icon}</span>${e.name}</button>`).join('');
  $('ease').querySelectorAll('.easebtn').forEach((b) => b.onclick = () => { ease = b.dataset.e; safeSet(EKEY, ease); renderEase(); });
  $('roles').innerHTML = ROLE_ORDER.map((k) => {
    const r = ROLES[k];
    return `<button class="rolebtn ${k === role ? 'on' : ''}" data-r="${k}"><span class="emo">${r.icon}</span><span><b>${r.name}</b><small>${r.desc}</small></span></button>`;
  }).join('');
  $('roles').querySelectorAll('.rolebtn').forEach((b) => b.onclick = () => { role = b.dataset.r; safeSet(ROLEKEY, role); renderEase(); });
}

function renderPick() {
  if (!changed('pick', PLAYER_IDS.map((p) => !!st?.players?.[p]?.connected))) return;
  const box = $('pickBtns');
  box.innerHTML = '';
  for (const p of PLAYER_IDS) {
    const pl = PLAYERS[p];
    const taken = st?.players?.[p]?.connected;
    const b = document.createElement('button');
    b.className = 'pickbtn';
    b.style.background = pl.color;
    b.innerHTML = `<span class="emo">${pl.icon}</span><span>${pl.name}<small>${taken ? 'már játszik valaki ezzel (visszaléphetsz)' : 'szabad'}</small></span>`;
    b.onclick = () => choose(p);
    box.appendChild(b);
  }
}

function choose(p) {
  me = p; view = 0;
  safeSet(KEY, String(p));
  const pl = PLAYERS[p];
  document.documentElement.style.setProperty('--c', pl.color);
  document.documentElement.style.setProperty('--soft', pl.soft);
  $('whoIcon').textContent = pl.icon;
  if (!role) { role = defaultRole(p); }
  $('whoName').textContent = `${pl.name} ${ROLES[role].icon}${ease !== 'normal' ? EASE[ease].icon : ''}`;
  $('pick').hidden = true;
  $('game').hidden = false;
  Object.keys(keys).forEach((k) => delete keys[k]);
  buildSlots();
  send('hello', { ease, role: myRole() });
  buzz(60);
  render();
}

$('switch').onclick = () => { me = 0; $('game').hidden = true; $('pick').hidden = false; closeSheet(); delete keys.pick; renderEase(); renderPick(); };

// ---------- sávváltó ----------
function renderLanes() {
  const joined = PLAYER_IDS.filter((p) => st.players[p].joined);
  if (!joined.includes(view)) view = 0;
  const boss = st.bossLanes || [];
  const sos = st.sos || [];
  if (!changed('lanes', [joined, lane(), boss, sos])) return;
  const show = joined.length > 1;
  $('lanesLabel').hidden = !show;
  $('lanes').hidden = !show;
  const order = [me, ...joined.filter((p) => p !== me)];
  $('lanes').innerHTML = order.map((p) =>
    `<button class="lanebtn ${p === lane() ? 'on' : ''}" data-l="${p}" style="border-color:${p === lane() ? PLAYERS[p].color : 'transparent'}">` +
    `<span class="emo">${PLAYERS[p].icon}</span>${p === me ? 'Enyém' : PLAYERS[p].name}${sos.includes(p) ? '<span class="boss emo">🆘</span>' : boss.includes(p) ? '<span class="boss emo">🐲</span>' : ''}</button>`).join('');
  $('lanes').querySelectorAll('.lanebtn').forEach((b) => b.onclick = () => {
    const l = Number(b.dataset.l);
    view = l === me ? 0 : l;
    closeSheet(); buzz(15); render();
  });
  document.documentElement.style.setProperty('--lc', PLAYERS[lane()].color);
}

// ---------- toronyhelyek ----------
function buildSlots() {
  const box = $('slots');
  box.innerHTML = '';
  for (let i = 0; i < SLOTS; i++) {
    const b = document.createElement('button');
    b.className = 'slot';
    b.onclick = () => openSheet(i);
    box.appendChild(b);
  }
}

function renderSlots() {
  const towers = st.towers[lane()] || [];
  if (!changed('slots', [lane(), towers])) return;
  [...$('slots').children].forEach((b, i) => {
    const t = towers[i];
    b.classList.toggle('full', !!t);
    b.classList.toggle('other', lane() !== me);
    b.style.cssText = t ? levelBg(t.lvl) : '';
    b.innerHTML = `<span class="n">${i + 1}</span>` + (t
      ? `<span class="emo" style="font-size:${40 + t.lvl * 3}px">${TOWERS[t.type].icon}</span><span class="st">${stars(t.lvl)}</span>`
      : (lane() === me ? '<span class="plus">+</span>' : ''));
  });
}

// ---------- varázspálca: a következő jó lépés egy gombnyomással ----------
function wandMove() {
  if (!st) return null;
  const gold = st.players[me].gold;
  const towers = st.towers[me];
  const empty = towers.findIndex((t) => !t);
  if (empty >= 0) {
    const k = WAND_RECIPES[myRole()][empty];
    const c = towerCost(k, myRole());
    return { type: 'build', slot: empty, tower: k, icon: TOWERS[k].icon, cost: c, ok: gold >= c };
  }
  let best = null;
  towers.forEach((t, i) => {
    const c = upgradeCost(t.type, t.lvl, myRole());
    if (c != null && (!best || c < best.cost)) best = { type: 'upgrade', slot: i, icon: TOWERS[t.type].icon, cost: c };
  });
  if (best) best.ok = gold >= best.cost;
  return best;
}

function renderWand() {
  const mv = wandMove();
  const can = st && ['build', 'wave'].includes(st.phase);
  if (!changed('wand', [mv, can])) return;
  const b = $('wand');
  if (!mv) { b.innerHTML = '<span class="emo">🪄</span> Minden tornyod a legerősebb!'; b.disabled = true; return; }
  const what = mv.type === 'build' ? 'Építs' : 'Fejleszd';
  b.innerHTML = `<span class="emo">🪄</span> ${what}: <span class="emo">${mv.icon}</span> ${mv.ok ? '' : 'gyűjts még: '}💰 ${mv.ok ? mv.cost : mv.cost - st.players[me].gold}`;
  b.disabled = !can || !mv.ok;
}
$('wand').onclick = () => {
  const mv = wandMove();
  if (!mv || !mv.ok) return;
  if (mv.type === 'build') send('build', { slot: mv.slot, tower: mv.tower });
  else send('upgrade', { slot: mv.slot, lane: me });
  buzz(50);
  if (view) { view = 0; render(); }
};

// ---------- felugró választó ----------
function openSheet(i) {
  if (!st || !['build', 'wave'].includes(st.phase)) { flashMsg('Most nem lehet építeni'); return; }
  if (lane() !== me && !st.towers[lane()][i]) { flashMsg('Itt csak fejleszteni tudsz'); return; }
  sheetSlot = i;
  keys.sheet = null;
  $('sheet').hidden = false;
  renderSheet();
  buzz(15);
}
function closeSheet() { sheetSlot = null; $('sheet').hidden = true; }
$('sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });

function renderSheet() {
  if (sheetSlot == null || !st) return;
  const L = lane();
  const gold = st.players[me].gold;
  const t = st.towers[L][sheetSlot];
  // csak akkor rajzoljuk újra, ha változik, hogy a koppintás ne vesszen el
  const ownerRole = (st.players[L] && st.players[L].role) || defaultRole(L);
  const upCost = t ? upgradeCost(t.type, t.lvl, ownerRole) : null;
  const sig = t ? ['t', L, t.type, t.lvl, gold >= (upCost ?? 1e9)] : ['e', L, myRole(), TOWER_ORDER.map((k) => gold >= towerCost(k, myRole()))];
  if (!changed('sheet', sig)) return;
  const box = $('sheetBox');
  if (!t) {
    if (L !== me) { closeSheet(); return; }
    box.innerHTML = `<h2>Mit építsünk a ${sheetSlot + 1}. helyre?</h2><div class="towers">` +
      TOWER_ORDER.map((k) => {
        const d = TOWERS[k], c = towerCost(k, myRole()), strong = isStrength(myRole(), k);
        return `<button class="tw ${strong ? 'strong' : ''}" data-k="${k}" ${gold < c ? 'disabled' : ''}>${strong ? `<span class="badge">${ROLES[myRole()].icon} erősséged</span>` : ''}<span class="emo">${d.icon}</span><b>${d.name}</b><small>${d.desc}</small><span class="cost">💰 ${c}</span></button>`;
      }).join('') + '</div><button class="cancel">Mégse</button>';
    box.querySelectorAll('.tw').forEach((b) => b.onclick = () => {
      send('build', { slot: sheetSlot, tower: b.dataset.k });
      buzz(50); closeSheet();
    });
  } else {
    const d = TOWERS[t.type];
    const cost = upCost;
    const can = cost != null && gold >= cost;
    const whose = L === me ? '' : `<p class="info">${PLAYERS[L].icon} ${PLAYERS[L].name} tornya: a te aranyadból fejleszted.</p>`;
    const nl = t.lvl + 1;
    const extra = nl === REACH_LEVEL && d.reach ? ' · két sávnyira is lő!' : nl === DOUBLE_LEVEL && d.dmg ? ' · egyszerre két szörnyre lő!' : ' · erősebb, gyorsabb';
    const next = t.lvl < MAX_LEVEL ? `<p class="info">Következő: <b>${LEVEL_LOOK[nl].name}</b> (${nl}/${MAX_LEVEL})${extra}</p>` : '';
    box.innerHTML = `<div class="info"><div class="emo" style="display:inline-block;border-radius:50%;padding:6px;${levelBg(t.lvl)}">${d.icon}</div><h2>${d.name} · ${LEVEL_LOOK[t.lvl].name}</h2><div class="lvl" style="font-size:20px">${'★'.repeat(t.lvl)}${'☆'.repeat(MAX_LEVEL - t.lvl)}</div></div>` + whose + next +
      (cost == null
        ? '<p class="info">Ez már a legerősebb!</p>'
        : `<button class="big go" id="upg" ${can ? '' : 'disabled style="opacity:.4"'}>${L === me ? 'Fejlesztés' : 'Segítek'} ⬆️ 💰 ${cost}</button>`) +
      '<button class="cancel">Bezár</button>';
    const u = box.querySelector('#upg');
    if (u) u.onclick = () => { send('upgrade', { slot: sheetSlot, lane: L }); buzz(50); closeSheet(); };
  }
  box.querySelector('.cancel').onclick = closeSheet;
}

// ---------- fő rajzolás ----------
let msgUntil = 0;
function flashMsg(t) { $('msg').textContent = t; msgUntil = performance.now() + 1500; }

function render() {
  if (!me || !st) return;
  const P = st.players[me];
  $('gold').textContent = fmtGold(P.gold);
  $('waveTxt').textContent = st.wave ? (st.endless ? `Hullám ${st.wave} ♾️ (rekord ${st.record})` : `Hullám ${st.wave}/${st.maxWave}`) : 'Mindjárt kezdünk';
  $('hpTxt').textContent = `${st.rage ? '🔥' + st.rage + ' · ' : ''}❤️ ${st.hp}${st.tLevel ? ' · 🚩' + st.tLevel : ''}`;
  $('boltBar').style.width = `${(100 * st.bolt) / st.boltMax}%`;

  if (performance.now() > msgUntil) {
    const m = {
      lobby: 'Várunk a többiekre…',
      build: `Építs! Még ${st.countdown} mp${st.theme ? ' · Jön: ' + st.theme : ''}`,
      wave: (() => {
        const others = (st.sos || []).filter((p) => p !== me);
        if (others.length) return `🆘 ${others.map((p) => PLAYERS[p].icon + ' ' + PLAYERS[p].name).join(', ')} bajban! A tornyaid átlőnek hozzá.`;
        return st.theme || 'Jönnek a szörnyek!';
      })(),
      lose: 'Ajjaj! Próbáljuk újra!',
      win: 'GYŐZELEM! 🎉',
    }[st.phase] || '';
    $('msg').textContent = m;
  }

  // érem a győzelem után
  const medal = st.phase === 'win' && st.medals ? st.medals.find((x) => x.p === me) : null;
  $('medal').hidden = !medal;
  if (medal && changed('medal', medal)) $('medal').innerHTML = `<span class="emo">${medal.icon || '🏅'}</span><b>${medal.title || 'Hős'}</b>`;

  renderLanes();

  // radar: építés alatt az előrejelzés, hullám alatt a szörnyek
  const L = lane();
  const next = (st.next && st.next[L]) || [];
  $('next').innerHTML = st.phase === 'build' && next.length ? `Következő: ${next.map((t) => `<span class="emo">${ENEMIES[t].icon}</span>`).join(' ')}` : '';
  const mobs = st.phase === 'wave' ? (st.enemies[L] || []) : [];
  const box = $('mobs');
  while (box.children.length < mobs.length) { const s = document.createElement('span'); s.className = 'mob emo'; box.appendChild(s); }
  while (box.children.length > mobs.length) box.lastChild.remove();
  mobs.forEach(([x, type], i) => {
    const el = box.children[i];
    el.textContent = ENEMIES[type].icon;
    el.classList.toggle('boss', type === 'boss');
    el.style.left = `${12 + x * 86}%`;
  });

  renderSlots();
  renderWand();
  renderSheet();
  renderAction();
  renderNuke();
  renderGifts();
}

function renderAction() {
  const P = st.players[me];
  const boltReady = st.phase === 'wave' && st.bolt >= st.boltMax;
  const pressed = st.boltPressed.includes(me);
  const cd = (st.sosCd || {})[me] || 0;
  const mySos = (st.sos || []).includes(me);
  const sig = [st.phase, P.ready, boltReady, pressed, st.boltPressed.length, cd, mySos];
  if (!changed('action', sig)) return;
  const box = $('action');
  let html = '';
  if (st.phase === 'lobby') html = '<button class="big go" data-a="start">Indulás! ▶</button>';
  else if (st.phase === 'build') html = P.ready ? '<button class="big wait">Kész vagy ✔ várunk a többiekre</button>' : '<button class="big" data-a="ready">Kész vagyok ✔</button>';
  else if (boltReady) html = pressed
    ? '<button class="big wait">⚡ Megnyomtad! A többiek is nyomják!</button>'
    : '<button class="big bolt" data-a="bolt">⚡ VILLÁM! Nyomjátok együtt!</button>';
  else if (st.phase === 'wave') html = mySos
    ? '<button class="big wait">🆘 Jönnek segíteni! Mindenki ide lő.</button>'
    : cd > 0
      ? `<button class="big wait">🆘 Újra kérhetsz ${cd} mp múlva</button>`
      : '<button class="big sos" data-a="sos">🆘 Segítséget kérek!</button>';
  else if (st.phase === 'lose') html = '<button class="big go" data-a="restart">Újra! 🔁</button>';
  else if (st.phase === 'win') html = '<button class="big go" data-a="endless">♾️ Tovább a végtelenbe!</button><button class="big wait" style="margin-top:8px;font-size:18px;padding:12px" data-b="restart">Új játék elölről</button>';
  box.innerHTML = html;
  const b = box.querySelector('[data-a]');
  if (b) b.onclick = () => { send(b.dataset.a); buzz(b.dataset.a === 'bolt' ? 120 : 40); };
  const b2 = box.querySelector('[data-b]');
  if (b2) b2.onclick = () => { send(b2.dataset.b); buzz(40); };
}

// ---------- atombomba ☢️: vásárlás és kétlépcsős ledobás ----------
let nukeArmed = 0;  // időbélyeg: meddig vár a második érintésre
function renderNuke() {
  const P = st.players[me];
  const have = P.nukes || 0, L = lane();
  const armed = performance.now() < nukeArmed;
  const canBuy = st.phase !== 'lobby' && P.gold >= NUKE.cost && have < NUKE.max;
  const sig = [have, canBuy, st.phase, armed, L];
  if (!changed('nuke', sig)) return;
  let html = '';
  if (st.phase === 'wave' && have > 0) {
    const who = L === me ? 'a saját sávomra' : `${PLAYERS[L].icon} ${PLAYERS[L].name} sávjára`;
    html += armed
      ? `<button class="nukebtn drop armed" data-n="drop">💥 Biztos? Nyomd meg újra!</button>`
      : `<button class="nukebtn drop" data-n="drop">☢️ Ledobom ${who} (${have} db)</button>`;
  }
  if (st.phase !== 'lobby' && st.phase !== 'win') {
    html += `<button class="nukebtn" data-n="buy" ${canBuy ? '' : 'disabled'}>☢️ Atombomba vásárlása · 💰${NUKE.cost}${have ? ` · van: ${have}` : ''}${have >= NUKE.max ? ' (tele)' : ''}</button>`;
  }
  $('nukeBox').innerHTML = html;
  $('nukeBox').querySelectorAll('[data-n]').forEach((b) => b.onclick = () => nukeAction(b.dataset.n));
}
function nukeAction(what) {
  if (what === 'buy') { send('buynuke'); buzz(40); flashMsg('☢️ Atombomba a tartalékban!'); return; }
  if (performance.now() < nukeArmed) {
    nukeArmed = 0;
    send('nuke', { lane: lane() });
    buzz(400); flashMsg('☢️ BUMM!');
  } else {
    nukeArmed = performance.now() + 3000;
    buzz(60);
    setTimeout(() => { delete keys.nuke; if (st) render(); }, 3050);
  }
  delete keys.nuke; render();
}

function renderGifts() {
  const others = PLAYER_IDS.filter((p) => p !== me && st.players[p].joined);
  const gold = st.players[me].gold;
  const sig = [others, gold >= GIFT, st.treasury, st.treasuryNeed];
  if (!changed('gifts', sig)) return;
  const dis = gold < GIFT ? 'disabled' : '';
  $('gifts').innerHTML =
    `<button class="gift castle" data-to="0" ${dis}>🏰 ${GIFT} a vár kincstárába (${st.treasury}/${st.treasuryNeed})</button>` +
    others.map((p) => `<button class="gift" data-to="${p}" style="border-color:${PLAYERS[p].color}" ${dis}>🎁 ${GIFT} → <span class="emo">${PLAYERS[p].icon}</span> ${PLAYERS[p].name}</button>`).join('');
  $('gifts').querySelectorAll('.gift').forEach((b) => b.onclick = () => { send('gift', { to: Number(b.dataset.to) }); buzz(40); flashMsg('Elküldve! 🎁'); });
}

// ---------- billentyűzet (laptopos játékosnak) ----------
addEventListener('keydown', (e) => {
  if (!me || !st || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (sheetSlot != null) {
    if (k === 'escape') { closeSheet(); return; }
    if (/^[1-6]$/.test(k)) { const b = $('sheetBox').querySelectorAll('.tw')[Number(k) - 1]; if (b && !b.disabled) b.click(); return; }
    if (k === 'enter') { const u = $('sheetBox').querySelector('#upg'); if (u && !u.disabled) u.click(); e.preventDefault(); return; }
    return;
  }
  if (/^[1-6]$/.test(k)) { openSheet(Number(k) - 1); return; }
  if (k === 'w') { $('wand').click(); return; }
  if (k === 'v') { nukeAction('buy'); return; }
  if (k === 'a') { if (st.phase === 'wave' && (st.players[me].nukes || 0) > 0) nukeAction('drop'); return; }
  if (k === 'k') { const g = $('gifts').querySelector('.gift.castle'); if (g && !g.disabled) g.click(); return; }
  if (k === 'l') { const bs = [...$('lanes').querySelectorAll('.lanebtn')]; if (bs.length > 1) { const i = bs.findIndex((b) => b.classList.contains('on')); bs[(i + 1) % bs.length].click(); } return; }
  if (k === ' ' || k === 'enter') { const b = $('action').querySelector('[data-a]'); if (b) { e.preventDefault(); b.click(); } }
});

// ---------- verzió: a telefon és a kivetítő ugyanazzal játszik-e ----------
$('ver').textContent = `v${VERSION}`;
let verShown = '';
function checkVersion(screenVer) {
  const bad = screenVer && screenVer !== VERSION;
  $('ver').textContent = bad ? `v${VERSION} (kivetítő: v${screenVer})` : `v${VERSION}`;
  if (!bad) { $('verWarn').hidden = true; return; }
  if (verShown === screenVer) { $('verWarn').hidden = false; return; }
  verShown = screenVer;
  $('verWarn').innerHTML = `A kivetítő v${screenVer}, a telefonod v${VERSION}.<br>Frissítsétek, hogy ugyanazzal játsszatok!<br><button id="verReload">Frissítés 🔄</button>`;
  $('verWarn').hidden = false;
  $('verReload').onclick = () => location.reload();
}

// ---------- kapcsolat ----------
async function join() {
  $('roomBox').hidden = true;
  $('pickMain').hidden = false;
  try { net = await connectPhone(room); }
  catch (e) { $('offline').textContent = 'Nem sikerült csatlakozni. Van internet?'; $('offline').hidden = false; return; }
  net.on((m) => {
    if (!m || m.kind !== 'state') return;
    st = m;
    lastState = performance.now();
    $('offline').hidden = true;
    checkVersion(m.version);
    if (!me) renderPick(); else render();
  });
  if (me && PLAYERS[me]) choose(me); else { me = 0; renderPick(); }
}

setInterval(() => {
  if (!net) return;
  if (me) send('hello', { ease, role: myRole() });
  if (performance.now() - lastState > 6000) $('offline').hidden = false;
}, 2000);

renderEase();
if (!PLAYERS[me]) me = 0;
const autoMe = me;
me = 0;
if (isLocal || validRoom(room)) {
  safeSet(RKEY, room);
  me = autoMe; join();
} else {
  // nincs szobakód a címben: kérjük be (a QR-kód magától hozza)
  $('pickMain').hidden = true;
  $('roomBox').hidden = false;
  const inp = $('roomInput');
  inp.value = (safeGet(RKEY) || '').toUpperCase();
  const go = () => {
    const v = inp.value.trim().toUpperCase();
    if (!validRoom(v)) { inp.focus(); $('roomErr').hidden = false; return; }
    room = v; safeSet(RKEY, room);
    history.replaceState(null, '', `?room=${room}`);
    me = autoMe; join();
  };
  $('roomGo').onclick = go;
  inp.onkeydown = (e) => { if (e.key === 'Enter') go(); };
}
