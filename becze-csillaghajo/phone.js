// Becze Csillaghajó, kar-próba: a telefon (vagy laptop). Csak a kar és a gomb állását küldi.
import { connectPhone, isLocal, validRoom } from './transport.js';
import { VERSION, PLAYERS, PLAYER_IDS, STATIONS, STATION_IDS, PAD_MS, PAD_HEARTBEAT_MS } from './rules.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
$('ver').textContent = `v${VERSION}`;

// ---------- szobakód ----------
let room = (params.get('room') || '').toUpperCase();
if (!isLocal && !validRoom(room)) {
  $('join').hidden = false;
  $('code').focus();
  await new Promise((done) => {
    const go = () => { const c = $('code').value.trim().toUpperCase(); if (validRoom(c)) { room = c; history.replaceState(null, '', `?room=${c}`); done(); } };
    $('go').onclick = go;
    $('code').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  });
  $('join').hidden = true;
}

let net;
try { net = await connectPhone(room); }
catch (e) { $('offline').textContent = 'Nem sikerült csatlakozni. Van internet?'; $('offline').hidden = false; throw e; }

// ---------- a vezérlő-rekord ----------
let me = 0;
const pad = { x: 0, y: 0, b: false, st: '', s: 0, r: 0 };
const sentAt = new Map();
let lastSent = 0, sendTimer = null, lastJson = '';
function sendPad(force) {
  if (!me) return;
  const now = performance.now();
  const body = { x: pad.x, y: pad.y, b: pad.b, st: pad.st, r: pad.r };
  const json = JSON.stringify(body);
  if (!force && json === lastJson && now - lastSent < PAD_HEARTBEAT_MS) return;
  if (now - lastSent < PAD_MS) {   // legfeljebb tízszer másodpercenként; a legutolsó állapot mindig kimegy
    if (!sendTimer) sendTimer = setTimeout(() => { sendTimer = null; sendPad(true); }, PAD_MS - (now - lastSent));
    return;
  }
  pad.s++; lastSent = now; lastJson = json;
  sentAt.set(pad.s, now);
  if (sentAt.size > 60) sentAt.delete(sentAt.keys().next().value);
  net.setPad(me, { ...body, s: pad.s }).catch(() => {});
}
setInterval(() => sendPad(false), 500);   // életjel (a sendPad maga dönti el, kell-e)

// késés: a kivetítő visszaküldi, melyik sorszámú rekordot látta utoljára
const rtts = [];
function measure(ack) {
  const t = sentAt.get(ack);
  if (t === undefined) return;
  sentAt.delete(ack);
  rtts.push(performance.now() - t); if (rtts.length > 12) rtts.shift();
  const med = [...rtts].sort((a, b) => a - b)[Math.floor(rtts.length / 2)];
  pad.r = Math.round(med);
  $('lag').textContent = `késés ~${Math.round(med / 2)} ms (oda-vissza ${Math.round(med)} ms)`;
  $('lag').style.color = med > 500 ? '#fca5a5' : med > 250 ? '#fde047' : '#86efac';
}

// ---------- állapot a kivetítőtől ----------
let state = null, lastState = performance.now(), lastHits = null;
net.on((m) => {
  state = m; lastState = performance.now();
  $('offline').hidden = true;
  checkVersion(m.version);
  if (me && m.ack && m.ack[me] !== undefined) measure(m.ack[me]);
  if (lastHits !== null && m.hits > lastHits) navigator.vibrate?.(120);
  lastHits = m.hits;
  render();
});
setInterval(() => { if (performance.now() - lastState > 6000) $('offline').hidden = false; }, 1000);

let verShown = null;
function checkVersion(v) {
  const bad = v && v !== VERSION;
  $('ver').textContent = bad ? `v${VERSION} (kivetítő: v${v})` : `v${VERSION}`;
  if (!bad) { $('warn').hidden = true; return; }
  if (verShown !== v) {
    verShown = v;
    $('warn').innerHTML = `A kivetítő v${v}, a telefonod v${VERSION}.<br>Frissítsd, hogy ugyanazzal játsszatok!<br><button id="reload">Frissítés 🔄</button>`;
    $('reload').onclick = () => location.reload();
  }
  $('warn').hidden = false;
}

// ---------- színválasztás ----------
const saved = `csillaghajo-szin-${room || 'helyi'}`;
async function choose(p) {
  me = p; pad.st = '';
  try {
    pad.s++;
    await net.setPad(p, { x: 0, y: 0, b: false, st: '', r: 0, s: pad.s });
  } catch (e) {   // a szabály elutasította: más ül ezen a színen
    me = 0; $('pickMsg').textContent = `${PLAYERS[p].name} már foglalt, válassz mást!`; showPick(); return;
  }
  try { localStorage.setItem(saved, String(p)); } catch (e) { /* privát mód */ }
  const P = PLAYERS[p];
  document.documentElement.style.setProperty('--c', P.color);
  $('meIcon').textContent = P.icon; $('meName').textContent = P.name;
  $('pick').hidden = true; $('game').hidden = false;
  render();
}
function showPick() {
  $('game').hidden = true; $('pick').hidden = false;
  const box = $('colors');
  if (!box.children.length) {   // egyszer épül fel, utána csak a foglaltság frissül (különben elveszne az érintés)
    for (const p of PLAYER_IDS) {
      const P = PLAYERS[p], b = document.createElement('button');
      b.className = 'pickbtn'; b.style.background = P.color; b.dataset.p = p;
      b.innerHTML = `<span class="emo">${P.icon}</span>${P.name}`;
      b.onclick = () => choose(p);
      box.appendChild(b);
    }
  }
  for (const b of box.children) b.disabled = !!(state && state.players && state.players[b.dataset.p] !== undefined);
}
addEventListener('pagehide', () => { if (me) net.leave(me); });

