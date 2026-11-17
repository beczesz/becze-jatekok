// Becze Csillaghajó: a kivetítő. Itt fut a szimuláció, a telefonok csak a karjuk állását küldik.
// v0.2: 20 gonosz sorban, a nyíl mindig a következő felé mutat; minden legyőzött gonosz után fejlődik a hajó.
import { connectScreen } from './transport.js';
import {
  VERSION, PLAYERS, PLAYER_IDS, STATIONS, STATION_IDS, PAD_GONE_MS,
  WEAPONS, SHIELDS, ENGINES, HULLS, GEAR, GEAR_LABEL, BOSSES, LEVELS, gearAt, bossStats, weaponDps, ROCKET,
} from './rules.js';

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
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const S = {
  players: Object.fromEntries(PLAYER_IDS.map((p) => [p, { joined: false, st: '', x: 0, y: 0, b: false, s: 0, r: 0, seen: 0, rate: 0, cnt: 0, prevB: false }])),
  stations: Object.fromEntries(STATION_IDS.map((id) => [id, 0])),
  ship: { x: 0, y: 0, vx: 0, vy: 0, ang: 0, turbo: 0, turboCd: 0, flash: 0, hitCd: 0, glow: 0 },
  guns: { gun1: { aim: -Math.PI / 2, cd: 0 }, gun2: { aim: Math.PI / 2, cd: 0 } },
  rocket: { aim: Math.PI, load: 1, kick: 0 }, rockets: [], shake: 0,
  gear: { weapon: 0, shield: 0, engine: 0, hull: 0 },
  shield: { charge: 0, t: 0, flash: 0 },
  level: 1, boss: null, phase: 'fight', phaseT: 0, banner: null,
  bullets: [], spits: [], minions: [], rocks: [], stars: [], parts: [],
  gold: 0, kills: 0, hits: 0, time: 0,
};

function newRock(far) {
  const a = Math.random() * Math.PI * 2, d = far ? rnd(1300, 1800) : rnd(500, 1500);
  const r = rnd(28, 64);
  return { x: S.ship.x + Math.cos(a) * d, y: S.ship.y + Math.sin(a) * d, vx: rnd(-60, 60), vy: rnd(-60, 60), r, hp: Math.ceil(r / 22), rot: rnd(0, 6), spin: rnd(-1, 1), hurt: 0, seed: Math.random() * 1000 };
}
function newStar() {
  const a = Math.random() * Math.PI * 2, d = rnd(700, 1600);
  return { x: S.ship.x + Math.cos(a) * d, y: S.ship.y + Math.sin(a) * d, t: Math.random() * 6 };
}
for (let i = 0; i < 8; i++) S.rocks.push(newRock(false));
for (let i = 0; i < 3; i++) S.stars.push(newStar());

// kisebb ellenségek: három méret, mind lassú
const MINION_KINDS = [
  { name: 'kicsi',   r: 24, speed: 85, hpK: 0.6 },
  { name: 'közepes', r: 38, speed: 60, hpK: 1.4 },
  { name: 'nagy',    r: 56, speed: 40, hpK: 3 },
];
function newMinion(x, y, level) {
  const k = MINION_KINDS[Math.floor(Math.random() * (level < 3 ? 2 : 3))];
  const st = bossStats(level);
  const hp = Math.max(1, Math.round(st.minionDps * k.hpK));
  const B = BOSSES[(level - 1) % LEVELS];
  return { x, y, vx: 0, vy: 0, r: k.r, speed: k.speed, hp, max: hp, hurt: 0, t: rnd(0, 6), color: B.color, eyes: 1 + Math.floor(Math.random() * 2) };
}

function spawnBoss() {
  const L = S.level, B = BOSSES[(L - 1) % LEVELS], st = bossStats(L);
  // az előző iránytól nagyjából elfordulva, messze: a nyíl vezet oda
  const a = Math.random() * Math.PI * 2, d = rnd(1900, 2400);
  const x = S.ship.x + Math.cos(a) * d, y = S.ship.y + Math.sin(a) * d;
  S.boss = { ...st, name: B.name, color: B.color, gift: B.gift, level: L, x, y, vx: 0, vy: 0, max: st.hp, hp: st.hp, hurt: 0, t: 0, spitT: 2, summonT: st.summonEvery, scary: 0, awake: false, orbit: Math.random() < 0.5 ? 1 : -1 };
  S.minions = S.minions.filter((m) => Math.hypot(m.x - S.ship.x, m.y - S.ship.y) < 1400);
  for (let i = 0; i < st.minions; i++) {
    const ma = Math.random() * Math.PI * 2, md = rnd(st.r + 120, st.r + 420);
    S.minions.push(newMinion(x + Math.cos(ma) * md, y + Math.sin(ma) * md, L));
  }
  S.phase = 'fight';
}
function applyGear() {
  S.gear = gearAt(S.level);
  S.shield.charge = SHIELDS[S.gear.shield].charge;
}
function startLevel(L) { S.level = L; applyGear(); spawnBoss(); }
startLevel(1);

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
const shieldR = () => SHIP_R + 38 + S.gear.shield * 6;

// a hajót ért ütés: ha van pajzs-töltés, a pajzs fogja meg; különben csak villan és lökődik (nincs kiesés)
function hitShip(x, y, push) {
  const sh = S.ship, d = Math.hypot(x - sh.x, y - sh.y) || 1, nx = (x - sh.x) / d, ny = (y - sh.y) / d;
  if (S.shield.charge >= 1) {
    S.shield.charge -= 1; S.shield.flash = 0.35;
    burst(sh.x + nx * shieldR(), sh.y + ny * shieldR(), '#7dd3fc', 14, 260);
    return true;
  }
  if (sh.hitCd <= 0) { S.hits++; sh.flash = 0.4; sh.hitCd = 0.5; burst(sh.x + nx * SHIP_R, sh.y + ny * SHIP_R, '#fbbf24', 14); }
  sh.vx -= nx * push; sh.vy -= ny * push;
  return false;
}

function nearestTarget(x, y, bossFirst) {   // a célkövető lövedéknek; a rakéta a gonoszt szereti a legjobban
  if (bossFirst && S.boss && S.phase === 'fight' && Math.hypot(S.boss.x - x, S.boss.y - y) < 1500) return S.boss;
  let best = null, bd = 900;
  const cands = S.boss && S.phase === 'fight' ? [S.boss, ...S.minions] : S.minions;
  for (const t of cands) { const d = Math.hypot(t.x - x, t.y - y) - (t.r || 0); if (d < bd) { bd = d; best = t; } }
  return best;
}

