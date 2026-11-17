// Becze Csillaghajó, kar-próba: a kivetítő. Itt fut a szimuláció, a telefonok csak a karjuk állását küldik.
import { connectScreen } from './transport.js';
import { VERSION, PLAYERS, PLAYER_IDS, STATIONS, STATION_IDS, PAD_GONE_MS } from './rules.js';

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const W = 1920, H = 1080;
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

let net;
try { net = await connectScreen(); }
catch (e) {
  ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, W, H);
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
    q.fillStyle = '#020617';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) q.fillRect((c + pad) * cell, (r + pad) * cell, cell, cell);
  };
  document.head.appendChild(s);
})();

// ---------- állapot ----------
const SHIP_R = 90;
const rnd = (a, b) => a + Math.random() * (b - a);
const S = {
  players: Object.fromEntries(PLAYER_IDS.map((p) => [p, { joined: false, st: '', x: 0, y: 0, b: false, s: 0, r: 0, seen: 0, rate: 0, cnt: 0, prevB: false }])),
  stations: Object.fromEntries(STATION_IDS.map((id) => [id, 0])),
  ship: { x: 0, y: 0, vx: 0, vy: 0, ang: 0, turbo: 0, turboCd: 0, flash: 0, hitCd: 0 },
  guns: { gun1: { aim: -Math.PI / 2, cd: 0 }, gun2: { aim: Math.PI / 2, cd: 0 } },
  bullets: [], rocks: [], stars: [], parts: [],
  score: 0, gold: 0, hits: 0, time: 0,
};
function newRock(far) {
  const a = Math.random() * Math.PI * 2, d = far ? rnd(1300, 1800) : rnd(450, 1500);
  const r = rnd(28, 72);
  return { x: S.ship.x + Math.cos(a) * d, y: S.ship.y + Math.sin(a) * d, vx: rnd(-90, 90), vy: rnd(-90, 90), r, hp: Math.ceil(r / 22), max: Math.ceil(r / 22), rot: rnd(0, 6), spin: rnd(-1, 1), hurt: 0, seed: Math.random() * 1000 };
}
function newStar() {
  const a = Math.random() * Math.PI * 2, d = rnd(700, 1600);
  return { x: S.ship.x + Math.cos(a) * d, y: S.ship.y + Math.sin(a) * d, t: Math.random() * 6 };
}
for (let i = 0; i < 16; i++) S.rocks.push(newRock(false));
for (let i = 0; i < 4; i++) S.stars.push(newStar());

// ---------- a telefonok vezérlő-rekordjai ----------
function freeStation(p) { for (const id of STATION_IDS) if (S.stations[id] === p) S.stations[id] = 0; }
net.onPad((p, pad) => {
  const P = S.players[p];
  if (!P) return;
  if (!pad) { P.joined = false; P.st = ''; freeStation(p); return; }
  const clamp = (v) => Math.max(-1, Math.min(1, Number(v) || 0));
  P.joined = true; P.seen = performance.now(); P.cnt++;
  P.x = clamp(pad.x); P.y = clamp(pad.y); P.b = !!pad.b; P.s = pad.s || 0; P.r = pad.r || 0;
  const want = STATIONS[pad.st] ? pad.st : '';
  if (want !== P.st) {
    if (!want) { freeStation(p); P.st = ''; }
    else if (!S.stations[want] || S.stations[want] === p) { freeStation(p); S.stations[want] = p; P.st = want; }
  }
});
setInterval(() => {   // jelszám másodpercenként, és a némán eltűnt telefonok elengedése
  const now = performance.now();
  for (const p of PLAYER_IDS) {
    const P = S.players[p];
    P.rate = P.cnt; P.cnt = 0;
    if (P.joined && now - P.seen > PAD_GONE_MS) { P.joined = false; P.st = ''; freeStation(p); net.kick?.(p); }
  }
}, 1000);

// ---------- szimuláció ----------
const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
function stationWorld(id) { const [x, y] = rot(...STATIONS[id].pos, S.ship.ang); return [S.ship.x + x, S.ship.y + y]; }
function burst(x, y, color, n, speed = 260) {
  for (let i = 0; i < n; i++) { const a = rnd(0, 6.3), v = rnd(60, speed); S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(.4, .9), color }); }
}
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

