// Becze Manó-csapat: a kivetítő. Itt fut a játék, a telefonok csak a karjuk és a gombjuk állását küldik.
// v0.3: végtelen ég (felhők, madarak, hőlégballon, sárkány, bagoly, meglepetések), Kavics kötélnyila, 10 új pálya.
import { connectScreen } from './transport.js';
import {
  VERSION, MANOK, MANO_IDS, LETTER_COLORS, T, COLS, ROWS, GRAVITY,
  HELI_UP, HELI_UP_LOADED, HELI_DOWN, VINE_LIFE, VINE_MAX, VINE_SPEED, FURGE_JUMPS, ROPE, PAD_GONE_MS,
} from './rules.js';
import { LEVELS } from './levels.js';

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const W = 1920, H = 1080, OY = 56, VH = H - OY;   // a pálya a felső sáv alatt kezdődik (16 sor × 64 = 1024)
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

let net;
try { net = await connectScreen(); }
catch (e) {
  ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fca5a5'; ctx.font = '700 48px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('Nem sikerült csatlakozni a Firebase-hez. Van internet?', W / 2, 500);
  ctx.fillStyle = '#94a3b8'; ctx.font = '500 32px system-ui';
  ctx.fillText('Próba mód internet nélkül: screen.html?helyi=1', W / 2, 570);
  throw e;
}

// ---------- QR a telefonoknak ----------
const phoneUrl = net.room ? new URL(`phone.html?room=${net.room}`, location.href).href : new URL('phone.html?helyi=1', location.href).href;
let qrCanvas = null;
(function loadQr() {
  if (!net.room) return;
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
  s.onload = () => {
    const qr = window.qrcode(0, 'M');
    qr.addData(phoneUrl); qr.make();
    const n = qr.getModuleCount(), cell = 10, pad = 4;
    qrCanvas = document.createElement('canvas');
    qrCanvas.width = qrCanvas.height = (n + pad * 2) * cell;
    const q = qrCanvas.getContext('2d');
    q.fillStyle = '#fff'; q.fillRect(0, 0, qrCanvas.width, qrCanvas.height);
    q.fillStyle = '#0b1020';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) q.fillRect((c + pad) * cell, (r + pad) * cell, cell, cell);
  };
  document.head.appendChild(s);
})();

// ---------- játékosok (a játékos száma = a manó száma) ----------
const rnd = (a, b) => a + Math.random() * (b - a);
const P = Object.fromEntries(MANO_IDS.map((p) => [p, { joined: false, x: 0, y: 0, b: false, k: false, st: '', s: 0, r: 0, seen: 0, rate: 0, cnt: 0, prevB: false, prevK: false, prevY: 0, buf: 0 }]));
net.onPad((p, pad) => {
  const Q = P[p];
  if (!Q) return;
  if (!pad) { Q.joined = false; return; }
  const clamp = (v) => Math.max(-1, Math.min(1, Number(v) || 0));
  if (!Q.joined) { Q.joined = true; spawnMano(p); }
  Q.seen = performance.now(); Q.cnt++;
  Q.x = clamp(pad.x); Q.y = clamp(pad.y); Q.b = !!pad.b; Q.k = !!pad.k; Q.s = pad.s || 0; Q.r = pad.r || 0; Q.st = pad.st || '';
});
setInterval(() => {
  const now = performance.now();
  for (const p of MANO_IDS) {
    const Q = P[p];
    Q.rate = Q.cnt; Q.cnt = 0;
    if (Q.joined && now - Q.seen > PAD_GONE_MS) { Q.joined = false; net.kick?.(p); }
  }
}, 1000);

// ---------- a pálya ----------
const G = {
  li: 0, L: null, grid: [], sky: {}, spawns: {}, exits: {}, stars: [], plates: [], doors: [], levers: {}, leverPos: [],
  seeds: [], grow: [], vines: [], crack: {}, crates: [], manos: {}, parts: [], got: 0,
  // az ég: felhők (ráállni), madarak, hőlégballonok, sárkányok (belekapaszkodni), baglyok, égi csillagok, meglepetések
  clouds: [], birds: [], balloons: [], kites: [], owls: [], skyStars: [], specials: [], skyGen: 0, band: 0, skyGot: 0,
  bubbles: [], said: {}, camY: 0, boom: 0,
  phase: 'play', phaseT: 0, time: 0, resetLatch: false, dirty: true,
};
try { G.li = Math.max(0, Math.min(LEVELS.length - 1, Number(localStorage.getItem('mano-palya-v3')) || 0)); } catch (e) { /* privát mód */ }

function loadLevel(i) {
  G.li = (i + LEVELS.length) % LEVELS.length;
  try { localStorage.setItem('mano-palya-v3', String(G.li)); } catch (e) { /* privát mód */ }
  const L = G.L = LEVELS[G.li];
  G.grid = []; G.sky = {}; G.spawns = {}; G.exits = {}; G.stars = []; G.plates = []; G.doors = []; G.levers = {}; G.leverPos = [];
  G.seeds = []; G.grow = []; G.vines = []; G.crack = {}; G.crates = []; G.parts = []; G.got = 0; G.phase = 'play'; G.phaseT = 0;
  G.clouds = []; G.birds = []; G.balloons = []; G.kites = []; G.owls = []; G.skyStars = []; G.specials = []; G.skyGen = 0; G.band = 0; G.skyGot = 0;
  G.bubbles = []; G.said = {}; G.camY = 0; G.boom = 0;
  const heavy = L.heavy || '', levers = L.levers || '';
  L.map.forEach((row, r) => {
    G.grid[r] = [];
    [...row].forEach((ch, c) => {
      let t = ch;
      if ('1234'.includes(ch)) { G.spawns[+ch] = { c, r }; t = '.'; }
      else if ('KFLI'.includes(ch)) { G.exits[{ K: 1, F: 2, L: 3, I: 4 }[ch]] = { c, r }; t = '.'; }
      else if (ch === '*') { G.stars.push({ c, r, got: false, t: Math.random() * 6 }); t = '.'; }
      else if (ch === 'o' || ch === 'O') { G.crates.push(newBody(c, r, 0.9, 0.9, { kind: 'crate', heavy: ch === 'O' })); t = '.'; }
      else if ('abcde'.includes(ch)) {
        if (levers.includes(ch)) { G.leverPos.push({ c, r, l: ch, touch: false, cd: 0 }); G.levers[ch] = false; }
        else G.plates.push({ c, r, l: ch, heavy: heavy.includes(ch), down: false, press: 0 });
        t = '.';
      } else if ('ABCDE'.includes(ch)) { G.doors.push({ c, r, L: ch, open: false, a: 0 }); }
      else if (ch === 's' || ch === 'w') { G.seeds.push({ c, r, kind: ch, used: false }); t = '.'; }
      G.grid[r][c] = t;
    });
  });
  G.manos = {};
  for (const p of MANO_IDS) if (P[p].joined) spawnMano(p);
  if (L.sky) genSky(-2500);
  G.dirty = true;
}
function newBody(c, r, w, h, extra) {
  const bw = w * T, bh = h * T;
  return { x: c * T + (T - bw) / 2, y: (r + 1) * T - bh, w: bw, h: bh, vx: 0, vy: 0, ground: false, on: null, dx: 0, dy: 0, ...extra };
}
function spawnMano(p) {
  if (!G.L) return;
  const s = G.spawns[p], M = MANOK[p];
  const old = G.manos[p];
  G.manos[p] = newBody(s.c, s.r, M.w, M.h, { kind: 'mano', id: p, face: 1, climb: false, coyote: 0, flash: old ? 0.6 : 0, squash: 0, hang: null, hx: 0, grabCd: 0, fling: 0, jumps: 0, rope: null, arrow: null, stall: false });
  // aki ebbe a manóba kapaszkodott, az elenged
  for (const o of Object.values(G.manos)) if (o.hang === old) o.hang = null;
  burst(s.c * T + T / 2, s.r * T + T / 2, M.color, 18, 260);
}
function say(x, y, text, key, cd = 6) {   // szövegbuborék; a key-jel ismétlődő mondatot ritkítunk
  if (key) { if (G.said[key] > G.time) return; G.said[key] = G.time + cd; }
  G.bubbles.push({ x, y, text, t: 3.2 });
}

// ---------- csempék ----------
// a pálya fölött (r < 0) az égi pályákon szabad levegő van (ott csak inda nőhet), a zárt pályákon fal
function tileAt(c, r) {
  if (c < 0 || c >= COLS) return '#';
  if (r < 0) return G.L && G.L.sky ? (G.sky[`${c},${r}`] || '.') : '#';
  if (r >= ROWS) return '.';
  return G.grid[r][c];
}
function setTile(c, r, t) {
  if (c < 0 || c >= COLS || r >= ROWS) return;
  if (r < 0) { if (t === '.') delete G.sky[`${c},${r}`]; else G.sky[`${c},${r}`] = t; }
  else { G.grid[r][c] = t; G.dirty = true; }
}
// a gomb és a kar annak a kapunak a színét kapja, amelyiket nyitja (így a gyerek látja, mi mihez tartozik)
function colorOf(l) {
  for (const d of G.doors) {
    const groups = (G.L.need && G.L.need[d.L]) || [[d.L.toLowerCase()]];
    if (groups.some((g) => g.includes(l))) return LETTER_COLORS[d.L.toLowerCase()];
  }
  return LETTER_COLORS[l];
}
function doorOpenAt(c, r) { const d = G.doors.find((q) => q.c === c && q.r === r); return d ? d.open : true; }
function solidFor(b, c, r) {
  const t = tileAt(c, r);
  if (t === '#' || t === 'x' || t === '=') return true;
  if (t === 'g') return !(b.kind === 'mano' && b.id === 2);
  if ('ABCDE'.includes(t)) return !doorOpenAt(c, r);
  return false;
}
// a nyíl ebbe akad bele (a rácsba is)
function hookable(c, r) { const t = tileAt(c, r); return t === '#' || t === 'x' || t === '=' || t === 'g' || ('ABCDE'.includes(t) && !doorOpenAt(c, r)); }
function overlapTiles(b, fn) {
  const c0 = Math.floor(b.x / T), c1 = Math.floor((b.x + b.w - 0.01) / T);
  const r0 = Math.floor(b.y / T), r1 = Math.floor((b.y + b.h - 0.01) / T);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (fn(c, r)) return true;
  return false;
}
const overl = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const isVine = (c, r) => { const t = tileAt(c, r); return t === 'V' || t === 'v'; };