// rakéta: a hajó hátuljáról indul a célzás irányába, lassan, aztán gyorsul és ráfordul a célra
function launchRocket(RK) {
  const [x, y] = stationWorld('rocket'), sh = S.ship;
  const color = PLAYERS[S.stations.rocket].color;
  S.rockets.push({ x: x + Math.cos(RK.aim) * 40, y: y + Math.sin(RK.aim) * 40, a: RK.aim, speed: ROCKET.speed0, vx: sh.vx, vy: sh.vy, t: 0, life: ROCKET.life, color });
  RK.load = 0; RK.kick = 0.25;
  burst(x + Math.cos(RK.aim) * 50, y + Math.sin(RK.aim) * 50, '#fde047', 16, 260);
}
// robbanás: a körében mindent sebez (gonosz, kicsik, aszteroidák, nyálgolyók); a hajónak nem árt
function explode(r) {
  r.done = true;
  const R = ROCKET.radius, dmg = Math.max(6, weaponDps(S.gear.weapon) * ROCKET.dmgK);
  for (const [c, n, v] of [['#ffffff', 30, 300], ['#fde047', 40, 520], ['#fb923c', 40, 620], [r.color, 30, 450]]) burst(r.x, r.y, c, n, v);
  S.booms = S.booms || []; S.booms.push({ x: r.x, y: r.y, t: 0 });
  S.shake = 0.35;
  const B = S.boss;
  if (B && Math.hypot(B.x - r.x, B.y - r.y) < R + B.r) { B.hp -= dmg; B.hurt = 0.3; if (B.hp <= 0) defeatBoss(); }
  for (const m of S.minions) if (Math.hypot(m.x - r.x, m.y - r.y) < R + m.r) { m.hp -= dmg; m.hurt = 0.2; if (m.hp <= 0) { S.kills++; S.gold++; burst(m.x, m.y, m.color, 22, 340); } }
  S.minions = S.minions.filter((m) => m.hp > 0);
  for (const k of S.rocks) if (Math.hypot(k.x - r.x, k.y - r.y) < R + k.r) { burst(k.x, k.y, '#cbd5e1', 18, 340); Object.assign(k, newRock(true)); }
  for (const s of S.spits) if (Math.hypot(s.x - r.x, s.y - r.y) < R + s.r) { s.life = 0; burst(s.x, s.y, s.color, 10, 200); }
}

function fire(id, g, P) {
  const Wp = WEAPONS[S.gear.weapon], sh = S.ship, [gx, gy] = stationWorld(id);
  const color = PLAYERS[S.stations[id]].color;
  for (let i = 0; i < Wp.shots; i++) {
    const k = Wp.shots === 1 ? 0 : i - (Wp.shots - 1) / 2;
    const a = g.aim + k * Wp.spread;
    const px = -Math.sin(g.aim) * k * Wp.par, py = Math.cos(g.aim) * k * Wp.par;
    const bx = gx + Math.cos(g.aim) * 55 + px, by = gy + Math.sin(g.aim) * 55 + py;
    S.bullets.push({ x: bx, y: by, vx: Math.cos(a) * Wp.speed + sh.vx, vy: Math.sin(a) * Wp.speed + sh.vy, life: 1.6, color, dmg: Wp.dmg, kind: Wp.kind, size: Wp.size, homing: Wp.homing });
  }
}

function defeatBoss() {
  const b = S.boss;
  for (let i = 0; i < 6; i++) burst(b.x + rnd(-b.r, b.r) * .6, b.y + rnd(-b.r, b.r) * .6, i % 2 ? b.color : '#fde047', 30, 520);
  burst(b.x, b.y, '#ffffff', 60, 700);
  S.gold += 5 + b.level;
  for (const m of S.minions) burst(m.x, m.y, m.color, 12, 300);   // a gonosz bukásával a kicsik is elpukkannak
  S.minions = []; S.spits = [];
  const gift = b.gift, cur = S.gear[gift];
  let label = GEAR_LABEL[gift], what = '';
  if (gift in GEAR) { const next = GEAR[gift][cur + 1]; what = `${next.icon} ${next.name}`; }
  else what = '👑 Győzelem!';
  S.banner = { title: `Legyőztétek: ${b.name}!`, sub: `${label}: ${what}`, t: 0, gift };
  S.boss = null;
  S.phase = b.level === LEVELS ? 'won' : 'reward';
  S.phaseT = S.phase === 'won' ? 10 : 4.5;
  S.ship.glow = 1.5;
  net.flash?.();
}