function update(dt) {
  S.time += dt;
  const sh = S.ship;
  // kormány: a kar iránya a gyorsulás iránya (a képernyőn, nem a hajóhoz képest: így a kicsinek is egyszerű)
  const hp = S.stations.helm ? S.players[S.stations.helm] : null;
  sh.turboCd = Math.max(0, sh.turboCd - dt); sh.turbo = Math.max(0, sh.turbo - dt);
  if (hp) {
    if (hp.b && !hp.prevB && sh.turboCd <= 0) { sh.turbo = 1.0; sh.turboCd = 4; }
    hp.prevB = hp.b;
    const boost = sh.turbo > 0 ? 1.9 : 1;
    sh.vx += hp.x * 950 * boost * dt; sh.vy += hp.y * 950 * boost * dt;
  }
  const drag = Math.exp(-1.5 * dt);
  sh.vx *= drag; sh.vy *= drag;
  const sp = Math.hypot(sh.vx, sh.vy), max = sh.turbo > 0 ? 950 : 560;
  if (sp > max) { sh.vx *= max / sp; sh.vy *= max / sp; }
  sh.x += sh.vx * dt; sh.y += sh.vy * dt;
  if (sp > 40) sh.ang += angDiff(sh.ang, Math.atan2(sh.vy, sh.vx)) * Math.min(1, 5 * dt);
  sh.flash = Math.max(0, sh.flash - dt); sh.hitCd = Math.max(0, sh.hitCd - dt);

  // ágyúk: a kar iránya a célzás iránya (abszolút), a gomb nyomva tartva sorozat
  for (const id of ['gun1', 'gun2']) {
    const g = S.guns[id], P = S.stations[id] ? S.players[S.stations[id]] : null;
    g.cd = Math.max(0, g.cd - dt);
    if (!P) continue;
    if (Math.hypot(P.x, P.y) > 0.3) {
      const d = angDiff(g.aim, Math.atan2(P.y, P.x));
      g.aim += Math.sign(d) * Math.min(Math.abs(d), 11 * dt);
    }
    if (P.b && g.cd <= 0) {
      g.cd = 0.16;
      const [gx, gy] = stationWorld(id);
      const bx = gx + Math.cos(g.aim) * 50, by = gy + Math.sin(g.aim) * 50;
      S.bullets.push({ x: bx, y: by, vx: Math.cos(g.aim) * 1150 + sh.vx, vy: Math.sin(g.aim) * 1150 + sh.vy, life: 1.1, color: PLAYERS[S.stations[id]].color });
    }
  }

  for (const b of S.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; }
  for (const r of S.rocks) {
    r.x += r.vx * dt; r.y += r.vy * dt; r.rot += r.spin * dt; r.hurt = Math.max(0, r.hurt - dt);
    for (const b of S.bullets) {
      if (b.life > 0 && Math.hypot(b.x - r.x, b.y - r.y) < r.r) {
        b.life = 0; r.hp--; r.hurt = 0.15; burst(b.x, b.y, b.color, 4, 160);
        if (r.hp <= 0) { S.score++; burst(r.x, r.y, '#cbd5e1', 18, 340); Object.assign(r, newRock(true)); break; }
      }
    }
    const d = Math.hypot(r.x - sh.x, r.y - sh.y);
    if (d < SHIP_R + r.r) {
      const nx = (r.x - sh.x) / d, ny = (r.y - sh.y) / d, push = SHIP_R + r.r - d;
      sh.x -= nx * push * 0.5; sh.y -= ny * push * 0.5; r.x += nx * push * 0.5; r.y += ny * push * 0.5;
      const vn = sh.vx * nx + sh.vy * ny;
      if (vn > 0) { sh.vx -= 1.6 * vn * nx; sh.vy -= 1.6 * vn * ny; }
      r.vx += nx * 120; r.vy += ny * 120;
      if (sh.hitCd <= 0) { S.hits++; sh.flash = 0.4; sh.hitCd = 0.6; burst(sh.x + nx * SHIP_R, sh.y + ny * SHIP_R, '#fbbf24', 14); }
    }
    if (d > 2000) Object.assign(r, newRock(true));
  }
  for (const st of S.stars) {
    st.t += dt;
    if (Math.hypot(st.x - sh.x, st.y - sh.y) < SHIP_R + 30) { S.gold++; burst(st.x, st.y, '#fde047', 20, 300); Object.assign(st, newStar()); }
    else if (Math.hypot(st.x - sh.x, st.y - sh.y) > 2200) Object.assign(st, newStar());
  }
  S.bullets = S.bullets.filter((b) => b.life > 0);
  for (const q of S.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.96; q.vy *= 0.96; q.life -= dt; }
  S.parts = S.parts.filter((q) => q.life > 0);
}