// tengelyenkénti mozgás ütközéssel: falak, zárt kapuk, ládák; függőlegesen a manók feje, a felhők és a ballon kosara is talaj
function moveX(b, d) {
  if (!d) return false;
  b.x += d;
  let hit = false;
  const c0 = Math.floor(b.x / T), c1 = Math.floor((b.x + b.w - 0.01) / T);
  const r0 = Math.floor(b.y / T), r1 = Math.floor((b.y + b.h - 0.01) / T);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    if (!solidFor(b, c, r)) continue;
    if (d > 0) b.x = Math.min(b.x, c * T - b.w); else b.x = Math.max(b.x, (c + 1) * T);
    hit = true;
  }
  for (const k of G.crates) {
    if (k === b || !overl(b, k)) continue;
    if (b.kind === 'mano' && (!k.heavy || b.id === 1)) k.push = Math.sign(d) * MANOK[b.id].speed * (k.heavy ? 0.45 : 0.6);
    if (d > 0) b.x = k.x - b.w; else b.x = k.x + k.w;
    hit = true;
  }
  if (hit) b.vx = 0;
  return hit;
}
function platforms() { return [...G.clouds, ...G.balloons, ...G.specials.filter((s) => s.plat)]; }
function moveY(b, d) {
  const prevBottom = b.y + b.h;
  b.y += d;
  let hit = false;
  const c0 = Math.floor(b.x / T), c1 = Math.floor((b.x + b.w - 0.01) / T);
  const r0 = Math.floor(b.y / T), r1 = Math.floor((b.y + b.h - 0.01) / T);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    if (!solidFor(b, c, r)) continue;
    if (d > 0) { b.y = Math.min(b.y, r * T - b.h); b.ground = true; } else b.y = Math.max(b.y, (r + 1) * T);
    hit = true;
  }
  for (const k of G.crates) {
    if (k === b || !overl(b, k)) continue;
    if (d > 0) { b.y = k.y - b.h; b.ground = true; b.on = k; } else b.y = k.y + k.h;
    hit = true;
  }
  if (d > 0) {
    for (const m of Object.values(G.manos)) {   // egymás fejére állni (csak felülről)
      if (m === b || !overl(b, m) || prevBottom > m.y + 2) continue;
      b.y = m.y - b.h; b.ground = true; b.on = m; hit = true;
    }
    for (const p of platforms()) {   // felhő, ballon-kosár, hold: csak felülről
      if (b.x + b.w <= p.x || b.x >= p.x + p.w || prevBottom > p.y + 2 || b.y + b.h < p.y) continue;
      b.y = p.y - b.h; b.ground = true; b.on = p; hit = true;
    }
  }
  if (hit) b.vy = 0;
  return hit;
}

// ---------- részecskék ----------
function burst(x, y, color, n, speed = 220) {
  for (let i = 0; i < n; i++) { const a = rnd(0, 6.3), v = rnd(40, speed); G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: rnd(.4, .9), color, g: 500 }); }
}
const RAINBOW = ['#ef4444', '#f97316', '#facc15', '#4ade80', '#60a5fa', '#a78bfa'];

// ---------- az ég: sávonként (700 px) generálva, ahogy feljebb jutunk ----------
function genSky(upTo) {
  while (G.skyGen > upTo) {
    const y1 = G.skyGen, y0 = y1 - 700, n = ++G.band;
    G.skyGen = y0;
    const yy = () => rnd(y0 + 60, y1 - 60);
    for (let i = 0; i < 3; i++) {
      const w = Math.round(rnd(2, 4)) * T, x = rnd(T, COLS * T - w - T);
      G.clouds.push({ x, y: yy(), w, h: 30, dx: 0, dy: 0, kind: 'cloud', puff: Math.random() * 10 });
    }
    for (let i = 0; i < 2; i++) G.skyStars.push({ x: rnd(T, (COLS - 1) * T), y: yy(), got: false, t: rnd(0, 6) });
    if (n % 2 === 1) { const dir = Math.random() < .5 ? 1 : -1, y = yy(); for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) G.birds.push({ x: rnd(0, COLS * T), y: y + i * 30, vx: dir * rnd(90, 160), t: rnd(0, 6), up: 0, color: ['#f8fafc', '#fde68a', '#93c5fd'][i % 3] }); }
    if (n % 3 === 0) { const x = rnd(3 * T, (COLS - 5) * T), y = yy(); G.balloons.push({ x, y, x0: x, y0: y, w: 1.5 * T, h: 26, t: rnd(0, 6), dx: 0, dy: 0, kind: 'balloon', color: RAINBOW[n % RAINBOW.length] }); }
    if (n % 4 === 2) { const x = rnd(3 * T, (COLS - 4) * T), y = yy(); G.kites.push({ x, y, x0: x, w: 0.9 * T, h: T, t: rnd(0, 6), kind: 'kite', color: RAINBOW[(n + 2) % RAINBOW.length] }); }
    if (n % 5 === 4) { const cl = G.clouds[G.clouds.length - 1]; G.owls.push({ x: cl.x + cl.w / 2 - 22, y: cl.y - 52, w: 44, h: 52, said: false, blink: 0 }); }
    // meglepetések a magasban
    const sp = { 4: 'rainbow', 7: 'ufo', 11: 'moon', 16: 'gate' }[n] || (n > 16 && n % 6 === 2 ? ['rainbow', 'ufo'][n % 2] : null);
    if (sp === 'rainbow') G.specials.push({ kind: 'rainbow', x: 0, y: (y0 + y1) / 2, w: COLS * T, h: 40, done: false });
    if (sp === 'ufo') G.specials.push({ kind: 'ufo', x: rnd(6 * T, (COLS - 8) * T), y: y0 + 160, w: 2.4 * T, h: 60, t: 0, done: false });
    if (sp === 'moon') G.specials.push({ kind: 'moon', plat: true, x: rnd(5 * T, (COLS - 10) * T), y: y0 + 300, w: 4 * T, h: 30, dx: 0, dy: 0, done: false });
    if (sp === 'gate') G.specials.push({ kind: 'gate', x: COLS * T / 2 - 90, y: y0 + 200, w: 180, h: 180, done: false });
  }
}
function updateSky(dt) {
  const ms = Object.values(G.manos);
  const topY = Math.min(G.camY, ...ms.map((m) => m.y));
  genSky(topY - 1500);
  for (const b of G.birds) {
    b.t += dt; b.x += b.vx * dt; b.up = Math.max(0, b.up - dt); if (b.up) b.y -= 120 * dt;
    if (b.x < -80) b.x = COLS * T + 60; if (b.x > COLS * T + 80) b.x = -60;
    for (const m of ms) if (!b.up && overl(m, { x: b.x - 20, y: b.y - 12, w: 40, h: 24 })) {
      b.up = 1.6; m.vx += Math.sign(b.vx) * 260; m.fling = 0.25; burst(b.x, b.y, '#f8fafc', 10, 160);
      say(b.x, b.y - 30, ['Csipp-csirip!', 'Hé, vigyázz!', 'Szia, manó!'][Math.floor(Math.random() * 3)]);
    }
  }
  for (const bl of G.balloons) {
    const x0 = bl.x, y0 = bl.y; bl.t += dt;
    bl.x = bl.x0 + Math.sin(bl.t * 0.3) * 3 * T; bl.y = bl.y0 + Math.sin(bl.t * 0.5) * 60;
    bl.dx = bl.x - x0; bl.dy = bl.y - y0;
  }
  for (const k of G.kites) {
    k.t += dt;
    const held = ms.some((m) => m.hang === k);
    if (held) { k.y -= 45 * dt; if (!k.held) say(k.x, k.y - 40, 'Fújj, szél! Repül a sárkány!', 'kite', 8); }
    k.held = held;
    k.x = k.x0 + Math.sin(k.t * 0.8) * 50;
  }
  for (const o of G.owls) {
    o.blink = Math.max(0, o.blink - dt); if (Math.random() < dt * 0.4) o.blink = 0.15;
    if (!o.said && ms.some((m) => overl(m, { x: o.x - 30, y: o.y - 20, w: o.w + 60, h: o.h + 40 }))) {
      o.said = true; G.skyGot++; say(o.x + o.w / 2, o.y - 20, 'Huhú! Ügyesek vagytok! ⭐'); burst(o.x + 22, o.y, '#fde047', 20, 260);
    }
  }
  for (const s of G.skyStars) {
    s.t += dt;
    if (!s.got && ms.some((m) => overl(m, { x: s.x - 22, y: s.y - 22, w: 44, h: 44 }))) { s.got = true; G.skyGot++; burst(s.x, s.y, '#fde047', 22, 300); }
  }
  for (const sp of G.specials) {
    sp.t = (sp.t || 0) + dt;
    if (sp.kind === 'ufo') {
      for (const m of ms) {   // a csóva lassan felhúz, aki alá kerül
        const cx = m.x + m.w / 2;
        if (cx > sp.x + 20 && cx < sp.x + sp.w - 20 && m.y > sp.y && m.y < sp.y + 520 && !m.hang) { m.vy = Math.min(m.vy, -140); }
      }
    }
    if (sp.done) continue;
    const touch = ms.find((m) => sp.kind === 'rainbow' ? (m.y < sp.y + 20 && m.y + m.h > sp.y - 20) : overl(m, { x: sp.x - 10, y: sp.y - 30, w: sp.w + 20, h: sp.h + 60 }));
    if (!touch) continue;
    sp.done = true;
    const x = touch.x + touch.w / 2, y = touch.y - 40;
    if (sp.kind === 'rainbow') { G.skyGot += 5; say(x, y, 'Szivárvány! +5 ⭐'); for (const c of RAINBOW) burst(x, touch.y, c, 14, 400); }
    if (sp.kind === 'ufo') { G.skyGot += 3; say(sp.x + sp.w / 2, sp.y - 30, '👽 Szia, manók! Gyertek máskor is! +3 ⭐'); }
    if (sp.kind === 'moon') { G.skyGot += 3; say(x, y, 'A Holdon vagytok! 🌙 +3 ⭐'); }
    if (sp.kind === 'gate') { G.skyGot += 10; G.boom = 1.6; say(x, y, 'Elértétek a Csillagkaput! 🌟 +10 ⭐'); for (const c of RAINBOW) burst(sp.x + 90, sp.y + 90, c, 30, 700); }
  }
  for (const b of G.bubbles) b.t -= dt;
  G.bubbles = G.bubbles.filter((b) => b.t > 0);
}