// ---------- játék nézet ----------
const stBox = $('stations');
for (const id of STATION_IDS) {
  const b = document.createElement('button');
  b.className = 'stbtn'; b.dataset.id = id;
  b.innerHTML = `<span class="emo">${STATIONS[id].icon}</span>${STATIONS[id].name}<span class="occ emo"></span>`;
  b.onclick = () => goStation(id);
  stBox.appendChild(b);
}
function goStation(id) {
  const holder = state?.stations?.[id];
  if (holder && holder !== me) { navigator.vibrate?.(40); return; }
  pad.st = pad.st === id ? '' : id;
  sendPad(true); render();
}
function render() {
  if (!me) { if (!$('pick').hidden || $('game').hidden) showPick(); return; }
  // ha a kivetítő nem nálam tartja az állomást (közben más foglalta el), jelezzük
  const mineNow = state?.stations ? STATION_IDS.find((id) => state.stations[id] === me) || '' : pad.st;
  for (const b of stBox.children) {
    const id = b.dataset.id, holder = state?.stations?.[id];
    b.classList.toggle('mine', holder === me);
    b.classList.toggle('taken', !!holder && holder !== me);
    b.querySelector('.occ').textContent = holder && holder !== me ? PLAYERS[holder].icon : '';
  }
  const st = STATIONS[mineNow];
  $('hint').textContent = st ? `Kar: ${st.stick} · Gomb: ${st.button}` : (pad.st ? 'Szaladsz…' : 'Válassz állomást!');
  $('stickLbl').textContent = st ? st.stick : 'kar';
  $('fireTxt').textContent = st ? st.button.toUpperCase() : 'GOMB';
  $('fire').classList.toggle('off', !st);
  if (state) $('score').textContent = `⭐ ${state.gold}  🪨 ${state.score}`;
}

// ---------- kar: ahol a hüvelykujj leér, ott a közepe ----------
const stick = $('stick'), base = $('base'), knob = $('knob');
const R = 70;
let stickId = null, ox = 0, oy = 0;
function placeStick(cx, cy, kx, ky) {
  base.style.left = cx + 'px'; base.style.top = cy + 'px';
  knob.style.left = kx + 'px'; knob.style.top = ky + 'px';
}
function centerStick() { const r = stick.getBoundingClientRect(); placeStick(r.width / 2, r.height / 2, r.width / 2, r.height / 2); }
const q = (v) => Math.round(v * 20) / 20;
stick.addEventListener('pointerdown', (e) => {
  stickId = e.pointerId; stick.setPointerCapture(e.pointerId);
  const r = stick.getBoundingClientRect(); ox = e.clientX - r.left; oy = e.clientY - r.top;
  placeStick(ox, oy, ox, oy);
});
stick.addEventListener('pointermove', (e) => {
  if (e.pointerId !== stickId) return;
  const r = stick.getBoundingClientRect();
  let dx = e.clientX - r.left - ox, dy = e.clientY - r.top - oy;
  const d = Math.hypot(dx, dy);
  if (d > R) { dx *= R / d; dy *= R / d; }
  knob.style.left = (ox + dx) + 'px'; knob.style.top = (oy + dy) + 'px';
  const nx = q(dx / R), ny = q(dy / R);
  if (nx !== pad.x || ny !== pad.y) { pad.x = nx; pad.y = ny; sendPad(false); }
});
const stickUp = (e) => { if (e.pointerId !== stickId) return; stickId = null; pad.x = 0; pad.y = 0; centerStick(); sendPad(false); };
stick.addEventListener('pointerup', stickUp);
stick.addEventListener('pointercancel', stickUp);
new ResizeObserver(() => { if (stickId === null) centerStick(); }).observe(stick);   // a rejtett nézetben 0 a méret

const fire = $('fire');
const press = (v) => { if (pad.b === v) return; pad.b = v; fire.classList.toggle('on', v); if (v) navigator.vibrate?.(15); sendPad(false); };
fire.addEventListener('pointerdown', (e) => { fire.setPointerCapture(e.pointerId); press(true); });
fire.addEventListener('pointerup', () => press(false));
fire.addEventListener('pointercancel', () => press(false));
fire.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- laptop: nyilak/WASD a kar, szóköz a gomb, 1-3 az állomás ----------
const keys = new Set();
function keyStick() {
  const x = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0);
  const y = (keys.has('ArrowDown') || keys.has('s') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('w') ? 1 : 0);
  const d = Math.hypot(x, y) || 1;
  pad.x = q(x / d); pad.y = q(y / d); sendPad(false);
}
addEventListener('keydown', (e) => {
  if (!me || e.target.tagName === 'INPUT') return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === ' ') { e.preventDefault(); press(true); return; }
  if (/^[1-9]$/.test(k) && STATION_IDS[+k - 1]) { goStation(STATION_IDS[+k - 1]); return; }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(k)) { e.preventDefault(); keys.add(k); keyStick(); }
});
addEventListener('keyup', (e) => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === ' ') { press(false); return; }
  if (keys.delete(k)) keyStick();
});

// ---------- indulás: ha már volt színem ebben a szobában, visszaülök rá ----------
let prev = 0;
try { if (!isLocal) prev = Number(localStorage.getItem(saved)) || 0; } catch (e) { /* privát mód */ }   // helyi próbában a lapok közös tárat látnak
if (prev && PLAYERS[prev]) choose(prev); else showPick();
