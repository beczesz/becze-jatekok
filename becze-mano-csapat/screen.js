// Becze Manó-csapat: a kivetítő. Itt fut a játék, a telefonok csak a karjuk és a gombjuk állását küldik.
import { connectScreen } from './transport.js';
import {
  VERSION, MANOK, MANO_IDS, LETTER_COLORS, T, COLS, ROWS, GRAVITY,
  FLOAT_FUEL, FLOAT_UP, FLOAT_UP_LOADED, PAD_GONE_MS,
} from './rules.js';
import { LEVELS } from './levels.js';

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const W = 1920, H = 1080, OY = 56;   // a pálya a felső sáv alatt kezdődik (16 sor × 64 = 1024)
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
const P = Object.fromEntries(MANO_IDS.map((p) => [p, { joined: false, x: 0, y: 0, b: false, st: '', s: 0, r: 0, seen: 0, rate: 0, cnt: 0, prevB: false, prevY: 0, buf: 0 }]));
net.onPad((p, pad) => {
  const Q = P[p];
  if (!Q) return;
  if (!pad) { Q.joined = false; return; }
  const clamp = (v) => Math.max(-1, Math.min(1, Number(v) || 0));
  if (!Q.joined) { Q.joined = true; spawnMano(p); }
  Q.seen = performance.now(); Q.cnt++;
  Q.x = clamp(pad.x); Q.y = clamp(pad.y); Q.b = !!pad.b; Q.s = pad.s || 0; Q.r = pad.r || 0; Q.st = pad.st || '';
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
  li: 0, L: null, grid: [], spawns: {}, exits: {}, stars: [], plates: [], doors: [], levers: {}, leverPos: [],
  seeds: [], grow: [], crack: {}, crates: [], manos: {}, parts: [], got: 0,
  phase: 'play', phaseT: 0, time: 0, resetLatch: false, dirty: true,
};
try { G.li = Math.max(0, Math.min(LEVELS.length - 1, Number(localStorage.getItem('mano-palya')) || 0)); } catch (e) { /* privát mód */ }

function loadLevel(i) {
  G.li = (i + LEVELS.length) % LEVELS.length;
  try { localStorage.setItem('mano-palya', String(G.li)); } catch (e) { /* privát mód */ }
  const L = G.L = LEVELS[G.li];
  G.grid = []; G.spawns = {}; G.exits = {}; G.stars = []; G.plates = []; G.doors = []; G.levers = {}; G.leverPos = [];
  G.seeds = []; G.grow = []; G.crack = {}; G.crates = []; G.parts = []; G.got = 0; G.phase = 'play'; G.phaseT = 0;
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
        if (levers.includes(ch)) { G.leverPos.push({ c, r, l: ch }); G.levers[ch] = false; }
        else G.plates.push({ c, r, l: ch, heavy: heavy.includes(ch), down: false, press: 0 });
        t = '.';
      } else if ('ABCDE'.includes(ch)) { G.doors.push({ c, r, L: ch, open: false, a: 0 }); }
      else if (ch === 's' || ch === 'w') { G.seeds.push({ c, r, kind: ch, used: false }); t = '.'; }
      G.grid[r][c] = t;
    });
  });
  G.manos = {};
  for (const p of MANO_IDS) if (P[p].joined) spawnMano(p);
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
  G.manos[p] = newBody(s.c, s.r, M.w, M.h, { kind: 'mano', id: p, face: 1, fuel: FLOAT_FUEL, climb: false, coyote: 0, flash: old ? 0.6 : 0, blink: 0, squash: 0 });
  burst(s.c * T + T / 2, s.r * T + T / 2, M.color, 18, 260);
}