// ---------- lánc: ki kibe kapaszkodik ----------
function rootOf(m) { let c = m, d = 0; while (c.hang && d < 8) { c = c.hang; d++; } return c; }
function chainOf(root) { return Object.values(G.manos).filter((o) => o !== root && o.hang && rootOf(o) === root); }
// fent az égben, ha valaki elenged, az egész lánc a földre pottyan: a Kopter propellere is leáll
function collapse(heli) {
  for (const o of chainOf(heli)) { o.hang = null; o.grabCd = 1; o.vy = 0; }
  heli.stall = true;
  say(heli.x + heli.w / 2, heli.y - 40, 'Jaj! Mindenki lepottyan!', 'collapse', 3);
}

// ---------- frissítés ----------
function update(dt) {
  G.time += dt;
  if (!G.L) return;

  // ládák: gravitáció, tolás
  for (const k of G.crates) {
    const x0 = k.x, y0 = k.y;
    k.vy = Math.min(1100, k.vy + GRAVITY * dt);
    k.vx = k.push || 0; k.push = 0;
    moveX(k, k.vx * dt);
    k.ground = false; k.on = null;
    moveY(k, k.vy * dt);
    k.dx = k.x - x0; k.dy = k.y - y0;
  }
  if (G.L.sky) updateSky(dt);

  // manók: alulról fölfelé, hogy aki valakin áll, az a hordozójával együtt mozogjon
  const list = Object.values(G.manos).sort((a, b) => (b.y + b.h) - (a.y + a.h));
  for (const m of list) {
    const M = MANOK[m.id], Q = P[m.id], x0 = m.x, y0 = m.y;
    const carrier = m.on;
    if (carrier && (carrier.dx || carrier.dy)) { moveX(m, carrier.dx); if (carrier.dy < 0) moveY(m, carrier.dy); else m.y += carrier.dy; }
    const pressed = Q.b && !Q.prevB, kPressed = Q.k && !Q.prevK;
    if (pressed) Q.buf = 0.15; else Q.buf = Math.max(0, Q.buf - dt);
    const ix = Math.abs(Q.x) > 0.2 ? Q.x : 0, iy = Q.y;
    if (ix) m.face = Math.sign(ix);
    m.grabCd = Math.max(0, m.grabCd - dt); m.fling = Math.max(0, m.fling - dt);
    const end = () => { Q.prevB = Q.b; Q.prevK = Q.k; Q.prevY = iy; };

    // kapaszkodás: a gomb leugrik, a kar lefelé elenged; fent az égben ilyenkor az egész lánc lepottyan
    if (m.hang) {
      const root = rootOf(m);
      if (Q.buf > 0 || iy > 0.7) {
        m.hang = null; m.grabCd = 0.6;
        if (Q.buf > 0) { m.vy = -M.jump * 0.75; Q.buf = 0; m.squash = 0.2; } else m.vy = 0;
        if (root.id === 3 && root.y < 0) collapse(root);
      } else { m.vx = 0; m.vy = 0; m.dx = 0; m.dy = 0; m.jumps = 0; end(); continue; }
    }

    // Kavics nyila: a NYÍL gomb kilövi (a kar irányába, vagy ferdén előre-fel); ahol megakad, ott a kötél vége
    if (m.id === 1) {
      if (kPressed) shootArrow(m, Q);
      if (m.arrow) flyArrow(m, dt);
      if (m.rope && m.rope.tile && !hookable(m.rope.tile[0], m.rope.tile[1])) { m.rope = null; burst(m.x + m.w / 2, m.y, '#a8a29e', 8, 120); }
    }

    const onVine = !m.rope && overlapTiles({ x: m.x + m.w * .3, y: m.y, w: m.w * .4, h: m.h }, isVine);
    if (!onVine) m.climb = false;
    else if (Math.abs(iy) > 0.45) m.climb = true;

    if (m.climb) {
      m.vx = ix * 150; m.vy = (Math.abs(iy) > 0.2 ? iy : 0) * 210; m.jumps = 0;
      if (Q.buf > 0) { m.climb = false; m.vy = -M.jump * 0.85; Q.buf = 0; m.jumps = 1; }
    } else if (m.rope) {
      // kötélen: lengetés a karral oldalra, fel-le mászás a karral fel-le, ugrás: elenged és lendül
      const R = m.rope;
      m.vy = Math.min(1100, m.vy + GRAVITY * dt);
      if (m.ground) m.vx += (ix * M.speed - m.vx) * Math.min(1, 14 * dt);
      else { m.vx += ix * ROPE.pump * dt; m.vx *= 1 - ROPE.drag * dt; m.vy *= 1 - ROPE.drag * dt; }
      if (Math.abs(iy) > 0.3) R.len = Math.max(ROPE.min, Math.min(ROPE.max, R.len + iy * ROPE.climb * dt));
      if (Q.buf > 0) { m.rope = null; m.vy = Math.min(m.vy, 0) - 420; m.fling = 0.6; Q.buf = 0; m.squash = 0.2; burst(m.x + m.w / 2, m.y, '#e2e8f0', 10, 160); }
    } else {
      const target = ix * M.speed;
      if (!m.fling) m.vx += (target - m.vx) * Math.min(1, (m.ground ? 14 : 7) * dt);
      if (m.id === 3) heliPhysics(m, Q, iy, dt);
      else m.vy = Math.min(1100, m.vy + GRAVITY * dt);
      if (m.ground) { m.coyote = 0.1; m.jumps = 0; } else m.coyote = Math.max(0, m.coyote - dt);
      if (m.id !== 3 && Q.buf > 0 && m.coyote > 0) {
        if (m.id === 1) launchRiders(m);
        m.vy = -M.jump; m.coyote = 0; Q.buf = 0; m.squash = 0.2; m.jumps = 1;
      } else if (m.id === 2 && Q.buf > 0 && !m.ground) {
        // Fürge: a levegőben is ugrik, de öt ugrás után elfárad, amíg le nem ér
        if (m.jumps < FURGE_JUMPS) { m.vy = -M.jump * 0.85; Q.buf = 0; m.squash = 0.2; m.jumps = Math.max(1, m.jumps) + 1 > FURGE_JUMPS ? FURGE_JUMPS : Math.max(1, m.jumps) + 1; burst(m.x + m.w / 2, m.y + m.h, '#fdba74', 10, 160); }
        else { Q.buf = 0; say(m.x + m.w / 2, m.y - 30, 'Elfáradtam!', 'tired', 3); }
      }
    }
    m.floating = Math.max(0, (m.floating || 0) - dt);

    // kapaszkodás: aki a levegőben a Kopter, egy kapaszkodó vagy egy sárkány aljához ér, belekapaszkodik
    if (m.id !== 3 && !m.ground && !m.grabCd && !m.climb && !m.rope) {
      for (const c of [...Object.values(G.manos), ...G.kites]) {
        if (c === m) continue;
        if (c.kind === 'mano' && (!(c.id === 3 || c.hang) || rootOf(c) === m || c.stall)) continue;
        if (!overl({ x: m.x, y: m.y, w: m.w, h: 14 }, hangZone(c))) continue;
        m.hang = c; m.hx = Math.max(-m.w * 0.5, Math.min(c.w - m.w * 0.5, m.x - c.x)); m.vx = 0; m.vy = 0; m.fling = 0; m.jumps = 0;
        burst(m.x + m.w / 2, m.y, MANOK[m.id].color, 8, 120);
        break;
      }
      if (m.hang) { end(); continue; }
    }

    m.ground = false; m.on = null;
    moveX(m, m.vx * dt);
    const wasUp = m.vy;
    moveY(m, m.vy * dt);
    if (m.rope) ropeConstraint(m);
    if (m.ground && wasUp > 500) m.squash = 0.18;
    if (m.id === 3 && m.ground && m.stall) m.stall = false;
    if (m.fling > 0.2 && Math.random() < 0.6) G.parts.push({ x: m.x + m.w / 2, y: m.y + m.h, vx: rnd(-40, 40), vy: rnd(20, 80), life: 0.5, color: ['#facc15', '#f472b6', '#60a5fa', '#4ade80'][Math.floor(Math.random() * 4)], g: 200 });
    m.dx = m.x - x0; m.dy = m.y - y0;
    m.flash = Math.max(0, m.flash - dt); m.squash = Math.max(0, m.squash - dt);

    // tüske, leesés: vissza a rajthoz, büntetés nélkül
    const hurt = overlapTiles({ x: m.x + 6, y: m.y + 6, w: m.w - 12, h: m.h - 6 }, (c, r) => tileAt(c, r) === '^');
    if ((hurt || m.y > ROWS * T + 40) && m.flash <= 0) { end(); burst(m.x + m.w / 2, m.y + m.h / 2, '#c084fc', 20, 300); spawnMano(m.id); continue; }

    grabStars(m);

    // Kavics alatt a repedt kő beszakad
    if (m.id === 1 && m.ground && !m.on) {
      const r = Math.floor((m.y + m.h + 2) / T);
      for (let c = Math.floor(m.x / T); c <= Math.floor((m.x + m.w - 0.01) / T); c++) {
        if (tileAt(c, r) !== 'x') continue;
        const key = `${c},${r}`;
        G.crack[key] = (G.crack[key] || 0) + dt;
        if (G.crack[key] > 0.35) {   // a szomszédos repedt kövek is vele mennek
          const q = [[c, r]];
          while (q.length) {
            const [cc, rr] = q.pop();
            if (tileAt(cc, rr) !== 'x') continue;
            setTile(cc, rr, '.'); delete G.crack[`${cc},${rr}`];
            burst(cc * T + T / 2, rr * T + T / 2, '#a8a29e', 14, 260);
            q.push([cc - 1, rr], [cc + 1, rr]);
          }
        }
      }
    }

    // Indás: az INDA gomb a magnál a magot növeszti, máshol egy felfelé növő indát
    if (m.id === 4 && kPressed) {
      let used = false;
      for (const s of G.seeds) {
        if (s.used || !overl(m, { x: s.c * T - 8, y: s.r * T, w: T + 16, h: T })) continue;
        s.used = true; used = true;
        growFrom(s);
      }
      if (!used) growVine(m);
    }
    end();
  }

  // a kapaszkodók a hordozójuk alatt lógnak (előbb a közvetlenül kapaszkodók, aztán az alattuk lévők)
  const depth = (m) => { let d = 0, c = m; while (c.hang && d < 8) { c = c.hang; d++; } return d; };
  for (const m of Object.values(G.manos).filter((o) => o.hang).sort((a, b) => depth(a) - depth(b))) {
    const c = m.hang;
    const ok = c.kind === 'kite' ? G.kites.includes(c) : (G.manos[c.id] === c && !c.stall && (c.id === 3 || c.hang));
    if (!ok) { m.hang = null; m.grabCd = 0.4; continue; }
    const x0 = m.x, y0 = m.y, ty = c.kind === 'kite' ? c.y + c.h + 26 : c.y + c.h - 6;
    m.ground = false; m.on = null;
    moveX(m, c.x + m.hx - m.x);
    moveY(m, ty - m.y);
    m.dx = m.x - x0; m.dy = m.y - y0;
    if (Math.abs(m.x - (c.x + m.hx)) > T * 0.8 || Math.abs(m.y - ty) > T * 0.8) { m.hang = null; m.grabCd = 0.5; }
    grabStars(m);
  }

  // karok: elég hozzáérni (odaugrani, odarepülni, odalengeni); átbillen, és úgy is marad
  for (const lv of G.leverPos) {
    if (G.levers[lv.l]) continue;
    const zone = { x: lv.c * T - 6, y: lv.r * T - 6, w: T + 12, h: T + 12 };
    if (Object.values(G.manos).some((m) => overl(m, zone))) { G.levers[lv.l] = true; burst(lv.c * T + T / 2, lv.r * T + T / 2, colorOf(lv.l), 24, 260); }
  }

  // Indás indái: nőnek felfelé, amíg falba nem ütköznek; 30 mp után elsorvadnak
  for (const v of G.vines) {
    v.life -= dt;
    if (!v.stopped) {
      v.acc += VINE_SPEED * dt;
      while (v.acc >= 1 && !v.stopped) {
        v.acc -= 1;
        const r = v.top - 1, t = tileAt(v.c, r);
        if (t !== '.' && t !== ':') { v.stopped = true; break; }
        setTile(v.c, r, 'v'); v.cells.push({ r, orig: t }); v.top = r;
      }
    }
    if (v.life <= 0) witherVine(v);
  }
  G.vines = G.vines.filter((v) => v.life > 0);

  // a növő inda és híd (a magból): csempénként, kis késéssel, hogy látsszon a növés
  for (const g of G.grow) {
    if (g.done) continue;
    g.t -= dt;
    if (g.t <= 0) { g.done = true; setTile(g.c, g.r, g.to); burst(g.c * T + T / 2, g.r * T + T / 2, g.to === 'V' ? '#4ade80' : '#d97706', 6, 120); }
  }

  // gombok és kapuk
  const bodies = [...Object.values(G.manos), ...G.crates];
  for (const pl of G.plates) {
    const zone = { x: pl.c * T + 6, y: pl.r * T + T * 0.5, w: T - 12, h: T * 0.5 + 3 };
    const was = pl.down;
    pl.down = bodies.some((b) => overl(b, zone) && (!pl.heavy || (b.kind === 'mano' ? b.id === 1 : b.heavy)));
    pl.press += ((pl.down ? 1 : 0) - pl.press) * Math.min(1, 12 * dt);
    if (pl.down && !was) burst(pl.c * T + T / 2, (pl.r + 1) * T - 6, colorOf(pl.l), 8, 140);
  }
  const active = (l) => (l in G.levers) ? G.levers[l] : G.plates.some((pl) => pl.l === l && pl.down);
  for (const d of G.doors) {
    const groups = (G.L.need && G.L.need[d.L]) || [[d.L.toLowerCase()]];
    const want = groups.some((g) => g.every(active));
    // a kapu nem csukódik rá senkire
    const blocked = !want && bodies.some((b) => overl(b, { x: d.c * T, y: d.r * T, w: T, h: T }));
    d.open = want || (d.open && blocked);
    d.a += ((d.open ? 1 : 0) - d.a) * Math.min(1, 8 * dt);
  }

  for (const q of G.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += q.g * dt; q.life -= dt; }
  G.parts = G.parts.filter((q) => q.life > 0);
  G.boom = Math.max(0, G.boom - dt);
  for (const s of G.stars) s.t += dt;
  updateCamera(dt);

  // pálya újra: a játékosok fele hosszan nyomja a telefonon az „Újra” gombot
  const joined = MANO_IDS.filter((p) => P[p].joined);
  const votes = joined.filter((p) => P[p].st === 'reset').length;
  if (votes && votes >= Math.max(1, Math.ceil(joined.length / 2))) { if (!G.resetLatch) { G.resetLatch = true; loadLevel(G.li); return; } }
  else if (!votes) G.resetLatch = false;

  // kész a pálya, ha mindenki a saját kijáratán áll
  if (G.phase === 'play') {
    const here = joined.filter((p) => atExit(p));
    if (joined.length && here.length === joined.length) {
      G.phase = 'win'; G.phaseT = 4.5;
      for (const p of joined) { const e = G.exits[p]; burst(e.c * T + T / 2, e.r * T, MANOK[p].color, 30, 420); }
    }
  } else {
    G.phaseT -= dt;
    if (G.phaseT <= 0) loadLevel(G.li + 1);
  }
}