function update(dt) {
  S.time += dt;
  const sh = S.ship, E = ENGINES[S.gear.engine];
  // kormány: a kar iránya a gyorsulás iránya (a képernyőn, nem a hajóhoz képest: így a kicsinek is egyszerű)
  const hp = S.stations.helm ? S.players[S.stations.helm] : null;
  sh.turboCd = Math.max(0, sh.turboCd - dt); sh.turbo = Math.max(0, sh.turbo - dt);
  if (hp) {
    if (hp.b && !hp.prevB && sh.turboCd <= 0) { sh.turbo = 1.0; sh.turboCd = 4; }
    hp.prevB = hp.b;
    const boost = sh.turbo > 0 ? 1.8 : 1;
    sh.vx += hp.x * E.acc * boost * dt; sh.vy += hp.y * E.acc * boost * dt;
  }
  const drag = Math.exp(-1.5 * dt);
  sh.vx *= drag; sh.vy *= drag;
  const sp = Math.hypot(sh.vx, sh.vy), max = sh.turbo > 0 ? E.max * 1.6 : E.max;
  if (sp > max) { sh.vx *= max / sp; sh.vy *= max / sp; }
  sh.x += sh.vx * dt; sh.y += sh.vy * dt;
  if (sp > 40) sh.ang += angDiff(sh.ang, Math.atan2(sh.vy, sh.vx)) * Math.min(1, 5 * dt);
  sh.flash = Math.max(0, sh.flash - dt); sh.hitCd = Math.max(0, sh.hitCd - dt); sh.glow = Math.max(0, sh.glow - dt);

  // pajzs: magától tölt vissza
  const SH = SHIELDS[S.gear.shield];
  S.shield.flash = Math.max(0, S.shield.flash - dt);
  if (SH.charge && S.shield.charge < SH.charge) S.shield.charge = Math.min(SH.charge, S.shield.charge + dt / SH.regen);

  // ágyúk: a kar iránya a célzás iránya (abszolút), a gomb nyomva tartva sorozat
  for (const id of ['gun1', 'gun2']) {
    const g = S.guns[id], P = S.stations[id] ? S.players[S.stations[id]] : null;
    g.cd = Math.max(0, g.cd - dt);
    if (!P) continue;
    if (Math.hypot(P.x, P.y) > 0.3) {
      const d = angDiff(g.aim, Math.atan2(P.y, P.x));
      g.aim += Math.sign(d) * Math.min(Math.abs(d), 11 * dt);
    }
    if (P.b && g.cd <= 0) { g.cd = WEAPONS[S.gear.weapon].cd; fire(id, g, P); }
  }

  // rakétás: a kar a célzás, a gomb kilövi, ha töltve van; utána újratölt
  const RK = S.rocket, RP = S.stations.rocket ? S.players[S.stations.rocket] : null;
  const reload = Math.max(ROCKET.reloadMin, ROCKET.reload - S.gear.weapon * 0.15);
  RK.load = Math.min(1, RK.load + dt / reload); RK.kick = Math.max(0, RK.kick - dt);
  if (RP) {
    if (Math.hypot(RP.x, RP.y) > 0.3) { const d = angDiff(RK.aim, Math.atan2(RP.y, RP.x)); RK.aim += Math.sign(d) * Math.min(Math.abs(d), 8 * dt); }
    if (RP.b && !RP.prevB && RK.load >= 1) launchRocket(RK);
    RP.prevB = RP.b;
  }
  for (const r of S.rockets) {
    r.t += dt; r.life -= dt;
    r.speed = Math.min(ROCKET.speedMax, r.speed + ROCKET.acc * dt);
    const tg = r.t > 0.25 ? nearestTarget(r.x, r.y, true) : null;
    if (tg) r.a += Math.max(-ROCKET.turn * dt, Math.min(ROCKET.turn * dt, angDiff(r.a, Math.atan2(tg.y - r.y, tg.x - r.x))));
    r.x += Math.cos(r.a) * r.speed * dt + r.vx * dt; r.y += Math.sin(r.a) * r.speed * dt + r.vy * dt;
    r.vx *= 0.97; r.vy *= 0.97;
    if (Math.random() < 0.9) S.parts.push({ x: r.x - Math.cos(r.a) * 26, y: r.y - Math.sin(r.a) * 26, vx: -Math.cos(r.a) * 120 + rnd(-40, 40), vy: -Math.sin(r.a) * 120 + rnd(-40, 40), life: rnd(.25, .5), color: Math.random() < .5 ? '#fb923c' : '#fde047' });
    const touch = (S.boss && Math.hypot(S.boss.x - r.x, S.boss.y - r.y) < S.boss.r * 0.9 + 16)
      || S.minions.some((m) => Math.hypot(m.x - r.x, m.y - r.y) < m.r + 16)
      || S.rocks.some((k) => Math.hypot(k.x - r.x, k.y - r.y) < k.r + 10)
      || S.spits.some((s) => Math.hypot(s.x - r.x, s.y - r.y) < s.r + 14);
    if (touch || r.life <= 0) explode(r);
  }
  S.rockets = S.rockets.filter((r) => !r.done);
  S.shake = Math.max(0, S.shake - dt);

  // lövedékek (a célkövetők lágyan fordulnak)
  for (const b of S.bullets) {
    if (b.homing) {
      const t = nearestTarget(b.x, b.y);
      if (t) {
        const sp2 = Math.hypot(b.vx, b.vy), a = Math.atan2(b.vy, b.vx);
        const na = a + Math.max(-b.homing * dt, Math.min(b.homing * dt, angDiff(a, Math.atan2(t.y - b.y, t.x - b.x))));
        b.vx = Math.cos(na) * sp2; b.vy = Math.sin(na) * sp2;
      }
    }
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
  }

  // a gonosz
  const B = S.boss;
  if (B) {
    B.t += dt; B.hurt = Math.max(0, B.hurt - dt);
    const dx = sh.x - B.x, dy = sh.y - B.y, d = Math.hypot(dx, dy) || 1;
    // minél közelebb vagyunk, annál ijesztőbb (0: messze alszik, 1: teljesen dühös)
    B.scary += (clamp01((1700 - d) / 1100) - B.scary) * Math.min(1, 2 * dt);
    B.awake = d < 1400;
    const R = B.r * (0.8 + 0.2 * B.scary);
    if (B.awake) {
      // lassan közelít, de megáll egy tisztes távolságban, és körbe-körbe lebeg: így mindig el lehet találni
      const want = R + 300, nx = dx / d, ny = dy / d;
      const toward = d > want ? 1 : d < want - 80 ? -0.6 : 0;
      B.vx += (nx * toward * B.speed + -ny * B.orbit * B.speed * 0.5 - B.vx) * Math.min(1, 1.5 * dt);
      B.vy += (ny * toward * B.speed + nx * B.orbit * B.speed * 0.5 - B.vy) * Math.min(1, 1.5 * dt);
      if (B.spitEvery) {
        B.spitT -= dt;
        if (B.spitT <= 0) {
          B.spitT = B.spitEvery;
          const a = Math.atan2(dy, dx) + rnd(-0.15, 0.15);
          S.spits.push({ x: B.x + Math.cos(a) * R, y: B.y + Math.sin(a) * R, vx: Math.cos(a) * B.spitSpeed, vy: Math.sin(a) * B.spitSpeed, r: 16 + B.level * 0.6, life: 6, color: B.color });
        }
      }
      if (B.summonEvery) {
        B.summonT -= dt;
        if (B.summonT <= 0 && S.minions.length < B.minions + 2) {
          B.summonT = B.summonEvery;
          const a = rnd(0, 6.3);
          S.minions.push(newMinion(B.x + Math.cos(a) * (R + 40), B.y + Math.sin(a) * (R + 40), B.level));
          burst(B.x + Math.cos(a) * R, B.y + Math.sin(a) * R, B.color, 16, 240);
        }
      }
    } else { B.vx = Math.cos(B.t * 0.3) * 15; B.vy = Math.sin(B.t * 0.4) * 15; }
    B.x += B.vx * dt; B.y += B.vy * dt;
    for (const b of S.bullets) {
      if (b.life > 0 && Math.hypot(b.x - B.x, b.y - B.y) < R) {
        b.life = 0; B.hp -= b.dmg; B.hurt = 0.12; burst(b.x, b.y, b.color, 5, 200);
        if (B.hp <= 0) { defeatBoss(); break; }
      }
    }
    if (S.boss && d < SHIP_R + R) {   // ha nekimegyünk, csak lepattanunk róla
      const nx = dx / d, ny = dy / d, push = SHIP_R + R - d;
      sh.x += nx * push; sh.y += ny * push;
      const vn = sh.vx * nx + sh.vy * ny;
      if (vn < 0) { sh.vx -= 1.6 * vn * nx; sh.vy -= 1.6 * vn * ny; }
      if (sh.hitCd <= 0) hitShip(B.x, B.y, 0);
    }
  }

  // nyálgolyók: lassúak, a pajzs megfogja, a lövés is szétpukkasztja
  for (const s of S.spits) {
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    const d = Math.hypot(s.x - sh.x, s.y - sh.y);
    const reach = S.shield.charge >= 1 ? shieldR() : SHIP_R;
    if (d < reach + s.r) { s.life = 0; if (!hitShip(s.x, s.y, 160)) burst(s.x, s.y, s.color, 14, 220); }
    for (const b of S.bullets) if (s.life > 0 && b.life > 0 && Math.hypot(b.x - s.x, b.y - s.y) < s.r + 6) { s.life = 0; b.life = 0; burst(s.x, s.y, s.color, 10, 200); }
  }
  S.spits = S.spits.filter((s) => s.life > 0);

  // kisebb ellenségek: lassan sodródnak a hajó felé
  for (const m of S.minions) {
    m.t += dt; m.hurt = Math.max(0, m.hurt - dt);
    const dx = sh.x - m.x, dy = sh.y - m.y, d = Math.hypot(dx, dy) || 1;
    const go = d < 1300 ? m.speed : 12;
    m.vx += (dx / d * go - m.vx) * Math.min(1, dt); m.vy += (dy / d * go - m.vy) * Math.min(1, dt);
    m.x += m.vx * dt + Math.cos(m.t * 3) * 20 * dt; m.y += m.vy * dt + Math.sin(m.t * 2.5) * 20 * dt;
    for (const b of S.bullets) {
      if (b.life > 0 && Math.hypot(b.x - m.x, b.y - m.y) < m.r + 4) {
        b.life = 0; m.hp -= b.dmg; m.hurt = 0.12; burst(b.x, b.y, b.color, 4, 160);
        if (m.hp <= 0) { S.kills++; S.gold++; burst(m.x, m.y, m.color, 22, 340); break; }
      }
    }
    const reach = S.shield.charge >= 1 ? shieldR() : SHIP_R;
    if (m.hp > 0 && d < reach + m.r) {
      const nx = dx / d, ny = dy / d;
      if (hitShip(m.x, m.y, 220)) { m.hp -= 1 + S.gear.shield * 2; m.hurt = .2; }   // a pajzs vissza is üt
      m.x -= nx * 160; m.y -= ny * 160; m.vx = -nx * 200; m.vy = -ny * 200;
      if (m.hp <= 0) { S.kills++; S.gold++; burst(m.x, m.y, m.color, 22, 340); }
    }
  }
  S.minions = S.minions.filter((m) => m.hp > 0 && Math.hypot(m.x - sh.x, m.y - sh.y) < 3200);

  // aszteroidák és csillagok, mint eddig
  for (const r of S.rocks) {
    r.x += r.vx * dt; r.y += r.vy * dt; r.rot += r.spin * dt; r.hurt = Math.max(0, r.hurt - dt);
    for (const b of S.bullets) {
      if (b.life > 0 && Math.hypot(b.x - r.x, b.y - r.y) < r.r) {
        b.life = 0; r.hp -= b.dmg; r.hurt = 0.15; burst(b.x, b.y, b.color, 4, 160);
        if (r.hp <= 0) { burst(r.x, r.y, '#cbd5e1', 18, 340); Object.assign(r, newRock(true)); break; }
      }
    }
    const d = Math.hypot(r.x - sh.x, r.y - sh.y);
    if (d < SHIP_R + r.r) {
      const nx = (r.x - sh.x) / d, ny = (r.y - sh.y) / d, push = SHIP_R + r.r - d;
      sh.x -= nx * push * 0.5; sh.y -= ny * push * 0.5; r.x += nx * push * 0.5; r.y += ny * push * 0.5;
      const vn = sh.vx * nx + sh.vy * ny;
      if (vn > 0) { sh.vx -= 1.6 * vn * nx; sh.vy -= 1.6 * vn * ny; }
      r.vx += nx * 120; r.vy += ny * 120;
    }
    if (d > 2000) Object.assign(r, newRock(true));
  }
  for (const st of S.stars) {
    st.t += dt;
    const d = Math.hypot(st.x - sh.x, st.y - sh.y);
    if (d < SHIP_R + 30) { S.gold++; burst(st.x, st.y, '#fde047', 20, 300); Object.assign(st, newStar()); }
    else if (d > 2200) Object.assign(st, newStar());
  }
  S.bullets = S.bullets.filter((b) => b.life > 0);
  for (const q of S.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.96; q.vy *= 0.96; q.life -= dt; }
  S.parts = S.parts.filter((q) => q.life > 0);

  // jutalom-szünet, utána új szint
  if (S.banner) S.banner.t += dt;
  if (S.phase !== 'fight') {
    S.phaseT -= dt;
    if (S.phaseT <= 0) { S.banner = null; startLevel(S.level + 1); }
  }
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

// szemek: a hajó felé néznek; open: 0 csukva (alszik), 1 tágra nyitva
function eye(x, y, r, open, lookA, angry) {
  ctx.fillStyle = '#fff7ed';
  ctx.beginPath(); ctx.ellipse(x, y, r, r * Math.max(0.12, open), 0, 0, 7); ctx.fill();
  if (open > 0.25) {
    ctx.fillStyle = angry > 0.6 ? '#dc2626' : '#111827';
    ctx.beginPath(); ctx.arc(x + Math.cos(lookA) * r * .35, y + Math.sin(lookA) * r * .35 * open, r * .45 * Math.min(1, open + .2), 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + Math.cos(lookA) * r * .35 - r * .15, y - r * .18 * open, r * .12, 0, 7); ctx.fill();
  }
  if (angry > 0.3) {   // dühös szemöldök
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = Math.max(4, r * .18); ctx.lineCap = 'round';
    const tilt = x < 0 ? 1 : x > 0 ? -1 : 0;
    ctx.beginPath(); ctx.moveTo(x - r * 1.05, y - r * (0.9 + .3 * tilt * angry)); ctx.lineTo(x + r * 1.05, y - r * (0.9 - .3 * tilt * angry)); ctx.stroke();
  }
}
function drawBoss(B) {
  const s = B.scary, R = B.r * (0.8 + 0.2 * s), t = B.t;
  const lookA = Math.atan2(S.ship.y - B.y, S.ship.x - B.x);
  ctx.save(); ctx.translate(B.x, B.y);
  // csápok
  ctx.lineCap = 'round';
  for (let i = 0; i < B.tentacles; i++) {
    const a = Math.PI * 0.15 + (i + 0.5) / B.tentacles * Math.PI * 0.7;
    ctx.strokeStyle = B.color; ctx.lineWidth = R * 0.16;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * .7, Math.sin(a) * R * .7);
    for (let k = 1; k <= 6; k++) {
      const L = R * (0.7 + k * 0.14 * (0.8 + s * .5)), w = Math.sin(t * 2.5 + i + k * .8) * 0.18 * k / 6;
      ctx.lineTo(Math.cos(a + w) * L, Math.sin(a + w) * L);
    }
    ctx.stroke();
  }
  // szarvak
  if (B.horns) {
    ctx.fillStyle = '#fef3c7';
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * R * .35, -R * .75); ctx.lineTo(side * R * (0.65 + .15 * s), -R * (1.3 + .25 * s)); ctx.lineTo(side * R * .62, -R * .55); ctx.closePath(); ctx.fill();
    }
  }
  // test: lüktető paca, a magasabb szinteken tüskékkel
  ctx.shadowColor = s > .5 ? '#ef4444' : B.color; ctx.shadowBlur = 20 + 60 * s;
  const g = ctx.createRadialGradient(-R * .3, -R * .35, R * .1, 0, 0, R * 1.1);
  g.addColorStop(0, B.hurt > 0 ? '#ffffff' : '#ffffffaa'); g.addColorStop(.25, B.hurt > 0 ? '#ffffff' : B.color); g.addColorStop(1, '#0f172a');
  ctx.fillStyle = g;
  ctx.beginPath();
  const N = B.spikes ? 32 : 24;
  for (let i = 0; i <= N; i++) {
    const a = i / N * Math.PI * 2;
    let k = 1 + 0.06 * Math.sin(t * 3 + i * 1.3) * (1 + s);
    if (B.spikes && i % 2 === 0) k += 0.12 + 0.12 * s;
    ctx.lineTo(Math.cos(a) * R * k, Math.sin(a) * R * k);
  }
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  // szemek
  const er = R * (B.eyes === 1 ? .3 : B.eyes === 2 ? .22 : .17);
  const open = 0.08 + 0.92 * clamp01(s * 1.4);
  const ex = B.eyes === 1 ? [0] : B.eyes === 2 ? [-.33, .33] : B.eyes === 3 ? [-.42, 0, .42] : [-.5, -.17, .17, .5];
  ex.forEach((fx, i) => eye(fx * R, -R * (0.22 + (B.eyes > 2 && i % 2 ? .12 : 0)), er, open, lookA, s));
  // száj: közelről tátva, fogakkal
  const mw = R * .62, mh = R * (0.06 + 0.32 * s);
  ctx.fillStyle = '#1f0a0a';
  ctx.beginPath(); ctx.ellipse(0, R * .3, mw, mh, 0, 0, 7); ctx.fill();
  if (s > 0.25) {
    ctx.fillStyle = '#f8fafc';
    const teeth = 4 + Math.floor(B.level / 2);
    for (let i = 0; i < teeth; i++) {
      const x = -mw * .85 + (i + .5) / teeth * mw * 1.7, th = mh * .55;
      ctx.beginPath(); ctx.moveTo(x - mw / teeth * .7, R * .3 - mh * .75); ctx.lineTo(x + mw / teeth * .7, R * .3 - mh * .75); ctx.lineTo(x, R * .3 - mh * .75 + th); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - mw / teeth * .7, R * .3 + mh * .75); ctx.lineTo(x + mw / teeth * .7, R * .3 + mh * .75); ctx.lineTo(x, R * .3 + mh * .75 - th); ctx.closePath(); ctx.fill();
    }
  }
  // messziről alszik: Zzz
  if (s < 0.15) {
    ctx.fillStyle = '#e2e8f0'; ctx.font = `800 ${R * .35}px system-ui`; ctx.textAlign = 'center'; ctx.globalAlpha = .8;
    ctx.fillText('z', R * .9, -R * .9 - Math.sin(t * 2) * 10); ctx.font = `800 ${R * .25}px system-ui`; ctx.fillText('z', R * 1.2, -R * 1.25 - Math.sin(t * 2 + 1) * 10);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
function drawBossLabel(B) {   // név és életcsík: mindenek fölött, hogy a kis ellenségek ne takarják
  const R = B.r * (0.8 + 0.2 * B.scary);
  const bw = Math.max(260, R * 2.2), by = B.y - R * 1.45 - 40;
  ctx.fillStyle = 'rgba(2,6,23,.75)'; ctx.beginPath(); ctx.roundRect(B.x - bw / 2 - 8, by - 50, bw + 16, 80, 14); ctx.fill();
  ctx.fillStyle = '#f8fafc'; ctx.font = '900 30px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${B.level}. ${B.name}`, B.x, by - 16);
  ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.roundRect(B.x - bw / 2, by, bw, 20, 10); ctx.fill();
  ctx.fillStyle = B.hp / B.max > .3 ? '#ef4444' : '#22c55e';
  ctx.beginPath(); ctx.roundRect(B.x - bw / 2, by, Math.max(10, bw * B.hp / B.max), 20, 10); ctx.fill();
}
function drawMinion(m) {
  ctx.save(); ctx.translate(m.x, m.y);
  ctx.fillStyle = m.hurt > 0 ? '#fff' : m.color;
  ctx.shadowColor = m.color; ctx.shadowBlur = 18;
  ctx.beginPath();
  for (let i = 0; i <= 14; i++) { const a = i / 14 * Math.PI * 2, k = 1 + 0.12 * Math.sin(m.t * 4 + i * 2); ctx.lineTo(Math.cos(a) * m.r * k, Math.sin(a) * m.r * k); }
  ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(15,23,42,.45)'; ctx.beginPath(); ctx.arc(0, m.r * .25, m.r * .7, 0.1, Math.PI - .1); ctx.fill();
  const la = Math.atan2(S.ship.y - m.y, S.ship.x - m.x);
  if (m.eyes === 1) eye(0, -m.r * .15, m.r * .38, 1, la, .7);
  else { eye(-m.r * .32, -m.r * .15, m.r * .27, 1, la, .7); eye(m.r * .32, -m.r * .15, m.r * .27, 1, la, .7); }
  ctx.fillStyle = '#1f0a0a'; ctx.beginPath(); ctx.ellipse(0, m.r * .4, m.r * .35, m.r * .14, 0, 0, 7); ctx.fill();
  ctx.restore();
}
function drawSpit(s) {
  ctx.save(); ctx.shadowColor = s.color; ctx.shadowBlur = 20;
  ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(s.x - s.r * .3, s.y - s.r * .3, s.r * .35, 0, 7); ctx.fill();
  ctx.restore();
}
function drawBullet(b) {
  const a = Math.atan2(b.vy, b.vx);
  ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a);
  if (b.kind === 'laser') {
    ctx.shadowColor = b.color; ctx.shadowBlur = 16; ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(10, 0); ctx.stroke(); ctx.strokeStyle = b.color; ctx.lineWidth = 3; ctx.stroke();
  } else if (b.kind === 'rocket') {
    ctx.fillStyle = '#fb923c'; ctx.beginPath(); ctx.moveTo(-24 - Math.random() * 10, 0); ctx.lineTo(-10, -6); ctx.lineTo(-10, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e2e8f0'; ctx.beginPath(); ctx.roundRect(-12, -6, 24, 12, 5); ctx.fill();
    ctx.fillStyle = b.color; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(10, -6); ctx.lineTo(10, 6); ctx.closePath(); ctx.fill();
  } else if (b.kind === 'plasma' || b.kind === 'star') {
    ctx.shadowColor = b.kind === 'star' ? '#fde047' : '#c084fc'; ctx.shadowBlur = 24;
    ctx.fillStyle = b.kind === 'star' ? '#fef08a' : '#e9d5ff';
    if (b.kind === 'star') { ctx.rotate(S.time * 8); ctx.beginPath(); for (let i = 0; i < 10; i++) { const q = i / 10 * Math.PI * 2, rr = i % 2 ? b.size * .45 : b.size; ctx.lineTo(Math.cos(q) * rr, Math.sin(q) * rr); } ctx.closePath(); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(0, 0, b.size, 0, 7); ctx.fill(); ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(0, 0, b.size * .5, 0, 7); ctx.fill(); }
  } else {
    ctx.fillStyle = S.gear.weapon === 0 ? '#a8a29e' : b.color;
    ctx.beginPath(); ctx.arc(0, 0, b.size, 0, 7); ctx.fill();
  }
  ctx.restore();
}
function avatar(x, y, p, size) {
  ctx.beginPath(); ctx.arc(x, y, size, 0, 7);
  ctx.fillStyle = PLAYERS[p].color; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.font = `${size * 1.2}px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(PLAYERS[p].icon, x, y + 2);
}

// a hajótest kinézete szintenként (a hajó saját koordinátáiban, orr: +x)
const HULL_LOOK = [
  { body: ['#d6d3d1', '#78716c'], glow: '#a8a29e', nose: '#f59e0b' },
  { body: ['#e2e8f0', '#94a3b8'], glow: '#38bdf8', nose: '#facc15' },
  { body: ['#dbeafe', '#3b82f6'], glow: '#60a5fa', nose: '#f8fafc' },
  { body: ['#ccfbf1', '#0d9488'], glow: '#2dd4bf', nose: '#f0fdfa' },
  { body: ['#fef9c3', '#ca8a04'], glow: '#fde047', nose: '#ffffff' },
];
function wing(pts, fill) { ctx.fillStyle = fill; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(15,23,42,.6)'; ctx.lineWidth = 3; ctx.stroke(); }
function drawHullExtras(h, look) {
  const R = SHIP_R;
  if (h === 1) for (const s of [-1, 1]) wing([[-R * .4, s * R * .8], [-R * 1.25, s * R * 1.25], [-R * .95, s * R * .45]], look.body[1]);
  if (h === 2) {
    for (const s of [-1, 1]) wing([[R * .2, s * R * .9], [-R * 1.0, s * R * 1.45], [-R * .8, s * R * .5]], look.body[1]);
    wing([[R * .7, -R * .45], [R * 1.75, 0], [R * .7, R * .45]], look.body[0]);
  }
  if (h === 3) {
    for (const s of [-1, 1]) {
      wing([[R * .5, s * R * .8], [-R * .6, s * R * 1.8], [-R * 1.15, s * R * 1.7], [-R * .8, s * R * .4]], look.body[1]);
      ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.roundRect(-R * 1.25, s * R * 1.1 - 16, R * .7, 32, 10); ctx.fill();
    }
    wing([[R * .7, -R * .5], [R * 1.85, 0], [R * .7, R * .5]], look.body[0]);
  }
  if (h === 4) {
    for (const s of [-1, 1]) {
      wing([[R * .7, s * R * .7], [-R * .2, s * R * 1.95], [-R * .9, s * R * 2.0], [-R * .7, s * R * .5]], look.body[1]);
      wing([[-R * .5, s * R * .6], [-R * 1.5, s * R * 1.2], [-R * 1.2, s * R * .3]], '#a16207');
    }
    wing([[R * .6, -R * .55], [R * 2.0, 0], [R * .6, R * .55]], look.body[0]);
    ctx.strokeStyle = `rgba(253,224,71,${0.5 + 0.3 * Math.sin(S.time * 4)})`; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(0, 0, R + 18, 0, 7); ctx.stroke();
  }
}
function drawShip() {
  const sh = S.ship, h = S.gear.hull, look = HULL_LOOK[h];
  ctx.save(); ctx.translate(sh.x, sh.y);
  // hajtómű-láng: az erősebb hajtóművel hosszabb és kékebb
  const sp = Math.hypot(sh.vx, sh.vy), eng = S.gear.engine;
  if (sp > 30) {
    ctx.save(); ctx.rotate(Math.atan2(sh.vy, sh.vx));
    const len = (sh.turbo > 0 ? 170 : 60 + eng * 20) * Math.min(1, sp / 300) + Math.random() * 20;
    const hot = sh.turbo > 0 || eng >= 2;
    const g = ctx.createLinearGradient(-SHIP_R, 0, -SHIP_R - len, 0);
    g.addColorStop(0, hot ? '#e0f2fe' : '#fde68a'); g.addColorStop(.4, hot ? '#38bdf8' : '#f97316'); g.addColorStop(1, 'rgba(249,115,22,0)');
    ctx.fillStyle = g;
    const flames = eng >= 3 ? [-28, 28] : [0];
    for (const off of flames) { ctx.beginPath(); ctx.moveTo(-SHIP_R + 10, off - 26); ctx.lineTo(-SHIP_R - len, off); ctx.lineTo(-SHIP_R + 10, off + 26); ctx.closePath(); ctx.fill(); }
    if (eng === 0 && Math.random() < .3) S.parts.push({ x: sh.x - Math.cos(sh.ang) * SHIP_R, y: sh.y - Math.sin(sh.ang) * SHIP_R, vx: rnd(-30, 30), vy: rnd(-30, 30), life: .7, color: '#57534e' });   // pöfög
    ctx.restore();
  }
  ctx.rotate(sh.ang);
  drawHullExtras(h, look);
  // test
  ctx.shadowColor = sh.flash > 0 ? '#f87171' : sh.glow > 0 ? '#fde047' : look.glow; ctx.shadowBlur = 40 + sh.glow * 60;
  const body = ctx.createRadialGradient(-20, -25, 10, 0, 0, SHIP_R);
  body.addColorStop(0, look.body[0]); body.addColorStop(1, sh.flash > 0 ? '#f87171' : look.body[1]);
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(0, 0, SHIP_R, 0, 7); ctx.fill();
  ctx.shadowBlur = 0;
  if (h === 0) {   // bádogteknő: szegecsek és foltok
    ctx.fillStyle = '#57534e';
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(a) * (SHIP_R - 6), Math.sin(a) * (SHIP_R - 6), 4, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#a16207'; ctx.fillRect(-60, -78, 30, 20); ctx.fillRect(40, 58, 26, 18);
  }
  ctx.fillStyle = look.nose;   // orr
  ctx.beginPath(); ctx.moveTo(SHIP_R + 26, 0); ctx.lineTo(SHIP_R - 8, -24); ctx.lineTo(SHIP_R - 8, 24); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(15,23,42,.55)';   // a belső tér
  ctx.beginPath(); ctx.arc(0, 0, SHIP_R - 14, 0, 7); ctx.fill();
  ctx.restore();
  // ágyúcsövek (világkoordinátában célozva): a fegyverrel együtt nőnek
  const wl = S.gear.weapon, barrelL = 50 + wl * 5, barrelW = 14 + wl * 1.5;
  for (const id of ['gun1', 'gun2']) {
    const [gx, gy] = stationWorld(id), g = S.guns[id], p = S.stations[id];
    ctx.save(); ctx.translate(gx, gy); ctx.rotate(g.aim);
    ctx.fillStyle = p ? PLAYERS[p].color : '#475569';
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 3;
    if (WEAPONS[wl].shots > 1 && WEAPONS[wl].par) for (const o of [-1, 1]) { ctx.beginPath(); ctx.roundRect(0, o * 8 - barrelW / 3, barrelL, barrelW / 1.5, 5); ctx.fill(); ctx.stroke(); }
    else { ctx.beginPath(); ctx.roundRect(0, -barrelW / 2, barrelL, barrelW, 6); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  }
  // rakétavető: vastag cső, benne a töltött rakéta orra; körülötte a töltődés íve
  {
    const [rx, ry] = stationWorld('rocket'), RK = S.rocket, p = S.stations.rocket;
    ctx.save(); ctx.translate(rx, ry); ctx.rotate(RK.aim);
    ctx.translate(-RK.kick * 40, 0);
    ctx.fillStyle = p ? PLAYERS[p].color : '#475569'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(0, -15, 62, 30, 8); ctx.fill(); ctx.stroke();
    if (RK.load >= 1) { ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(62, -9); ctx.lineTo(80, 0); ctx.lineTo(62, 9); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = RK.load >= 1 ? '#fde047' : 'rgba(253,224,71,.5)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(rx, ry, 32, -Math.PI / 2, -Math.PI / 2 + RK.load * Math.PI * 2); ctx.stroke();
  }
  // pajzs
  const SH = SHIELDS[S.gear.shield];
  if (SH.charge) {
    const full = S.shield.charge / SH.charge;
    ctx.save(); ctx.translate(sh.x, sh.y);
    ctx.strokeStyle = S.shield.flash > 0 ? '#ffffff' : `rgba(125,211,252,${0.25 + 0.5 * full})`;
    ctx.lineWidth = 4 + S.gear.shield * 2 + S.shield.flash * 20;
    ctx.setLineDash(S.shield.charge >= 1 ? [] : [10, 14]);
    ctx.beginPath(); ctx.arc(0, 0, shieldR(), 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = `rgba(125,211,252,${0.06 + 0.08 * full})`; ctx.beginPath(); ctx.arc(0, 0, shieldR(), 0, 7); ctx.fill();
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

// A nagy nyíl: a hajó körül mindig a következő gonosz felé mutat, és a képernyő szélén is, ha nem látszik.
function bossArrow() {
  const B = S.boss;
  if (!B) return;
  const sh = S.ship, a = Math.atan2(B.y - sh.y, B.x - sh.x), d = Math.hypot(B.x - sh.x, B.y - sh.y);
  const near = clamp01((1700 - d) / 1100);
  const col = near > .6 ? '#ef4444' : near > .2 ? '#f97316' : '#facc15';
  const pulse = 1 + 0.12 * Math.sin(S.time * (4 + near * 6));
  // a hajó körül (világkoordinátában)
  const rr = shieldR() + 55;
  ctx.save(); ctx.translate(sh.x + Math.cos(a) * rr, sh.y + Math.sin(a) * rr); ctx.rotate(a); ctx.scale(pulse, pulse);
  ctx.shadowColor = col; ctx.shadowBlur = 25;
  ctx.fillStyle = col; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(46, 0); ctx.lineTo(-6, -32); ctx.lineTo(-6, -13); ctx.lineTo(-34, -13); ctx.lineTo(-34, 13); ctx.lineTo(-6, 13); ctx.lineTo(-6, 32); ctx.closePath();
  ctx.fill(); ctx.stroke(); ctx.restore();
  return { a, d, col, near };
}
function edgeArrow(x, y, color, label) {   // ha a cél a képernyőn kívül van
  const sx = x - cam.x + W / 2, sy = y - cam.y + H / 2;
  if (sx > 0 && sx < W && sy > 0 && sy < H) return;
  const a = Math.atan2(sy - H / 2, sx - W / 2);
  const ex = W / 2 + Math.cos(a) * (W / 2 - 70), ey = H / 2 + Math.sin(a) * (H / 2 - 70);
  const px = Math.max(70, Math.min(W - 70, ex)), py = Math.max(180, Math.min(H - 150, ey));
  ctx.save(); ctx.translate(px, py); ctx.rotate(a);
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(40, 0); ctx.lineTo(-14, -28); ctx.lineTo(-14, 28); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.font = '800 26px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f8fafc';
  ctx.fillText(label, px - Math.cos(a) * 70, py - Math.sin(a) * 50);
}

function gearRow() {
  const g = S.gear;
  return [
    ['⚔️', WEAPONS[g.weapon]], ['🛡️', SHIELDS[g.shield]], ['🚀', ENGINES[g.engine]], ['🛸', HULLS[g.hull]],
  ];
}
function hud(arrow) {
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#facc15'; ctx.font = '900 44px system-ui'; ctx.textAlign = 'left';
  ctx.fillText('Becze Csillaghajó', 36, 66);
  ctx.fillStyle = '#94a3b8'; ctx.font = '600 24px system-ui';
  ctx.fillText(`v${VERSION}${net.mode === 'helyi' ? ' · helyi mód' : ''}`, 38, 100);
  ctx.font = '900 40px system-ui'; ctx.fillStyle = '#f8fafc';
  ctx.fillText(`${Math.min(S.level, LEVELS)}. szint / ${LEVELS}    ⭐ ${S.gold}    👾 ${S.kills}`, 36, 160);

  // felszerelés a jobb alsó sarokban
  const rows = gearRow();
  const bx = W - 400, by = H - 40 - rows.length * 46 - 20;
  ctx.fillStyle = 'rgba(15,23,42,.8)'; ctx.beginPath(); ctx.roundRect(bx, by, 370, rows.length * 46 + 30, 18); ctx.fill();
  rows.forEach(([cat, it], i) => {
    ctx.font = `30px ${EMOJI}`; ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
    ctx.fillText(cat, bx + 18, by + 50 + i * 46);
    ctx.font = '800 28px system-ui'; ctx.fillStyle = '#e2e8f0';
    ctx.fillText(it.name, bx + 66, by + 50 + i * 46);
  });

  // közeledés: piros szél és felirat
  if (arrow && arrow.near > 0.2) {
    const al = (arrow.near - 0.2) * 0.35 * (0.75 + 0.25 * Math.sin(S.time * 6));
    const v = ctx.createRadialGradient(W / 2, H / 2, H * .45, W / 2, H / 2, H * .95);
    v.addColorStop(0, 'rgba(239,68,68,0)'); v.addColorStop(1, `rgba(239,68,68,${al})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }
  if (S.boss) {
    ctx.textAlign = 'center'; ctx.font = '900 40px system-ui';
    const txt = arrow.near > .5 ? `⚠️ Itt van: ${S.boss.name}! Lőjétek!` : arrow.near > .1 ? `Közeledik: ${S.boss.name}…` : `A nyíl után: ${S.boss.name} (${Math.round(arrow.d / 100)} űrlépés)`;
    ctx.fillStyle = 'rgba(2,6,23,.6)'; const tw = ctx.measureText(txt).width;
    ctx.beginPath(); ctx.roundRect(W / 2 - tw / 2 - 24, 20, tw + 48, 64, 18); ctx.fill();
    ctx.fillStyle = arrow.col; ctx.fillText(txt, W / 2, 66);
  }

  // jutalom-felirat
  if (S.banner) {
    const b = S.banner, k = clamp01(b.t * 3), sc = 0.6 + 0.4 * k + 0.04 * Math.sin(S.time * 6);
    ctx.save(); ctx.translate(W / 2, H / 2 - 120); ctx.scale(sc, sc); ctx.globalAlpha = k;
    ctx.fillStyle = 'rgba(2,6,23,.82)'; ctx.beginPath(); ctx.roundRect(-640, -110, 1280, 230, 34); ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = '#facc15'; ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillStyle = '#facc15'; ctx.font = '900 64px system-ui';
    ctx.fillText(S.phase === 'won' ? '👑 Megmentettétek a csillagködöt! 👑' : `🎉 ${b.title}`, 0, -20);
    ctx.fillStyle = '#f8fafc'; ctx.font = '800 46px system-ui';
    ctx.fillText(S.phase === 'won' ? 'Mind a 20 gonoszt legyőztétek. Jöhet a következő kör!' : b.sub, 0, 70);
    ctx.restore();
  }

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
  const size = big ? 420 : 170;
  const qx = big ? W / 2 - size / 2 : W - size - 30, qy = big ? H / 2 - size / 2 - 40 : 110;
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
  // a kamera a hajót követi; ha közel a gonosz, kicsit felé húzódik, hogy mindketten látsszanak
  let tx = S.ship.x, ty = S.ship.y;
  if (S.boss && S.boss.scary > .3) { const k = 0.35 * S.boss.scary; tx += (S.boss.x - S.ship.x) * k; ty += (S.boss.y - S.ship.y) * k; }
  cam.x += (tx - cam.x) * 0.1; cam.y += (ty - cam.y) * 0.1;
  ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, W, H);
  const neb = ctx.createRadialGradient(W * .7 - cam.x * .05 % W, H * .3, 50, W * .7, H * .3, 900);
  neb.addColorStop(0, 'rgba(126,34,206,.25)'); neb.addColorStop(1, 'rgba(2,6,23,0)');
  ctx.fillStyle = neb; ctx.fillRect(0, 0, W, H);
  bgStars();
  const sk = S.shake * 40;
  ctx.save(); ctx.translate(W / 2 - cam.x + rnd(-sk, sk), H / 2 - cam.y + rnd(-sk, sk));
  for (const st of S.stars) drawStar(st);
  for (const r of S.rocks) drawRock(r);
  if (S.boss) drawBoss(S.boss);
  for (const m of S.minions) drawMinion(m);
  for (const s of S.spits) drawSpit(s);
  for (const b of S.bullets) drawBullet(b);
  // rakéták és robbanások
  for (const r of S.rockets) {
    ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.a);
    ctx.fillStyle = '#e2e8f0'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(-24, -9, 40, 18, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(16, -9); ctx.lineTo(32, 0); ctx.lineTo(16, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = r.color; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-24, s * 9); ctx.lineTo(-34, s * 20); ctx.lineTo(-14, s * 9); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = `rgba(251,146,60,${0.6 + 0.4 * Math.random()})`; ctx.beginPath(); ctx.moveTo(-24, -6); ctx.lineTo(-44 - Math.random() * 18, 0); ctx.lineTo(-24, 6); ctx.fill();
    ctx.restore();
  }
  S.booms = (S.booms || []).filter((b) => (b.t += 1 / 60) < 0.5);
  for (const b of S.booms) {
    const k = b.t / 0.5;
    ctx.fillStyle = `rgba(253,224,71,${0.5 * (1 - k)})`; ctx.beginPath(); ctx.arc(b.x, b.y, ROCKET.radius * (0.4 + k), 0, 7); ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 8 * (1 - k) + 1; ctx.beginPath(); ctx.arc(b.x, b.y, ROCKET.radius * (0.5 + k * 0.9), 0, 7); ctx.stroke();
  }
  drawShip();
  if (S.boss) drawBossLabel(S.boss);
  const arrow = bossArrow();
  for (const q of S.parts) { ctx.globalAlpha = Math.max(0, q.life); ctx.fillStyle = q.color; ctx.fillRect(q.x - 4, q.y - 4, 8, 8); }
  ctx.globalAlpha = 1;
  ctx.restore();
  if (S.boss) edgeArrow(S.boss.x, S.boss.y, arrow.col, '👾');
  hud(arrow);
}