// ---------- csempék ----------
const tileAt = (c, r) => (r < 0 || c < 0 || c >= COLS) ? '#' : r >= ROWS ? '.' : G.grid[r][c];
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
function overlapTiles(b, fn) {
  const c0 = Math.floor(b.x / T), c1 = Math.floor((b.x + b.w - 0.01) / T);
  const r0 = Math.floor(b.y / T), r1 = Math.floor((b.y + b.h - 0.01) / T);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (fn(c, r)) return true;
  return false;
}
const overl = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// tengelyenkénti mozgás ütközéssel: falak, zárt kapuk, ládák; függőlegesen a manók feje is talaj (rá lehet állni)
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
  if (d > 0) for (const m of Object.values(G.manos)) {   // egymás fejére állni (csak felülről)
    if (m === b || !overl(b, m) || prevBottom > m.y + 2) continue;
    b.y = m.y - b.h; b.ground = true; b.on = m; hit = true;
  }
  if (hit) b.vy = 0;
  return hit;
}

// ---------- részecskék ----------
function burst(x, y, color, n, speed = 220) {
  for (let i = 0; i < n; i++) { const a = rnd(0, 6.3), v = rnd(40, speed); G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: rnd(.4, .9), color, g: 500 }); }
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

  // manók: alulról fölfelé, hogy aki valakin áll, az a hordozójával együtt mozogjon
  const list = Object.values(G.manos).sort((a, b) => (b.y + b.h) - (a.y + a.h));
  for (const m of list) {
    const M = MANOK[m.id], Q = P[m.id], x0 = m.x, y0 = m.y;
    const carrier = m.on;
    if (carrier && (carrier.dx || carrier.dy)) { moveX(m, carrier.dx); if (carrier.dy < 0) moveY(m, carrier.dy); else m.y += carrier.dy; }
    const pressed = Q.b && !Q.prevB;
    if (pressed) Q.buf = 0.15; else Q.buf = Math.max(0, Q.buf - dt);
    const ix = Math.abs(Q.x) > 0.2 ? Q.x : 0, iy = Q.y;
    if (ix) m.face = Math.sign(ix);

    const onVine = overlapTiles({ x: m.x + m.w * .3, y: m.y, w: m.w * .4, h: m.h }, (c, r) => tileAt(c, r) === 'V');
    if (!onVine) m.climb = false;
    else if (Math.abs(iy) > 0.45) m.climb = true;

    if (m.climb) {
      m.vx = ix * 150; m.vy = (Math.abs(iy) > 0.2 ? iy : 0) * 210;
      if (Q.buf > 0) { m.climb = false; m.vy = -M.jump * 0.85; Q.buf = 0; }
    } else {
      const target = ix * M.speed;
      m.vx += (target - m.vx) * Math.min(1, (m.ground ? 14 : 7) * dt);
      // Lufi: ugrás után nyomva tartott gombbal lebeg (ha valaki a fején áll, lassabban emelkedik)
      const loaded = m.id === 3 && Object.values(G.manos).some((o) => o.on === m);
      const up = loaded ? FLOAT_UP_LOADED : FLOAT_UP;
      if (m.id === 3 && !m.ground && Q.b && m.fuel > 0 && m.vy > -up) {
        m.vy += (-up - m.vy) * Math.min(1, 8 * dt); m.fuel -= dt; m.floating = 0.15;   // lebegés közben nincs gravitáció
      } else m.vy = Math.min(1100, m.vy + GRAVITY * dt);
      if (m.ground) { m.coyote = 0.1; m.fuel = FLOAT_FUEL; } else m.coyote = Math.max(0, m.coyote - dt);
      if (Q.buf > 0 && m.coyote > 0) { m.vy = -M.jump; m.coyote = 0; Q.buf = 0; m.squash = 0.2; }
    }
    m.floating = Math.max(0, (m.floating || 0) - dt);
    m.ground = false; m.on = null;
    moveX(m, m.vx * dt);
    const wasUp = m.vy;
    moveY(m, m.vy * dt);
    if (m.ground && wasUp > 500) m.squash = 0.18;
    m.dx = m.x - x0; m.dy = m.y - y0;
    m.flash = Math.max(0, m.flash - dt); m.squash = Math.max(0, m.squash - dt);

    // tüske, leesés: vissza a rajthoz, büntetés nélkül
    const hurt = overlapTiles({ x: m.x + 6, y: m.y + 6, w: m.w - 12, h: m.h - 6 }, (c, r) => tileAt(c, r) === '^');
    if ((hurt || m.y > ROWS * T + 40) && m.flash <= 0) { Q.prevB = Q.b; Q.prevY = iy; burst(m.x + m.w / 2, m.y + m.h / 2, '#c084fc', 20, 300); spawnMano(m.id); continue; }

    // csillag
    for (const s of G.stars) if (!s.got && overl(m, { x: s.c * T + 12, y: s.r * T + 12, w: T - 24, h: T - 24 })) { s.got = true; G.got++; burst(s.c * T + T / 2, s.r * T + T / 2, '#fde047', 24, 300); }

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
            G.grid[rr][cc] = '.'; delete G.crack[`${cc},${rr}`];
            burst(cc * T + T / 2, rr * T + T / 2, '#a8a29e', 14, 260);
            q.push([cc - 1, rr], [cc + 1, rr]);
          }
          G.dirty = true;
        }
      }
    }

    // Indás: a magnál a gomb növeszt
    if (m.id === 4 && pressed) {
      for (const s of G.seeds) {
        if (s.used || !overl(m, { x: s.c * T - 8, y: s.r * T, w: T + 16, h: T })) continue;
        s.used = true; m.vy = 0;
        growFrom(s);
      }
    }

    // kar: a karnál a kar lefelé húzása átbillenti
    if (iy > 0.6 && Q.prevY <= 0.6) {
      for (const lv of G.leverPos) {
        if (!overl(m, { x: lv.c * T - 6, y: lv.r * T - 6, w: T + 12, h: T + 12 })) continue;
        G.levers[lv.l] = !G.levers[lv.l];
        burst(lv.c * T + T / 2, lv.r * T + T / 2, colorOf(lv.l), 16, 220);
      }
    }
    Q.prevB = Q.b; Q.prevY = iy;
  }

  // a növő inda és híd: csempénként, kis késéssel, hogy látsszon a növés
  for (const g of G.grow) {
    if (g.done) continue;
    g.t -= dt;
    if (g.t <= 0) { g.done = true; G.grid[g.r][g.c] = g.to; G.dirty = true; burst(g.c * T + T / 2, g.r * T + T / 2, g.to === 'V' ? '#4ade80' : '#d97706', 6, 120); }
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
  for (const s of G.stars) s.t += dt;

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

// ---------- rajzolás ----------
const stat = document.createElement('canvas'); stat.width = COLS * T; stat.height = ROWS * T;
const sc = stat.getContext('2d');
function isSolidTile(c, r) { const t = tileAt(c, r); return t === '#' || t === 'x'; }
function drawStatic() {
  sc.clearRect(0, 0, stat.width, stat.height);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = G.grid[r][c], x = c * T, y = r * T;
    if (t === '#') {
      const top = !isSolidTile(c, r - 1) && r > 0;
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
  const g = ctx.createLinearGradient(0, OY, 0, H);
  g.addColorStop(0, '#1e3a8a'); g.addColorStop(.6, '#312e81'); g.addColorStop(1, '#1e1b4b');
  ctx.fillStyle = g; ctx.fillRect(0, OY, W, H - OY);
  // távoli dombok és csillagok
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  for (let i = 0; i < 70; i++) { const x = (i * 271) % W, y = OY + (i * 157) % 420; ctx.globalAlpha = .3 + .3 * Math.sin(G.time * 1.5 + i); ctx.fillRect(x, y, 3, 3); }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#3730a3';
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 40) ctx.lineTo(x, H - 330 - Math.sin(x / 260) * 70 - Math.sin(x / 90) * 18);
  ctx.lineTo(W, H); ctx.fill();
  ctx.fillStyle = 'rgba(253,224,71,.85)'; ctx.beginPath(); ctx.arc(W - 260, OY + 150, 60, 0, 7); ctx.fill();
  ctx.fillStyle = '#312e81'; ctx.beginPath(); ctx.arc(W - 235, OY + 135, 56, 0, 7); ctx.fill();
}

function star(x, y, s, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? s * .45 : s; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill(); ctx.restore();
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
  // karok
  for (const lv of G.leverPos) {
    const x = lv.c * T + T / 2, y = lv.r * T + T / 2, on = G.levers[lv.l], col = colorOf(lv.l);
    ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.roundRect(x - 22, y + 4, 44, 18, 6); ctx.fill();
    const a = on ? 0.6 : -0.6;
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y + 10); ctx.lineTo(x + Math.sin(a) * 30, y + 10 - Math.cos(a) * 30); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x + Math.sin(a) * 30, y + 10 - Math.cos(a) * 30, 11, 0, 7); ctx.fill();
    if (!on) { ctx.globalAlpha = .5 + .5 * Math.sin(G.time * 5); ctx.fillStyle = '#fff'; ctx.font = '900 22px system-ui'; ctx.textAlign = 'center'; ctx.fillText('⬇', x + 30, y - 18); ctx.globalAlpha = 1; }
  }
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
  // Lufi lufija
  if (m.id === 3) {
    const big = m.floating > 0 ? 1.35 : 1, by = -h - 34 * big + Math.sin(G.time * 3) * 3;
    ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -h + 4); ctx.quadraticCurveTo(8, (by - h) / 2, 0, by + 16 * big); ctx.stroke();
    ctx.fillStyle = '#f9a8d4'; ctx.beginPath(); ctx.ellipse(0, by, 15 * big, 19 * big, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.ellipse(-5 * big, by - 6 * big, 4, 6, -.4, 0, 7); ctx.fill();
  }
  // Fürge fülei
  if (m.id === 2) {
    ctx.fillStyle = M.color; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * w * .32, -h + 2, w * .22, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#fecaca'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * w * .32, -h + 2, w * .12, 0, 7); ctx.fill(); }
    ctx.strokeStyle = M.dark; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-m.face * w / 2, -h * .3); ctx.quadraticCurveTo(-m.face * w, -h * .1, -m.face * w * .9, -h * .7); ctx.stroke();
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