// Kopter: nyomva tartott gombbal emelkedik; egyedül csak a pálya tetejéig, kapaszkodókkal az égig.
// Kavicsot nem bírja el. A tetején állókat a propeller ledobja. Ha leállt a propellere, zuhan, amíg földet nem ér.
function heliPhysics(m, Q, iy, dt) {
  const riders = Object.values(G.manos).filter((o) => o.on === m);
  for (const o of riders) {
    o.on = null; o.vy = -680; o.vx = (Math.sign(o.x + o.w / 2 - (m.x + m.w / 2)) || (Math.random() < .5 ? -1 : 1)) * 380; o.fling = 0.35; o.climb = false;
    burst(o.x + o.w / 2, o.y + o.h, '#e2e8f0', 12, 220);
    say(m.x + m.w / 2, m.y - 50, 'Vigyázz, propeller!', 'prop', 4);
  }
  if (m.stall) { m.vy = Math.min(1100, m.vy + GRAVITY * dt); return; }
  const chain = chainOf(m), heavy = chain.some((o) => o.id === 1);
  if (Q.b) {
    let want = -(chain.length ? HELI_UP_LOADED : HELI_UP);
    if (heavy) { want = 40; say(m.x + m.w / 2, m.y - 50, 'Kavics túl nehéz!', 'heavy', 4); }
    if (G.L.sky && !chain.length && m.y <= 2 && want < 0) { want = 0; m.y = Math.max(m.y, 0); say(m.x + m.w / 2, m.y - 40, 'Egyedül nem megyek feljebb! Kapaszkodjatok belém!', 'alone', 6); }
    m.vy += (want - m.vy) * Math.min(1, 6 * dt); m.floating = 0.3;
  } else if (!m.ground) m.vy += ((iy > 0.5 ? 480 : HELI_DOWN) - m.vy) * Math.min(1, 4 * dt);
  else m.vy = Math.min(1100, m.vy + GRAVITY * dt);
}
function hangZone(c) {
  if (c.kind === 'kite') return { x: c.x - 14, y: c.y + c.h * 0.6, w: c.w + 28, h: 80 };
  return { x: c.x - 12, y: c.y + c.h * 0.5, w: c.w + 24, h: c.h * 0.5 + 22 };
}
function grabStars(m) {
  for (const s of G.stars) if (!s.got && overl(m, { x: s.c * T + 12, y: s.r * T + 12, w: T - 24, h: T - 24 })) { s.got = true; G.got++; burst(s.c * T + T / 2, s.r * T + T / 2, '#fde047', 24, 300); }
}

// ---------- Kavics kötélnyila ----------
function shootArrow(m, Q) {
  let dx = Q.x, dy = Q.y;
  if (Math.hypot(dx, dy) < 0.4) { dx = m.face * 0.5; dy = -0.866; }
  const d = Math.hypot(dx, dy); dx /= d; dy /= d;
  m.arrow = { x: m.x + m.w / 2, y: m.y + m.h / 2, vx: dx * ROPE.speed, vy: dy * ROPE.speed, dist: 0 };
  burst(m.x + m.w / 2, m.y + m.h / 2, '#e7e5e4', 6, 120);
}
function flyArrow(m, dt) {
  const a = m.arrow, steps = Math.ceil(ROPE.speed * dt / 10);
  for (let i = 0; i < steps; i++) {
    a.x += a.vx * dt / steps; a.y += a.vy * dt / steps; a.dist += ROPE.speed * dt / steps;
    const c = Math.floor(a.x / T), r = Math.floor(a.y / T);
    let tile = null, hit = false;
    if (hookable(c, r)) { hit = true; tile = [c, r]; }
    else if (G.L.sky) for (const p of [...G.clouds, ...G.specials.filter((s) => s.plat)]) if (a.x > p.x && a.x < p.x + p.w && a.y > p.y - 10 && a.y < p.y + p.h) { hit = true; break; }
    if (hit) {
      const cx = m.x + m.w / 2, cy = m.y + m.h / 2;
      m.rope = { ax: a.x, ay: a.y, len: Math.max(ROPE.min, Math.min(ROPE.max, Math.hypot(cx - a.x, cy - a.y))), tile };
      m.arrow = null; m.climb = false;
      burst(a.x, a.y, '#fde68a', 10, 160);
      return;
    }
    if (a.dist > ROPE.max) { m.arrow = null; burst(a.x, a.y, '#a8a29e', 6, 80); return; }
  }
}
function ropeConstraint(m) {
  const R = m.rope, cx = m.x + m.w / 2, cy = m.y + m.h / 2;
  const dx = cx - R.ax, dy = cy - R.ay, d = Math.hypot(dx, dy) || 1;
  if (d <= R.len) return;
  const ex = d - R.len;
  moveX(m, -dx / d * ex);
  moveY(m, -dy / d * ex);
  const vr = (m.vx * dx + m.vy * dy) / d;
  if (vr > 0) { m.vx -= vr * dx / d; m.vy -= vr * dy / d; }
}