// ---------- rajzolás ----------
const cam = { x: 0, y: 0 };
function bgStars() {
  for (const [layer, size, alpha] of [[0.15, 1.6, .5], [0.35, 2.4, .7], [0.6, 3.2, .9]]) {
    const ox = -cam.x * layer, oy = -cam.y * layer, T = 400;
    for (let i = -1; i <= W / T + 1; i++) for (let j = -1; j <= H / T + 1; j++) {
      const ci = Math.floor((i * T - ox) / T), cj = Math.floor((j * T - oy) / T);
      for (let k = 0; k < 3; k++) {
        const h = Math.sin(ci * 127.1 + cj * 311.7 + k * 74.7 + layer * 99) * 43758.5453;
        const fx = h - Math.floor(h), h2 = Math.sin(h) * 43758.5453, fy = h2 - Math.floor(h2);
        const x = ci * T + fx * T + ox, y = cj * T + fy * T + oy;
        ctx.globalAlpha = alpha * (0.6 + 0.4 * Math.sin(S.time * 2 + h));
        ctx.fillStyle = k === 0 ? '#bae6fd' : '#fff';
        ctx.fillRect(x, y, size, size);
      }
    }
  }
  ctx.globalAlpha = 1;
}
function drawRock(r) {
  ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.rot);
  ctx.beginPath();
  for (let i = 0; i < 11; i++) {
    const a = i / 11 * Math.PI * 2, k = 0.78 + 0.22 * Math.abs(Math.sin(r.seed + i * 1.7));
    ctx.lineTo(Math.cos(a) * r.r * k, Math.sin(a) * r.r * k);
  }
  ctx.closePath();
  ctx.fillStyle = r.hurt > 0 ? '#f8fafc' : '#64748b'; ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = '#334155'; ctx.stroke();
  ctx.fillStyle = '#475569';
  ctx.beginPath(); ctx.arc(r.r * .25, -r.r * .2, r.r * .18, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(-r.r * .3, r.r * .25, r.r * .12, 0, 7); ctx.fill();
  ctx.restore();
}
function drawStar(st) {
  const s = 26 + Math.sin(st.t * 4) * 4;
  ctx.save(); ctx.translate(st.x, st.y); ctx.rotate(st.t);
  ctx.shadowColor = '#fde047'; ctx.shadowBlur = 30;
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, rr = i % 2 ? s * .45 : s; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill(); ctx.restore();
}
function avatar(x, y, p, size) {
  ctx.beginPath(); ctx.arc(x, y, size, 0, 7);
  ctx.fillStyle = PLAYERS[p].color; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.font = `${size * 1.2}px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(PLAYERS[p].icon, x, y + 2);
}
function drawShip() {
  const sh = S.ship;
  ctx.save(); ctx.translate(sh.x, sh.y);
  // hajtómű-láng
  const sp = Math.hypot(sh.vx, sh.vy);
  if (sp > 30) {
    ctx.save(); ctx.rotate(Math.atan2(sh.vy, sh.vx));
    const len = (sh.turbo > 0 ? 160 : 70) * Math.min(1, sp / 400) + Math.random() * 20;
    const g = ctx.createLinearGradient(-SHIP_R, 0, -SHIP_R - len, 0);
    g.addColorStop(0, sh.turbo > 0 ? '#e0f2fe' : '#fde68a'); g.addColorStop(.4, sh.turbo > 0 ? '#38bdf8' : '#f97316'); g.addColorStop(1, 'rgba(249,115,22,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-SHIP_R + 10, -30); ctx.lineTo(-SHIP_R - len, 0); ctx.lineTo(-SHIP_R + 10, 30); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.rotate(sh.ang);
  // test
  ctx.shadowColor = sh.flash > 0 ? '#f87171' : '#38bdf8'; ctx.shadowBlur = 40;
  const body = ctx.createRadialGradient(-20, -25, 10, 0, 0, SHIP_R);
  body.addColorStop(0, '#e2e8f0'); body.addColorStop(1, sh.flash > 0 ? '#f87171' : '#94a3b8');
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(0, 0, SHIP_R, 0, 7); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#facc15';   // orr
  ctx.beginPath(); ctx.moveTo(SHIP_R + 26, 0); ctx.lineTo(SHIP_R - 8, -24); ctx.lineTo(SHIP_R - 8, 24); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(15,23,42,.55)';   // a belső tér
  ctx.beginPath(); ctx.arc(0, 0, SHIP_R - 14, 0, 7); ctx.fill();
  ctx.restore();
  // ágyúcsövek (világkoordinátában célozva)
  for (const id of ['gun1', 'gun2']) {
    const [gx, gy] = stationWorld(id), g = S.guns[id], p = S.stations[id];
    ctx.save(); ctx.translate(gx, gy); ctx.rotate(g.aim);
    ctx.fillStyle = p ? PLAYERS[p].color : '#475569';
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(0, -9, 62, 18, 6); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  // állomások és a rajtuk álló játékosok
  for (const id of STATION_IDS) {
    const [x, y] = stationWorld(id), p = S.stations[id];
    if (p) avatar(x, y, p, 24);
    else {
      ctx.beginPath(); ctx.arc(x, y, 22, 0, 7); ctx.fillStyle = 'rgba(148,163,184,.25)'; ctx.fill();
      ctx.setLineDash([6, 6]); ctx.lineWidth = 3; ctx.strokeStyle = '#94a3b8'; ctx.stroke(); ctx.setLineDash([]);
      ctx.font = `24px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = .7;
      ctx.fillText(STATIONS[id].icon, x, y + 1); ctx.globalAlpha = 1;
    }
  }
}
function arrowTo(x, y, color, icon) {   // a képernyőn kívüli csillagok irányába mutató nyíl
  const sx = x - cam.x + W / 2, sy = y - cam.y + H / 2;
  if (sx > 0 && sx < W && sy > 0 && sy < H) return;
  const a = Math.atan2(sy - H / 2, sx - W / 2);
  const ex = W / 2 + Math.cos(a) * (W / 2 - 60), ey = H / 2 + Math.sin(a) * (H / 2 - 60);
  const px = Math.max(60, Math.min(W - 60, ex)), py = Math.max(60, Math.min(H - 60, ey));
  ctx.save(); ctx.translate(px, py); ctx.rotate(a);
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(28, 0); ctx.lineTo(-10, -18); ctx.lineTo(-10, 18); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.font = `30px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(icon, px - Math.cos(a) * 40, py - Math.sin(a) * 40);
}
function hud() {
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#facc15'; ctx.font = '900 44px system-ui'; ctx.textAlign = 'left';
  ctx.fillText('Becze Csillaghajó', 36, 66);
  ctx.fillStyle = '#94a3b8'; ctx.font = '600 24px system-ui';
  ctx.fillText(`kar-próba · v${VERSION}${net.mode === 'helyi' ? ' · helyi mód' : ''}`, 38, 100);
  ctx.font = `800 34px system-ui`; ctx.fillStyle = '#f8fafc';
  ctx.fillText(`⭐ ${S.gold}    🪨 ${S.score}    💥 ${S.hits}`, 36, 160);

  // játékosok: állomás, jelszám, a telefon által mért késés
  const joined = PLAYER_IDS.filter((p) => S.players[p].joined);
  joined.forEach((p, i) => {
    const P = S.players[p], x = 36 + i * 370, y = H - 120;
    ctx.fillStyle = 'rgba(15,23,42,.8)'; ctx.beginPath(); ctx.roundRect(x, y, 350, 92, 18); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = PLAYERS[p].color; ctx.stroke();
    ctx.font = `44px ${EMOJI}`; ctx.textAlign = 'left'; ctx.fillText(PLAYERS[p].icon, x + 14, y + 60);
    ctx.fillStyle = '#f8fafc'; ctx.font = '800 26px system-ui';
    ctx.fillText(P.st ? `${STATIONS[P.st].icon} ${STATIONS[P.st].name}` : 'nincs állomáson', x + 76, y + 38);
    ctx.fillStyle = P.r > 250 ? '#fca5a5' : '#86efac'; ctx.font = '600 21px system-ui';
    ctx.fillText(`${P.rate} jel/mp · késés ~${P.r ? Math.round(P.r / 2) : '?'} ms`, x + 76, y + 72);
  });

  // QR: középen nagyban, amíg senki nincs bent; utána a sarokban
  const big = joined.length === 0;
  const size = big ? 420 : 190;
  const qx = big ? W / 2 - size / 2 : W - size - 30, qy = big ? H / 2 - size / 2 - 40 : 30;
  if (big) {
    ctx.fillStyle = 'rgba(2,6,23,.75)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f8fafc'; ctx.font = '900 54px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('Szálljatok be! Olvassátok be a telefonnal:', W / 2, qy - 50);
  }
  if (qrCanvas) ctx.drawImage(qrCanvas, qx, qy, size, size);
  else if (net.mode === 'helyi') { ctx.fillStyle = '#94a3b8'; ctx.font = '600 26px system-ui'; ctx.textAlign = 'center'; ctx.fillText('phone.html?helyi=1', qx + size / 2, qy + size / 2); }
  if (net.room) {
    ctx.fillStyle = '#facc15'; ctx.font = `900 ${big ? 64 : 40}px system-ui`; ctx.textAlign = 'center';
    ctx.fillText(net.room, qx + size / 2, qy + size + (big ? 76 : 48));
  }
  if (big) {
    ctx.fillStyle = '#94a3b8'; ctx.font = '600 26px system-ui';
    ctx.fillText(phoneUrl, W / 2, qy + size + 130);
  }
}
function draw() {
  cam.x += (S.ship.x - cam.x) * 0.15; cam.y += (S.ship.y - cam.y) * 0.15;
  ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, W, H);
  const neb = ctx.createRadialGradient(W * .7 - cam.x * .05 % W, H * .3, 50, W * .7, H * .3, 900);
  neb.addColorStop(0, 'rgba(126,34,206,.25)'); neb.addColorStop(1, 'rgba(2,6,23,0)');
  ctx.fillStyle = neb; ctx.fillRect(0, 0, W, H);
  bgStars();
  ctx.save(); ctx.translate(W / 2 - cam.x, H / 2 - cam.y);
  for (const st of S.stars) drawStar(st);
  for (const r of S.rocks) drawRock(r);
  for (const b of S.bullets) { ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x, b.y, 8, 0, 7); ctx.fill(); }
  drawShip();
  for (const q of S.parts) { ctx.globalAlpha = Math.max(0, q.life); ctx.fillStyle = q.color; ctx.fillRect(q.x - 4, q.y - 4, 8, 8); }
  ctx.globalAlpha = 1;
  ctx.restore();
  for (const st of S.stars) arrowTo(st.x, st.y, '#fde047', '⭐');
  hud();
}

// ---------- állapot a telefonoknak ----------
function broadcast() {
  net.send({
    version: VERSION, beat: Math.floor(Date.now() / 2000),
    stations: S.stations,
    players: Object.fromEntries(PLAYER_IDS.filter((p) => S.players[p].joined).map((p) => [p, S.players[p].st])),
    ack: Object.fromEntries(PLAYER_IDS.filter((p) => S.players[p].joined).map((p) => [p, S.players[p].s])),
    gold: S.gold, score: S.score, hits: S.hits,
  });
}
setInterval(broadcast, 100);

// ---------- időzítés: a valódi eltelt időt pótolja, háttérben is ----------
const STEP = 1 / 60;
let lastT = performance.now(), acc = 0;
function tick() {
  const now = performance.now();
  acc = Math.min(acc + (now - lastT) / 1000, 2); lastT = now;
  while (acc >= STEP) { update(STEP); acc -= STEP; }
}
function frame() { tick(); draw(); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
setInterval(tick, 250);
window.__ship = { S, step: (sec) => { for (let i = 0; i < sec / STEP; i++) update(STEP); } };

addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') { document.fullscreenElement ? document.exitFullscreen() : cv.requestFullscreen?.(); }
});