// ---------- állapot a telefonoknak ----------
function broadcast() {
  const B = S.boss;
  net.send({
    version: VERSION, beat: Math.floor(Date.now() / 2000),
    stations: S.stations,
    players: Object.fromEntries(PLAYER_IDS.filter((p) => S.players[p].joined).map((p) => [p, S.players[p].st])),
    ack: Object.fromEntries(PLAYER_IDS.filter((p) => S.players[p].joined).map((p) => [p, S.players[p].s])),
    gold: S.gold, score: S.kills, hits: S.hits, rocket: Math.round(S.rocket.load * 20) / 20,
    level: Math.min(S.level, LEVELS), levels: LEVELS,
    boss: B ? { name: B.name, pct: Math.max(0, Math.round(B.hp / B.max * 100)), near: Math.round(B.scary * 100) / 100 } : null,
    gear: { weapon: WEAPONS[S.gear.weapon].name, shield: SHIELDS[S.gear.shield].name, engine: ENGINES[S.gear.engine].name, hull: HULLS[S.gear.hull].name },
    banner: S.banner ? (S.phase === 'won' ? 'Megmentettétek a csillagködöt!' : S.banner.sub) : '',
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
// próbához a konzolból: __ship.win() legyőzi a mostani gonoszt, __ship.go(12) a 12. szintre ugrik
window.__ship = {
  S, step: (sec) => { for (let i = 0; i < sec / STEP; i++) update(STEP); },
  win: () => { if (S.boss) { S.boss.hp = 0; defeatBoss(); } },
  go: (L) => { S.banner = null; startLevel(L); },
  near: () => { if (S.boss) { S.ship.x = S.boss.x - S.boss.r - 350; S.ship.y = S.boss.y; } },
};

addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') { document.fullscreenElement ? document.exitFullscreen() : cv.requestFullscreen?.(); }
});