function hud() {
  ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, W, OY);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillStyle = '#facc15'; ctx.font = '900 32px system-ui'; ctx.fillText('Becze Manó-csapat', 20, OY / 2);
  ctx.fillStyle = '#f8fafc'; ctx.font = '800 32px system-ui'; ctx.textAlign = 'center';
  ctx.fillText(`${G.li + 1}. pálya: ${G.L.name}   ⭐ ${G.got}/${G.stars.length}`, W / 2 - 80, OY / 2);
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
  if (G.phase === 'win') {
    const last = G.li === LEVELS.length - 1;
    ctx.fillStyle = 'rgba(11,16,32,.6)'; ctx.fillRect(0, OY, W, H - OY);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#facc15'; ctx.font = '900 96px system-ui';
    ctx.fillText(last ? '🏆 Mind a 10 pálya kész! 🏆' : '🎉 Sikerült! 🎉', W / 2, H / 2 - 30);
    ctx.fillStyle = '#f8fafc'; ctx.font = '800 48px system-ui';
    ctx.fillText(`${G.L.name} · ⭐ ${G.got}/${G.stars.length}${last ? ' · Kezdjük elölről?' : ` · Jön a ${G.li + 2}. pálya…`}`, W / 2, H / 2 + 50);
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
  ctx.save(); ctx.translate(0, OY);
  ctx.drawImage(stat, 0, 0);
  drawDynamic();
  for (const m of Object.values(G.manos)) drawMano(m);
  for (const q of G.parts) { ctx.globalAlpha = Math.max(0, q.life); ctx.fillStyle = q.color; ctx.fillRect(q.x - 4, q.y - 4, 8, 8); }
  ctx.globalAlpha = 1;
  ctx.restore();
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
    got: G.got, stars: G.stars.length, win: G.phase === 'win',
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

// próbához a konzolból: __mano.join(1,2,3,4) beléptet, __mano.go(5) az 5. pályára ugrik, __mano.P[3].b = true nyomja Lufi gombját
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
