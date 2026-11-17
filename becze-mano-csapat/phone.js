// Becze Manó-csapat: a telefon (vagy laptop). Csak a kar és a gomb állását küldi.
import { connectPhone, isLocal, validRoom } from './transport.js';
import { VERSION, MANOK, MANO_IDS, PAD_MS, PAD_HEARTBEAT_MS } from './rules.js';

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
const pad = { x: 0, y: 0, b: false, k: false, st: '', s: 0, r: 0 };
const sentAt = new Map();
let lastSent = 0, sendTimer = null, lastJson = '';
function sendPad(force) {
  if (!me) return;
  const now = performance.now();
  const body = { x: pad.x, y: pad.y, b: pad.b, k: pad.k, st: pad.st, r: pad.r };
  const json = JSON.stringify(body);
  if (!force && json === lastJson && now - lastSent < PAD_HEARTBEAT_MS) return;
  if (now - lastSent < PAD_MS) {
    if (!sendTimer) sendTimer = setTimeout(() => { sendTimer = null; sendPad(true); }, PAD_MS - (now - lastSent));
    return;
  }
  pad.s++; lastSent = now; lastJson = json;
  sentAt.set(pad.s, now);
  if (sentAt.size > 60) sentAt.delete(sentAt.keys().next().value);
  net.setPad(me, { ...body, s: pad.s }).catch(() => {});
}
setInterval(() => sendPad(false), 500);

const rtts = [];
function measure(ack) {
  const t = sentAt.get(ack);
  if (t === undefined) return;
  sentAt.delete(ack);
  rtts.push(performance.now() - t); if (rtts.length > 12) rtts.shift();
  const med = [...rtts].sort((a, b) => a - b)[Math.floor(rtts.length / 2)];
  pad.r = Math.round(med);
  $('lag').textContent = `késés ~${Math.round(med / 2)} ms`;
  $('lag').style.color = med > 500 ? '#fca5a5' : med > 250 ? '#fde047' : '#86efac';
}