// pálya-vége
function atExit(p) {
  const m = G.manos[p], e = G.exits[p];
  if (!m || !e) return false;
  const cx = m.x + m.w / 2, bottom = m.y + m.h;
  return cx > e.c * T && cx < (e.c + 1) * T && bottom > e.r * T + T * 0.3 && bottom <= (e.r + 1) * T + 4;
}
function growFrom(s) {
  const path = s.kind === 's' ? ':' : '_', to = s.kind === 's' ? 'V' : '=';
  const seen = new Set([`${s.c},${s.r}`]), q = [[s.c, s.r, 0]];
  if (s.kind === 's') G.grow.push({ c: s.c, r: s.r, to: 'V', t: 0 });   // az inda a mag helyén kezdődik, onnan lehet felmászni
  while (q.length) {
    const [c, r, d] = q.shift();
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const cc = c + dc, rr = r + dr, k = `${cc},${rr}`;
      if (seen.has(k) || tileAt(cc, rr) !== path) continue;
      seen.add(k); q.push([cc, rr, d + 1]);
      G.grow.push({ c: cc, r: rr, to, t: (d + 1) * 0.12 });
    }
  }
  burst(s.c * T + T / 2, s.r * T + T / 2, '#4ade80', 20, 220);
}
// Indás indája: a lábától indul, és nő felfelé, amíg falba, kapuba vagy rácsba nem ütközik (az égben a végtelenségig)
function growVine(m) {
  const c = Math.floor((m.x + m.w / 2) / T), r = Math.floor((m.y + m.h - 1) / T), t = tileAt(c, r);
  if (t === 'v') {   // egy meglévő indán: az inda megújul, újra 30 mp-ig él
    const v = G.vines.find((q) => q.c === c && q.cells.some((cell) => cell.r === r));
    if (v) { v.life = VINE_LIFE; v.stopped = false; burst(c * T + T / 2, m.y + m.h, '#4ade80', 22, 240); }
    return;
  }
  if (t !== '.' && t !== ':') { burst(m.x + m.w / 2, m.y, '#a3a3a3', 8, 100); return; }
  while (G.vines.length >= VINE_MAX) witherVine(G.vines.shift());
  setTile(c, r, 'v');
  G.vines.push({ c, base: r, top: r, cells: [{ r, orig: t }], life: VINE_LIFE, acc: 0, stopped: false });
  burst(c * T + T / 2, m.y + m.h, '#4ade80', 22, 240);
}
function witherVine(v) {
  v.life = 0;
  for (const cell of v.cells) if (tileAt(v.c, cell.r) === 'v') setTile(v.c, cell.r, cell.orig);
  burst(v.c * T + T / 2, v.base * T, '#a3a3a3', 14, 140);
}
// Kavics ugrik, és ha legalább ketten állnak rajta: tűzijáték, mindenki szétpattan (nem túl magasra)
function launchRiders(k) {
  const riders = Object.values(G.manos).filter((o) => { let c = o.on, d = 0; while (c && d < 5) { if (c === k) return true; c = c.on; d++; } return false; });
  if (riders.length < 2) return;
  riders.forEach((o, i) => {
    o.on = null; o.hang = null; o.climb = false; o.squash = 0.2;
    const a = ((i / (riders.length - 1)) * 2 - 1) * 1.0 + rnd(-0.15, 0.15);
    o.vx = Math.sin(a) * 700; o.vy = -1000 * rnd(0.9, 1.1); o.fling = 0.7;
  });
  const x = k.x + k.w / 2, y = k.y;
  for (const col of ['#f87171', '#facc15', '#4ade80', '#60a5fa', '#f472b6', '#c084fc', '#fb923c']) burst(x, y - 40, col, 30, 700);
  G.boom = 1.2;
}

// ---------- kamera: ha valaki felmegy az égbe, a kép követi ----------
function updateCamera(dt) {
  const ms = Object.values(G.manos);
  let target = 0;
  if (ms.length && G.L.sky) {
    const top = Math.min(...ms.map((m) => m.y)), bot = Math.max(...ms.map((m) => m.y + m.h));
    if (top < 40) {
      if (bot - top < VH - 260) target = Math.min(0, bot + 130 - VH);
      else { const heli = G.manos[3]; target = (heli && heli.y < 0 ? heli.y : top) - 260; }
    }
  }
  G.camY += (Math.min(0, target) - G.camY) * Math.min(1, 3 * dt);
}

// ---------- rajzolás ----------
const stat = document.createElement('canvas'); stat.width = COLS * T; stat.height = ROWS * T;
const sc = stat.getContext('2d');
function isSolidTile(c, r) { const t = tileAt(c, r); return t === '#' || t === 'x'; }
function drawStatic() {
  sc.clearRect(0, 0, stat.width, stat.height);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = G.grid[r][c], x = c * T, y = r * T;
    if (t === '#') {
      const top = !isSolidTile(c, r - 1);
      sc.fillStyle = (c + r) % 2 ? '#6b4f3a' : '#634934';
      sc.fillRect(x, y, T, T);
      sc.fillStyle = 'rgba(0,0,0,.12)';
      sc.beginPath(); sc.arc(x + 18 + (c * 7 % 20), y + 26 + (r * 11 % 18), 6, 0, 7); sc.fill();
      sc.beginPath(); sc.arc(x + 44 - (r * 5 % 14), y + 46, 4, 0, 7); sc.fill();
      if (top) {
        sc.fillStyle = '#22c55e'; sc.fillRect(x, y, T, 14);
        sc.fillStyle = '#4ade80'; sc.fillRect(x, y, T, 6);
        sc.fillStyle = '#16a34a';
        for (let i = 0; i < 4; i++) { sc.beginPath(); sc.moveTo(x + 6 + i * 16, y + 14); sc.lineTo(x + 12 + i * 16, y + 22); sc.lineTo(x + 18 + i * 16, y + 14); sc.fill(); }
      }
    } else if (t === 'x') {
      sc.fillStyle = '#a8a29e'; sc.fillRect(x + 1, y + 1, T - 2, T - 2);
      sc.strokeStyle = '#57534e'; sc.lineWidth = 3;
      sc.beginPath(); sc.moveTo(x + 10, y + 8); sc.lineTo(x + 26, y + 30); sc.lineTo(x + 20, y + 44); sc.lineTo(x + 34, y + 58);
      sc.moveTo(x + 26, y + 30); sc.lineTo(x + 50, y + 22); sc.moveTo(x + 40, y + 40); sc.lineTo(x + 56, y + 52); sc.stroke();
    } else if (t === 'g') {
      sc.fillStyle = 'rgba(15,23,42,.35)'; sc.fillRect(x, y, T, T);
      sc.strokeStyle = '#cbd5e1'; sc.lineWidth = 5;
      for (let i = 0; i < 4; i++) { sc.beginPath(); sc.moveTo(x + 8 + i * 16, y); sc.lineTo(x + 8 + i * 16, y + T); sc.stroke(); }
      sc.lineWidth = 4; sc.beginPath(); sc.moveTo(x, y + T / 2); sc.lineTo(x + T, y + T / 2); sc.stroke();
    } else if (t === '^') {
      sc.fillStyle = '#7e22ce';
      for (let i = 0; i < 4; i++) { sc.beginPath(); sc.moveTo(x + i * 16, y + T); sc.lineTo(x + 8 + i * 16, y + T - 34); sc.lineTo(x + 16 + i * 16, y + T); sc.fill(); }
      sc.fillStyle = '#c084fc';
      for (let i = 0; i < 4; i++) { sc.beginPath(); sc.moveTo(x + 5 + i * 16, y + T - 12); sc.lineTo(x + 8 + i * 16, y + T - 34); sc.lineTo(x + 11 + i * 16, y + T - 12); sc.fill(); }
    } else if (t === ':' || t === '_') {   // ahol majd nő valami: halvány pontozás
      sc.setLineDash([6, 8]); sc.lineWidth = 3; sc.strokeStyle = t === ':' ? 'rgba(74,222,128,.35)' : 'rgba(217,119,6,.4)';
      if (t === ':') { sc.beginPath(); sc.moveTo(x + T / 2, y); sc.lineTo(x + T / 2, y + T); sc.stroke(); }
      else { sc.strokeRect(x + 4, y + 4, T - 8, 16); }
      sc.setLineDash([]);
    } else if (t === 'V') {
      sc.strokeStyle = '#15803d'; sc.lineWidth = 8;
      sc.beginPath(); sc.moveTo(x + T / 2, y); sc.bezierCurveTo(x + T / 2 - 14, y + 20, x + T / 2 + 14, y + 44, x + T / 2, y + T); sc.stroke();
      sc.fillStyle = '#4ade80';
      for (const [lx, ly, s] of [[-14, 14, -1], [14, 40, 1]]) { sc.beginPath(); sc.ellipse(x + T / 2 + lx, y + ly, 13, 7, s * .6, 0, 7); sc.fill(); }
    } else if (t === '=') {
      sc.fillStyle = '#b45309'; sc.fillRect(x, y + 2, T, 20);
      sc.fillStyle = '#92400e'; for (let i = 0; i < 4; i++) sc.fillRect(x + i * 16 + 14, y + 2, 3, 20);
      sc.strokeStyle = '#78350f'; sc.lineWidth = 3; sc.beginPath(); sc.moveTo(x, y + 2); sc.quadraticCurveTo(x + T / 2, y + 12, x + T, y + 2); sc.stroke();
    }
  }
  G.dirty = false;
}

function background() {
  // minél feljebb vagyunk, annál sötétebb és csillagosabb az ég
  const alt = Math.max(0, -G.camY), k = Math.min(1, alt / 9000);
  const mix = (a, b) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
  const g = ctx.createLinearGradient(0, OY, 0, H);
  g.addColorStop(0, mix([30, 58, 138], [3, 7, 30])); g.addColorStop(.6, mix([49, 46, 129], [15, 10, 50])); g.addColorStop(1, mix([30, 27, 75], [20, 12, 60]));
  ctx.fillStyle = g; ctx.fillRect(0, OY, W, H - OY);
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  const nStars = 70 + Math.round(k * 130);
  for (let i = 0; i < nStars; i++) {
    const x = (i * 271) % W, y = OY + (((i * 157) + alt * 0.15) % VH);
    ctx.globalAlpha = .3 + .35 * Math.sin(G.time * 1.5 + i); ctx.fillRect(x, y, 3, 3);
  }
  ctx.globalAlpha = 1;
  // a dombok lefelé csúsznak, ahogy emelkedünk
  const hy = H - 330 + alt * 0.4;
  if (hy < H) {
    ctx.fillStyle = '#3730a3';
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 40) ctx.lineTo(x, hy - Math.sin(x / 260) * 70 - Math.sin(x / 90) * 18);
    ctx.lineTo(W, H); ctx.fill();
  }
  const my = OY + 150 + alt * 0.05;
  ctx.fillStyle = 'rgba(253,224,71,.85)'; ctx.beginPath(); ctx.arc(W - 260, my, 60, 0, 7); ctx.fill();
  ctx.fillStyle = mix([49, 46, 129], [8, 8, 40]); ctx.beginPath(); ctx.arc(W - 235, my - 15, 56, 0, 7); ctx.fill();
}