// ---------- állapot a kivetítőtől ----------
let state = null, lastState = performance.now(), lastWin = false, lastHome = 0;
net.on((m) => {
  state = m; lastState = performance.now();
  $('offline').hidden = true;
  checkVersion(m.version);
  if (me && m.ack && m.ack[me] !== undefined) measure(m.ack[me]);
  if (m.win && !lastWin) navigator.vibrate?.([120, 60, 120, 60, 240]);
  lastWin = !!m.win;
  const home = m.home ? m.home[me] : 0;
  if (home && !lastHome) navigator.vibrate?.(60);
  lastHome = home;
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

// ---------- manóválasztás ----------
const saved = `mano-valasztas-${room || 'helyi'}`;
async function choose(p) {
  me = p;
  try {
    pad.s++;
    await net.setPad(p, { x: 0, y: 0, b: false, k: false, st: '', r: 0, s: pad.s });
  } catch (e) {
    me = 0; $('pickMsg').textContent = `${MANOK[p].name} már foglalt, válassz mást!`; showPick(); return;
  }
  try { localStorage.setItem(saved, String(p)); } catch (e) { /* privát mód */ }
  const M = MANOK[p];
  document.documentElement.style.setProperty('--c', M.color);
  document.documentElement.style.setProperty('--d', M.dark);
  $('meIcon').textContent = M.icon; $('meName').textContent = M.name;
  $('skill').textContent = M.skill;
  $('fireTxt').innerHTML = {
    1: 'UGRÁS<br><small>kötélen: elengedés</small>',
    2: 'UGRÁS<br><small>legfeljebb ötöt</small>',
    3: 'REPÜLÉS<br><small>tartsd nyomva</small>',
    4: 'UGRÁS',
  }[p];
  // második gomb: Kavicsnál a kötélnyíl (a kar iránya a célzás), Indásnál az inda
  $('vine').hidden = !(p === 1 || p === 4);
  $('vineTxt').innerHTML = p === 1 ? '🏹 NYÍL<br><small>a kar felé lő</small>' : '🌱 INDA';
  $('pick').hidden = true; $('game').hidden = false;
  render();
}
function showPick() {
  $('game').hidden = true; $('pick').hidden = false;
  const box = $('colors');
  if (!box.children.length) {
    for (const p of MANO_IDS) {
      const M = MANOK[p], b = document.createElement('button');
      b.className = 'pickbtn'; b.style.background = M.color; b.dataset.p = p;
      b.innerHTML = `<span class="emo">${M.icon}</span><span>${M.name}<small>${M.skill}</small></span>`;
      b.onclick = () => choose(p);
      box.appendChild(b);
    }
  }
  for (const b of box.children) b.disabled = !!(state && state.players && state.players[b.dataset.p] !== undefined);
}
addEventListener('pagehide', () => { if (me) net.leave(me); });

function render() {
  if (!me) { if (!$('pick').hidden || $('game').hidden) showPick(); return; }
  if (!state) return;
  $('score').textContent = state.win ? '🎉 Sikerült!' : `${state.level}. pálya · ⭐ ${state.got}/${state.stars}${state.home && state.home[me] ? ' · ✅' : ''}`;
  $('hint').textContent = state.hint || '';
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
new ResizeObserver(() => { if (stickId === null) centerStick(); }).observe(stick);

const fire = $('fire');
const press = (v) => { if (pad.b === v) return; pad.b = v; fire.classList.toggle('on', v); if (v) navigator.vibrate?.(15); sendPad(false); };
fire.addEventListener('pointerdown', (e) => { fire.setPointerCapture(e.pointerId); press(true); });
fire.addEventListener('pointerup', () => press(false));
fire.addEventListener('pointercancel', () => press(false));
fire.addEventListener('contextmenu', (e) => e.preventDefault());

// a második gomb: Kavicsnál NYÍL, Indásnál INDA (a magnál a mag)
const vine = $('vine');
const vinePress = (v) => { if (pad.k === v) return; pad.k = v; vine.classList.toggle('on', v); if (v) navigator.vibrate?.(25); sendPad(false); };
vine.addEventListener('pointerdown', (e) => { vine.setPointerCapture(e.pointerId); vinePress(true); });
vine.addEventListener('pointerup', () => vinePress(false));
vine.addEventListener('pointercancel', () => vinePress(false));
vine.addEventListener('contextmenu', (e) => e.preventDefault());

// pálya újra: 1,5 mp-ig nyomva tartva szavaz; a kivetítő akkor kezdi újra, ha a játékosok fele szavaz
const reset = $('reset'), bar = reset.querySelector('i');
let resetT = null, resetStart = 0;
function resetDown(e) {
  reset.setPointerCapture?.(e.pointerId);
  resetStart = performance.now();
  resetT = setInterval(() => {
    const k = Math.min(1, (performance.now() - resetStart) / 1500);
    bar.style.width = `${k * 100}%`;
    if (k >= 1 && pad.st !== 'reset') { pad.st = 'reset'; navigator.vibrate?.(80); sendPad(true); }
  }, 50);
}
function resetUp() {
  clearInterval(resetT); resetT = null; bar.style.width = '0';
  if (pad.st) { pad.st = ''; sendPad(true); }
}
reset.addEventListener('pointerdown', resetDown);
reset.addEventListener('pointerup', resetUp);
reset.addEventListener('pointercancel', resetUp);

// ---------- laptop: nyilak/WASD a kar, szóköz a gomb ----------
const keys = new Set();
function keyStick() {
  const x = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0);
  const y = (keys.has('ArrowDown') || keys.has('s') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('w') ? 1 : 0);
  pad.x = x; pad.y = y; sendPad(false);
}
addEventListener('keydown', (e) => {
  if (!me || e.target.tagName === 'INPUT') return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === ' ') { e.preventDefault(); press(true); return; }
  if (k === 'e' || k === 'Enter') { e.preventDefault(); vinePress(true); return; }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(k)) { e.preventDefault(); keys.add(k); keyStick(); }
});
addEventListener('keyup', (e) => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === ' ') { press(false); return; }
  if (k === 'e' || k === 'Enter') { vinePress(false); return; }
  if (keys.delete(k)) keyStick();
});

// ---------- indulás: ?mano=3 (próba), vagy amit ebben a szobában már választottam ----------
let prev = Number(params.get('mano')) || 0;
try { if (!prev && !isLocal) prev = Number(localStorage.getItem(saved)) || 0; } catch (e) { /* privát mód */ }
if (prev && MANOK[prev]) choose(prev); else showPick();