function star(x, y, s, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? s * .45 : s; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill(); ctx.restore();
}

const visible = (y0, y1) => y1 > G.camY - 50 && y0 < G.camY + VH + 50;
function drawSky() {
  for (const sp of G.specials) {
    if (!visible(sp.y - 300, sp.y + sp.h + 300)) continue;
    if (sp.kind === 'rainbow') {
      for (let i = 0; i < RAINBOW.length; i++) { ctx.strokeStyle = RAINBOW[i]; ctx.globalAlpha = sp.done ? .45 : .85; ctx.lineWidth = 18; ctx.beginPath(); ctx.arc(W / 2, sp.y + 700, 900 - i * 18, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke(); }
      ctx.globalAlpha = 1;
    } else if (sp.kind === 'ufo') {
      const x = sp.x + sp.w / 2, y = sp.y + Math.sin(sp.t * 2) * 8;
      const beam = ctx.createLinearGradient(0, y, 0, y + 520); beam.addColorStop(0, 'rgba(134,239,172,.45)'); beam.addColorStop(1, 'rgba(134,239,172,0)');
      ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(x - 40, y + 20); ctx.lineTo(x + 40, y + 20); ctx.lineTo(x + sp.w / 2, y + 520); ctx.lineTo(x - sp.w / 2, y + 520); ctx.fill();
      ctx.fillStyle = '#a5f3fc'; ctx.beginPath(); ctx.ellipse(x, y - 14, 34, 26, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.ellipse(x, y + 4, sp.w / 2, 22, 0, 0, 7); ctx.fill();
      for (let i = 0; i < 5; i++) { ctx.fillStyle = ['#facc15', '#f472b6', '#4ade80'][(i + Math.floor(sp.t * 4)) % 3]; ctx.beginPath(); ctx.arc(x - 60 + i * 30, y + 6, 6, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#4ade80'; ctx.beginPath(); ctx.arc(x, y - 22, 11, 0, 7); ctx.fill();
      ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.ellipse(x - 4, y - 24, 3, 5, 0, 0, 7); ctx.ellipse(x + 4, y - 24, 3, 5, 0, 0, 7); ctx.fill();
    } else if (sp.kind === 'moon') {
      ctx.fillStyle = '#fef3c7'; ctx.beginPath(); ctx.arc(sp.x + sp.w / 2, sp.y + sp.w / 2, sp.w / 2, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(180,140,60,.3)'; for (const [a, b, r] of [[.3, .4, 22], [.65, .6, 30], [.45, .75, 16]]) { ctx.beginPath(); ctx.arc(sp.x + sp.w * a, sp.y + sp.w * b, r, 0, 7); ctx.fill(); }
    } else if (sp.kind === 'gate') {
      ctx.fillStyle = '#fde047'; ctx.shadowColor = '#fde047'; ctx.shadowBlur = 50;
      star(sp.x + 90, sp.y + 90, 90, sp.t * 0.5); ctx.shadowBlur = 0;
      ctx.fillStyle = '#7c2d12'; ctx.font = '900 26px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Csillagkapu', sp.x + 90, sp.y + 92);
    }
  }
  for (const c of G.clouds) {
    if (!visible(c.y - 40, c.y + 40)) continue;
    ctx.fillStyle = 'rgba(241,245,249,.92)';
    ctx.beginPath(); ctx.roundRect(c.x, c.y, c.w, c.h + 8, 18); ctx.fill();
    for (let i = 0; i < c.w / 40; i++) { ctx.beginPath(); ctx.arc(c.x + 22 + i * 40, c.y + 2 + Math.sin(c.puff + i) * 4, 24, 0, 7); ctx.fill(); }
  }
  for (const s of G.skyStars) {
    if (s.got || !visible(s.y - 30, s.y + 30)) continue;
    ctx.fillStyle = '#fde047'; ctx.shadowColor = '#fde047'; ctx.shadowBlur = 18; star(s.x, s.y + Math.sin(s.t * 3) * 4, 18, Math.sin(s.t) * .3); ctx.shadowBlur = 0;
  }
  for (const bl of G.balloons) {
    if (!visible(bl.y - 220, bl.y + 40)) continue;
    const x = bl.x + bl.w / 2, y = bl.y;
    ctx.strokeStyle = '#78350f'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(bl.x + 6, y); ctx.lineTo(x - 50, y - 90); ctx.moveTo(bl.x + bl.w - 6, y); ctx.lineTo(x + 50, y - 90); ctx.stroke();
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? bl.color : '#fef3c7'; ctx.beginPath(); ctx.ellipse(x, y - 160, 80 - i * 13, 95, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#92400e'; ctx.beginPath(); ctx.roundRect(bl.x, y, bl.w, bl.h + 14, 6); ctx.fill();
    ctx.fillStyle = '#b45309'; ctx.fillRect(bl.x, y, bl.w, 8);
  }
  for (const k of G.kites) {
    if (!visible(k.y - 40, k.y + 200)) continue;
    const x = k.x + k.w / 2, y = k.y;
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y + k.h); for (let i = 1; i <= 6; i++) ctx.lineTo(x + Math.sin(k.t * 4 + i) * 10, y + k.h + i * 14); ctx.stroke();
    for (let i = 1; i <= 3; i++) { ctx.fillStyle = RAINBOW[i]; ctx.beginPath(); ctx.ellipse(x + Math.sin(k.t * 4 + i * 2) * 10, y + k.h + i * 28, 8, 4, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = k.color; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + k.w / 2, y + k.h * .4); ctx.lineTo(x, y + k.h); ctx.lineTo(x - k.w / 2, y + k.h * .4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + k.h); ctx.moveTo(x - k.w / 2, y + k.h * .4); ctx.lineTo(x + k.w / 2, y + k.h * .4); ctx.stroke();
    ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(x - 8, y + 24, 3, 0, 7); ctx.arc(x + 8, y + 24, 3, 0, 7); ctx.fill();
  }
  for (const o of G.owls) {
    if (!visible(o.y - 20, o.y + 60)) continue;
    const x = o.x + o.w / 2, y = o.y;
    ctx.fillStyle = '#92400e'; ctx.beginPath(); ctx.ellipse(x, y + 30, 22, 26, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.ellipse(x, y + 36, 13, 16, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#92400e'; ctx.beginPath(); ctx.moveTo(x - 20, y + 10); ctx.lineTo(x - 14, y - 4); ctx.lineTo(x - 6, y + 8); ctx.moveTo(x + 20, y + 10); ctx.lineTo(x + 14, y - 4); ctx.lineTo(x + 6, y + 8); ctx.fill();
    for (const s of [-1, 1]) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + s * 9, y + 18, 8, 0, 7); ctx.fill(); ctx.fillStyle = '#0f172a'; if (o.blink) ctx.fillRect(x + s * 9 - 6, y + 17, 12, 3); else { ctx.beginPath(); ctx.arc(x + s * 9, y + 18, 4, 0, 7); ctx.fill(); } }
    ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.moveTo(x - 4, y + 25); ctx.lineTo(x + 4, y + 25); ctx.lineTo(x, y + 32); ctx.fill();
  }
  for (const b of G.birds) {
    if (!visible(b.y - 30, b.y + 30)) continue;
    const f = Math.sin(b.t * 10) * 12, s = Math.sign(b.vx);
    ctx.fillStyle = b.color; ctx.beginPath(); ctx.ellipse(b.x, b.y, 16, 10, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = b.color; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(b.x - 4, b.y - 2); ctx.lineTo(b.x - 14, b.y - 12 - f); ctx.moveTo(b.x + 4, b.y - 2); ctx.lineTo(b.x + 12, b.y - 12 - f); ctx.stroke();
    ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.moveTo(b.x + s * 15, b.y - 3); ctx.lineTo(b.x + s * 25, b.y); ctx.lineTo(b.x + s * 15, b.y + 3); ctx.fill();
    ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(b.x + s * 8, b.y - 3, 2.5, 0, 7); ctx.fill();
  }
}

function drawDynamic() {
  // kijáratok
  for (const p of MANO_IDS) {
    const e = G.exits[p];
    if (!e) continue;
    const M = MANOK[p], x = e.c * T, y = e.r * T, ok = atExit(p);
    ctx.save();
    if (ok) { ctx.shadowColor = M.color; ctx.shadowBlur = 40; }
    ctx.fillStyle = M.dark;
    ctx.beginPath(); ctx.moveTo(x + 6, y + T); ctx.lineTo(x + 6, y - T * .45); ctx.arc(x + T / 2, y - T * .45, T / 2 - 6, Math.PI, 0); ctx.lineTo(x + T - 6, y + T); ctx.fill();
    ctx.fillStyle = ok ? M.color : 'rgba(15,23,42,.7)';
    ctx.beginPath(); ctx.moveTo(x + 14, y + T); ctx.lineTo(x + 14, y - T * .4); ctx.arc(x + T / 2, y - T * .4, T / 2 - 14, Math.PI, 0); ctx.lineTo(x + T - 14, y + T); ctx.fill();
    ctx.restore();
    ctx.font = `30px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ok ? '✅' : M.icon, x + T / 2, y - T * .35);
  }
  // kapuk
  for (const d of G.doors) {
    const x = d.c * T, y = d.r * T, col = LETTER_COLORS[d.L.toLowerCase()];
    const h = T * (1 - d.a);
    ctx.globalAlpha = 0.25; ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.strokeRect(x + 10, y + 2, T - 20, T - 4); ctx.globalAlpha = 1;
    if (h > 1) {
      ctx.fillStyle = col; ctx.fillRect(x + 8, y, T - 16, h);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 3; i++) ctx.fillRect(x + 14 + i * 14, y, 5, h);
    }
  }
  // gombok
  for (const pl of G.plates) {
    const x = pl.c * T, y = (pl.r + 1) * T, col = colorOf(pl.l), hh = 14 - pl.press * 9;
    const wpad = pl.heavy ? 2 : 10;
    ctx.fillStyle = '#1e293b'; ctx.fillRect(x + wpad - 3, y - 6, T - 2 * wpad + 6, 6);
    ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(x + wpad, y - 6 - hh, T - 2 * wpad, hh, 5); ctx.fill();
    if (pl.heavy) { ctx.font = `26px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText('💪', x + T / 2, y - 24 - hh); }
  }
  // karok (elég megérinteni: a még át nem billentett kar körül lüktető kör)
  for (const lv of G.leverPos) {
    const x = lv.c * T + T / 2, y = lv.r * T + T / 2, on = G.levers[lv.l], col = colorOf(lv.l);
    if (!on) { ctx.globalAlpha = .25 + .25 * Math.sin(G.time * 5); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 38, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.roundRect(x - 22, y + 4, 44, 18, 6); ctx.fill();
    const a = on ? 0.6 : -0.6;
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y + 10); ctx.lineTo(x + Math.sin(a) * 30, y + 10 - Math.cos(a) * 30); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x + Math.sin(a) * 30, y + 10 - Math.cos(a) * 30, 11, 0, 7); ctx.fill();
  }
  // Indás indái (az utolsó 5 mp-ben villognak és sárgulnak, aztán elsorvadnak)
  for (const v of G.vines) {
    const x = v.c * T + T / 2, bottom = (v.base + 1) * T, yTop = v.top * T;
    const y0 = Math.min(bottom, G.camY + VH + 40), y1 = Math.max(yTop, G.camY - 40);
    const old = v.life < 5;
    ctx.globalAlpha = old ? 0.45 + 0.4 * Math.abs(Math.sin(G.time * 6)) : 1;
    if (y0 > y1) {
      ctx.strokeStyle = old ? '#a16207' : '#15803d'; ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + Math.sin(y0 / 22) * 9, y0);
      for (let y = y0; y > y1; y -= 16) ctx.lineTo(x + Math.sin(y / 22) * 9, y);
      ctx.stroke();
      ctx.fillStyle = old ? '#ca8a04' : '#4ade80';
      for (let y = Math.floor(y0 / 34) * 34 - 8, i = Math.floor(y0 / 34); y > y1; y -= 34, i--) { const s = i % 2 ? 1 : -1; ctx.beginPath(); ctx.ellipse(x + s * 14 + Math.sin(y / 22) * 9, y, 13, 7, s * .6, 0, 7); ctx.fill(); }
      if (!v.stopped && yTop > G.camY - 40) { ctx.font = `26px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🌱', x, yTop - 4); }
    }
    // hátralévő idő a tövénél
    ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(11,16,32,.6)'; ctx.beginPath(); ctx.arc(x, bottom - 14, 15, 0, 7); ctx.fill();
    ctx.fillStyle = '#f0fdf4'; ctx.font = '800 16px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.ceil(v.life)), x, bottom - 13);
  }
  ctx.globalAlpha = 1;
  // magok
  for (const s of G.seeds) {
    const x = s.c * T + T / 2, y = (s.r + 1) * T;
    ctx.fillStyle = '#78350f'; ctx.beginPath(); ctx.ellipse(x, y, 24, 10, 0, Math.PI, 0); ctx.fill();
    ctx.font = `${s.used ? 34 : 26}px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    if (!s.used) ctx.globalAlpha = .75 + .25 * Math.sin(G.time * 4);
    ctx.fillText(s.kind === 's' ? '🌱' : '🌿', x, y - 6); ctx.globalAlpha = 1;
  }
  // csillagok
  ctx.fillStyle = '#fde047'; ctx.shadowColor = '#fde047'; ctx.shadowBlur = 20;
  for (const s of G.stars) if (!s.got) star(s.c * T + T / 2, s.r * T + T / 2 + Math.sin(s.t * 3) * 4, 20, Math.sin(s.t) * .3);
  ctx.shadowBlur = 0;
  // ládák
  for (const k of G.crates) {
    ctx.fillStyle = k.heavy ? '#64748b' : '#b45309'; ctx.fillRect(k.x, k.y, k.w, k.h);
    ctx.strokeStyle = k.heavy ? '#334155' : '#78350f'; ctx.lineWidth = 5; ctx.strokeRect(k.x + 2.5, k.y + 2.5, k.w - 5, k.h - 5);
    if (k.heavy) { ctx.fillStyle = '#334155'; for (const [a, b] of [[10, 10], [k.w - 10, 10], [10, k.h - 10], [k.w - 10, k.h - 10]]) { ctx.beginPath(); ctx.arc(k.x + a, k.y + b, 4, 0, 7); ctx.fill(); } ctx.font = `24px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('💪', k.x + k.w / 2, k.y + k.h / 2); }
    else { ctx.beginPath(); ctx.moveTo(k.x + 6, k.y + 6); ctx.lineTo(k.x + k.w - 6, k.y + k.h - 6); ctx.moveTo(k.x + k.w - 6, k.y + 6); ctx.lineTo(k.x + 6, k.y + k.h - 6); ctx.stroke(); }
  }
  // Kavics kötele és nyila
  const kv = G.manos[1];
  if (kv && (kv.rope || kv.arrow)) {
    const cx = kv.x + kv.w / 2, cy = kv.y + kv.h / 2;
    const ex = kv.rope ? kv.rope.ax : kv.arrow.x, ey = kv.rope ? kv.rope.ay : kv.arrow.y;
    ctx.strokeStyle = '#d6b88a'; ctx.lineWidth = 4; ctx.setLineDash(kv.rope ? [] : [8, 6]);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
    const a = Math.atan2(ey - cy, ex - cx);
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
    ctx.fillStyle = '#e7e5e4'; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-12, -8); ctx.lineTo(-12, 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ef4444'; ctx.fillRect(-26, -5, 8, 10);
    ctx.restore();
  }
}

function eyes(cx, cy, r, face, look) {
  for (const s of [-1, 1]) {
    const ex = cx + s * r * 1.15 + face * r * .5;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex, cy, r, r * 1.15, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(ex + face * r * .35, cy + look * r * .3, r * .55, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + face * r * .35 - r * .2, cy - r * .3, r * .18, 0, 7); ctx.fill();
  }
}
function drawMano(m) {
  const M = MANOK[m.id], sq = m.squash > 0 ? 0.12 : 0;
  const w = m.w * (1 + sq), h = m.h * (1 - sq), x = m.x + m.w / 2, y = m.y + m.h;
  ctx.save(); ctx.translate(x, y);
  if (m.flash > 0 && Math.floor(G.time * 12) % 2) ctx.globalAlpha = .4;
  // kapaszkodó: két kéz fel a hordozóhoz
  if (m.hang) {
    ctx.strokeStyle = M.dark; ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * w * .3, -h + 8); ctx.lineTo(s * w * .22, -h - 8); ctx.stroke(); }
  }
  // Kopter: farok, árboc, forgó rotor (repülés közben gyorsabban pörög, leállt propellerrel áll)
  if (m.id === 3) {
    ctx.fillStyle = M.dark;
    ctx.beginPath(); ctx.moveTo(-m.face * w * .4, -h * .55); ctx.lineTo(-m.face * w * 1.05, -h * .75); ctx.lineTo(-m.face * w * 1.05, -h * .55); ctx.lineTo(-m.face * w * .4, -h * .35); ctx.fill();
    ctx.save(); ctx.translate(-m.face * w * 1.05, -h * .65); ctx.rotate(m.stall ? 0.4 : G.time * 30); ctx.fillStyle = '#e2e8f0'; ctx.fillRect(-10, -2, 20, 4); ctx.restore();
    ctx.fillStyle = '#334155'; ctx.fillRect(-3, -h - 14, 6, 16);
    const spin = m.stall ? 0 : m.floating > 0 || !m.ground ? 34 : 14, k = m.stall ? 1 : Math.cos(G.time * spin);
    ctx.fillStyle = 'rgba(226,232,240,.9)';
    ctx.beginPath(); ctx.ellipse(0, -h - 14, Math.max(4, Math.abs(k) * w * 0.95), 4, 0, 0, 7); ctx.fill();
    if (spin > 10) { ctx.strokeStyle = 'rgba(226,232,240,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, -h - 14, w * 0.95, 6, 0, 0, 7); ctx.stroke(); }
    ctx.fillStyle = '#475569'; ctx.beginPath(); ctx.arc(0, -h - 14, 5, 0, 7); ctx.fill();
    if (m.stall) { ctx.fillStyle = '#fde047'; ctx.font = '900 26px system-ui'; ctx.textAlign = 'center'; ctx.fillText('!!', w * .6, -h - 20); }
  }
  // Fürge fülei; a levegőben pöttyök mutatják, hány ugrása maradt, elfáradva izzadságcseppek
  if (m.id === 2) {
    ctx.fillStyle = M.color; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * w * .32, -h + 2, w * .22, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#fecaca'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * w * .32, -h + 2, w * .12, 0, 7); ctx.fill(); }
    ctx.strokeStyle = M.dark; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-m.face * w / 2, -h * .3); ctx.quadraticCurveTo(-m.face * w, -h * .1, -m.face * w * .9, -h * .7); ctx.stroke();
    if (m.jumps > 0 && !m.ground) {
      const left = FURGE_JUMPS - m.jumps;
      for (let i = 0; i < FURGE_JUMPS - 1; i++) { ctx.fillStyle = i < left ? '#fde047' : 'rgba(148,163,184,.4)'; ctx.beginPath(); ctx.arc((i - (FURGE_JUMPS - 2) / 2) * 11, -h - 22, 4, 0, 7); ctx.fill(); }
      if (left <= 0) { ctx.fillStyle = '#7dd3fc'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * w * .7, -h * .8 + Math.sin(G.time * 8) * 3, 4, 7, 0, 0, 7); ctx.fill(); } }
    }
  }
  // test
  ctx.fillStyle = M.color; ctx.strokeStyle = M.dark; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.roundRect(-w / 2, -h, w, h, m.id === 1 ? 14 : w * .45); ctx.fill(); ctx.stroke();
  if (m.id === 1) { ctx.fillStyle = 'rgba(71,85,105,.5)'; for (const [a, b, r] of [[-.25, -.25, 6], [.25, -.6, 5], [.2, -.2, 4]]) { ctx.beginPath(); ctx.arc(a * w, b * h, r, 0, 7); ctx.fill(); } }
  // Indás levele
  if (m.id === 4) {
    ctx.strokeStyle = '#15803d'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, -h - 14); ctx.stroke();
    ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.ellipse(-10, -h - 16, 12, 6, -.5, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(10, -h - 18, 12, 6, .5, 0, 7); ctx.fill();
  }
  // arc
  const er = m.id === 2 ? 5 : 8;
  eyes(0, -h * .62, er, m.face * .4, m.vy > 300 ? 1 : m.vy < -300 ? -1 : 0);
  if (m.id === 1) { ctx.strokeStyle = '#334155'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-w * .38, -h * .86); ctx.lineTo(-w * .08, -h * .8); ctx.moveTo(w * .38, -h * .86); ctx.lineTo(w * .08, -h * .8); ctx.stroke(); }
  ctx.strokeStyle = M.dark; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(m.face * w * .1, -h * .32, w * .12, 0.2, Math.PI - .2); ctx.stroke();
  ctx.restore();
}

function drawBubbles() {
  for (const b of G.bubbles) {
    ctx.globalAlpha = Math.min(1, b.t * 2);
    ctx.font = '800 26px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(b.text).width + 30, y = b.y - (3.2 - b.t) * 12;
    ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.roundRect(b.x - tw / 2, y - 24, tw, 48, 18); ctx.fill();
    ctx.beginPath(); ctx.moveTo(b.x - 8, y + 22); ctx.lineTo(b.x, y + 36); ctx.lineTo(b.x + 8, y + 22); ctx.fill();
    ctx.fillStyle = '#0f172a'; ctx.fillText(b.text, b.x, y + 1);
  }
  ctx.globalAlpha = 1;
}
// aki nem fér a képre (fent vagy lent), annak a képernyő szélén jelzés, hány méterre van
function edgeMarkers() {
  for (const m of Object.values(G.manos)) {
    const M = MANOK[m.id], sx = Math.max(60, Math.min(W - 60, m.x + m.w / 2));
    let sy = null, up = false;
    if (m.y + m.h < G.camY) { sy = OY + 46; up = true; } else if (m.y > G.camY + VH) sy = H - 130;
    if (sy === null) continue;
    const dist = Math.round(up ? (G.camY - m.y) / T : (m.y - G.camY - VH) / T);
    ctx.fillStyle = M.color; ctx.beginPath(); ctx.arc(sx, sy, 28, 0, 7); ctx.fill();
    ctx.beginPath(); if (up) { ctx.moveTo(sx - 14, sy - 26); ctx.lineTo(sx, sy - 44); ctx.lineTo(sx + 14, sy - 26); } else { ctx.moveTo(sx - 14, sy + 26); ctx.lineTo(sx, sy + 44); ctx.lineTo(sx + 14, sy + 26); } ctx.fill();
    ctx.font = `30px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(M.icon, sx, sy + 1);
    ctx.fillStyle = '#f8fafc'; ctx.font = '800 20px system-ui'; ctx.fillText(`${dist} m`, sx + (sx > W - 140 ? -64 : 64), sy);
  }
}

function hud() {
  ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, W, OY);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillStyle = '#facc15'; ctx.font = '900 32px system-ui'; ctx.fillText('Becze Manó-csapat', 20, OY / 2);
  ctx.fillStyle = '#f8fafc'; ctx.font = '800 32px system-ui'; ctx.textAlign = 'center';
  const sky = G.L.sky && (G.skyGot || G.camY < -50) ? `   ☁️ ${G.skyGot}` : '';
  const alt = G.camY < -50 ? `   ⬆ ${Math.round(-Math.min(...Object.values(G.manos).map((m) => m.y), 0) / T)} m` : '';
  ctx.fillText(`${G.li + 1}. pálya: ${G.L.name}   ⭐ ${G.got}/${G.stars.length}${sky}${alt}`, W / 2 - 80, OY / 2);
  // ki van bent
  let x = W - 20;
  ctx.textAlign = 'right';
  if (net.room) { ctx.fillStyle = '#facc15'; ctx.font = '900 30px system-ui'; ctx.fillText(net.room, x, OY / 2); x -= ctx.measureText(net.room).width + 24; }
  for (const p of [...MANO_IDS].reverse()) {
    ctx.globalAlpha = P[p].joined ? 1 : .25;
    ctx.fillStyle = MANOK[p].color; ctx.beginPath(); ctx.arc(x - 20, OY / 2, 20, 0, 7); ctx.fill();
    ctx.font = `24px ${EMOJI}`; ctx.textAlign = 'center'; ctx.fillText(MANOK[p].icon, x - 20, OY / 2 + 1);
    ctx.globalAlpha = 1; x -= 48;
  }
  ctx.fillStyle = '#64748b'; ctx.font = '600 18px system-ui'; ctx.textAlign = 'right';
  ctx.fillText(`v${VERSION}${net.mode === 'helyi' ? ' · helyi' : ''}`, x - 10, OY / 2);
  // a feladat a pálya alján
  ctx.textAlign = 'center'; ctx.font = '800 34px system-ui';
  ctx.fillStyle = 'rgba(11,16,32,.55)'; const tw = ctx.measureText(G.L.hint).width;
  ctx.beginPath(); ctx.roundRect(W / 2 - tw / 2 - 24, H - 74, tw + 48, 56, 16); ctx.fill();
  ctx.fillStyle = '#fef9c3'; ctx.fillText(G.L.hint, W / 2, H - 46);
}

function overlays() {
  const joined = MANO_IDS.filter((p) => P[p].joined);
  if (G.boom > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.max(0, G.boom - 0.9) * 0.8})`; ctx.fillRect(0, OY, W, H - OY);
    ctx.globalAlpha = Math.min(1, G.boom); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#facc15'; ctx.font = `900 ${90 + Math.max(0, 1.2 - G.boom) * 40}px system-ui`; ctx.fillText('🎆 TŰZIJÁTÉK! 🎆', W / 2, OY + 200);
    ctx.globalAlpha = 1;
  }
  if (G.phase === 'win') {
    const last = G.li === LEVELS.length - 1;
    ctx.fillStyle = 'rgba(11,16,32,.6)'; ctx.fillRect(0, OY, W, H - OY);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#facc15'; ctx.font = '900 96px system-ui';
    ctx.fillText(last ? `🏆 Mind a ${LEVELS.length} pálya kész! 🏆` : '🎉 Sikerült! 🎉', W / 2, H / 2 - 30);
    ctx.fillStyle = '#f8fafc'; ctx.font = '800 48px system-ui';
    ctx.fillText(`${G.L.name} · ⭐ ${G.got}/${G.stars.length}${G.skyGot ? ` · ☁️ ${G.skyGot}` : ''}${last ? ' · Kezdjük elölről?' : ` · Jön a ${G.li + 2}. pálya…`}`, W / 2, H / 2 + 50);
  }
  // QR: középen nagyban, amíg senki nincs bent; utána kicsiben, amíg nincs meg mind a négy manó
  if (!joined.length) {
    ctx.fillStyle = 'rgba(11,16,32,.8)'; ctx.fillRect(0, OY, W, H - OY);
    ctx.fillStyle = '#f8fafc'; ctx.font = '900 54px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('Négy manó kell! Olvassátok be a telefonnal:', W / 2, 230);
    const size = 420, qx = W / 2 - size / 2, qy = 280;
    if (qrCanvas) ctx.drawImage(qrCanvas, qx, qy, size, size);
    else { ctx.fillStyle = '#94a3b8'; ctx.font = '600 28px system-ui'; ctx.fillText('phone.html?helyi=1', W / 2, qy + size / 2); }
    if (net.room) { ctx.fillStyle = '#facc15'; ctx.font = '900 64px system-ui'; ctx.fillText(net.room, W / 2, qy + size + 76); }
    ctx.fillStyle = '#94a3b8'; ctx.font = '600 26px system-ui'; ctx.fillText(phoneUrl, W / 2, qy + size + 130);
  } else if (joined.length < 4 && qrCanvas) {
    ctx.drawImage(qrCanvas, W - 170, OY + 10, 150, 150);
  }
}

function draw() {
  if (!G.L) return;
  if (G.dirty) drawStatic();
  background();
  ctx.save();
  ctx.beginPath(); ctx.rect(0, OY, W, VH); ctx.clip();
  ctx.translate(0, OY - G.camY);
  if (G.L.sky) drawSky();
  if (G.camY > -ROWS * T - 50) ctx.drawImage(stat, 0, 0);
  drawDynamic();
  for (const m of Object.values(G.manos)) drawMano(m);
  for (const q of G.parts) { ctx.globalAlpha = Math.max(0, q.life); ctx.fillStyle = q.color; ctx.fillRect(q.x - 4, q.y - 4, 8, 8); }
  ctx.globalAlpha = 1;
  drawBubbles();
  ctx.restore();
  edgeMarkers();
  hud();
  overlays();
}

// ---------- állapot a telefonoknak ----------
function broadcast() {
  net.send({
    version: VERSION, beat: Math.floor(Date.now() / 2000),
    players: Object.fromEntries(MANO_IDS.filter((p) => P[p].joined).map((p) => [p, 1])),
    ack: Object.fromEntries(MANO_IDS.filter((p) => P[p].joined).map((p) => [p, P[p].s])),
    level: G.li + 1, levels: LEVELS.length, name: G.L ? G.L.name : '', hint: G.L ? G.L.hint : '',
    got: G.got, stars: G.stars.length, sky: G.skyGot, win: G.phase === 'win',
    home: Object.fromEntries(MANO_IDS.map((p) => [p, atExit(p) ? 1 : 0])),
  });
}
setInterval(broadcast, 100);

// ---------- időzítés: a valódi eltelt időt pótolja, háttérben is ----------
loadLevel(G.li);
const STEP = 1 / 60;
let lastT = performance.now(), acc = 0;
function tick() {
  const now = performance.now();
  acc = Math.min(acc + (now - lastT) / 1000, 0.5); lastT = now;
  while (acc >= STEP) { update(STEP); acc -= STEP; }
}
function frame() { tick(); draw(); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
setInterval(tick, 250);

// próbához a konzolból: __mano.join(1,2,3,4) beléptet, __mano.go(5) az 5. pályára ugrik,
// __mano.P[3].b = true nyomja Kopter gombját, __mano.P[4].k Indás INDA gombja, __mano.P[1].k Kavics NYÍL gombja
window.__mano = {
  G, P, step: (sec) => { for (let i = 0; i < sec / STEP; i++) update(STEP); },
  join: (...ids) => { for (const p of ids) { Object.assign(P[p], { joined: true, seen: performance.now() + 1e9 }); spawnMano(p); } },
  go: (n) => loadLevel(n - 1),
};

// a laptopon: R újra, N következő pálya, P előző, F teljes képernyő
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'f') document.fullscreenElement ? document.exitFullscreen() : cv.requestFullscreen?.();
  if (k === 'r') loadLevel(G.li);
  if (k === 'n') loadLevel(G.li + 1);
  if (k === 'p') loadLevel(G.li - 1);
});
