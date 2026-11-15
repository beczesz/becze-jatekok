// Várvédők: a kivetítő. Ez a játék "agya": itt fut a szimuláció, a telefonok csak parancsot küldenek.
import { connectScreen } from './transport.js';
import {
  PLAYERS, PLAYER_IDS, EASE, SLOTS, MAX_WAVE, START_GOLD, WAVE_BONUS, FLAWLESS_BONUS, GIFT, BOLT_WINDOW,
  castleHp, boltMax, treasuryNeed, TREASURY_HP, HP_PER_JOIN, MEDALS,
  CROSS_BONUS, CROSS_GOLD, SOS_TIME, SOS_COOLDOWN, BOSS_HOP,
  ROLES, defaultRole, towerCost, LEVEL_LOOK, COMBO, RAGE, MAX_LEVEL, fmtGold, VERSION, NUKE,
  TOWERS, ENEMIES, towerStats, upgradeCost, wavePlan,
} from './rules.js';

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
let net;
try { net = await connectScreen(); }
catch (e) {
  ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, 1920, 1080);
  ctx.fillStyle = '#fca5a5'; ctx.font = '700 48px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('Nem sikerült csatlakozni a Firebase-hez. Van internet?', 960, 500);
  ctx.fillStyle = '#94a3b8'; ctx.font = '500 32px system-ui';
  ctx.fillText('Próba mód internet nélkül: screen.html?helyi=1', 960, 570);
  throw e;
}

// A telefonok címe: ugyanez a mappa, phone.html, a szobakóddal.
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
    q.fillStyle = '#0f172a';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) q.fillRect((c + pad) * cell, (r + pad) * cell, cell, cell);
  };
  document.head.appendChild(s);
})();

const W = 1920, H = 1080, TOP = 150, FIELD_H = H - TOP;
const CASTLE_X = 230, SLOT_X0 = 300, SLOT_W = 150, SPAWN_X = 1880;
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const LANES = PLAYER_IDS;
const NET_IMMUNE = 2.5;   // mp, amíg a hálóból kiszabadult szörny nem fogható újra

// Elrendezés: a csatlakozott játékosok sávjai, legalább 3 (3 sávnál 310 px, 5 sávnál 186 px magas).
let LAYOUT = { order: [1, 2, 3], laneH: FIELD_H / 3 };
function relayout() {
  const shown = LANES.filter((p) => S.players[p].joined);
  for (const p of LANES) if (shown.length < 3 && !shown.includes(p)) shown.push(p);
  shown.sort((a, b) => a - b);
  LAYOUT = { order: shown, laneH: FIELD_H / shown.length };
}
const K = () => Math.min(1, LAYOUT.laneH / 300);       // rajz-méretarány
const laneY = (l) => TOP + LAYOUT.order.indexOf(l) * LAYOUT.laneH + LAYOUT.laneH / 2;
const laneDist = (a, b) => Math.abs(LAYOUT.order.indexOf(a) - LAYOUT.order.indexOf(b));
const slotX = (i) => SLOT_X0 + i * SLOT_W + SLOT_W / 2;

let S;
let idSeq = 1;

const freshStats = () => ({ kills: 0, given: 0, help: 0, built: 0, mined: 0 });
function freshPlayers(old) {
  const o = {};
  for (const p of LANES) {
    o[p] = {
      joined: old ? old[p].joined : false, lastSeen: old ? old[p].lastSeen : 0,
      ease: old ? old[p].ease : 'normal', role: old ? old[p].role : defaultRole(p),
      gold: START_GOLD, ready: false, stats: freshStats(), nukes: 0,
    };
  }
  return o;
}

function newGame(keepPlayers) {
  const players = freshPlayers(keepPlayers ? S.players : null);
  S = {
    phase: 'lobby', wave: 0, hp: 20, maxHp: 20,
    players,
    towers: Object.fromEntries(LANES.map((p) => [p, Array(SLOTS).fill(null)])),
    enemies: [], shots: [], floats: [], parts: [],
    queue: [], interval: 2, hpMult: 1, next: null, theme: '', waveHpStart: 0,
    treasury: 0, tLevel: 0, medals: null, rage: 0, endless: false,
    sos: {}, sosCd: {},   // segélykérés: sávonként hátralévő idő, játékosonként várakozás
    countdown: 0, bolt: 0, boltPressed: {}, boltT: 0, cheer: 0, cheerText: '',
    flash: 0, flashColor: '#fff', shake: 0, t: 0,
  };
  relayout();
}
newGame(false);

const now = () => performance.now();
const isConnected = (p) => S.players[p].joined && now() - S.players[p].lastSeen < 6000;
const joinedLanes = () => LANES.filter((p) => S.players[p].joined);
const connectedLanes = () => LANES.filter(isConnected);
const BOLT = () => boltMax(joinedLanes().length);
const NEED = () => treasuryNeed(joinedLanes().length, S.tLevel);

// ---------- hang ----------
let audio = null;
function initAudio() { if (!audio) { try { audio = new AudioContext(); } catch (e) { audio = null; } } }
addEventListener('pointerdown', initAudio);
function beep(freq, dur = 0.12, type = 'sine', vol = 0.15, slide = 0) {
  if (!audio) return;
  const t = audio.currentTime;
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(audio.destination); o.start(t); o.stop(t + dur);
}
const sfx = {
  build: () => { beep(520, 0.1, 'triangle'); setTimeout(() => beep(780, 0.12, 'triangle'), 80); },
  pop: () => beep(300 + Math.random() * 200, 0.08, 'square', 0.05, -150),
  hit: () => beep(140, 0.3, 'sawtooth', 0.15, -80),
  wave: () => { beep(392, 0.15, 'square', 0.1); setTimeout(() => beep(523, 0.25, 'square', 0.1), 150); },
  join: () => beep(660, 0.15, 'triangle', 0.12, 200),
  bolt: () => { beep(1200, 0.5, 'sawtooth', 0.2, -1100); },
  nuke: () => { beep(90, 1.6, 'sawtooth', 0.35, -60); beep(60, 2.0, 'square', 0.25, -30); setTimeout(() => beep(200, 0.8, 'triangle', 0.15, -150), 300); },
  sos: () => [880, 660, 880, 660].forEach((f, i) => setTimeout(() => beep(f, 0.12, 'square', 0.08), i * 130)),
  team: () => [660, 990].forEach((f, i) => setTimeout(() => beep(f, 0.1, 'triangle', 0.08), i * 70)),
  coin: () => beep(988, 0.08, 'triangle', 0.08),
  pig: () => [700, 900].forEach((f, i) => setTimeout(() => beep(f, 0.08, 'square', 0.05), i * 90)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.25, 'triangle', 0.15), i * 160)),
  lose: () => [392, 330, 262].forEach((f, i) => setTimeout(() => beep(f, 0.3, 'triangle', 0.15), i * 200)),
};

// ---------- segédek ----------
function addFloat(x, y, text, color = '#fde047', size = 40) {
  S.floats.push({ x, y, text, color, size, t: 0 });
}
function burst(x, y, color, n = 10) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = 100 + Math.random() * 250;
    S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.5 + Math.random() * 0.3, color });
  }
}
function cheer(text) { S.cheer = 2.8; S.cheerText = text; }

// ---------- fázisok ----------
function planNext() { S.next = wavePlan(S.wave + 1, joinedLanes(), S.rage); }

// Családi rekord (a végtelen módban elért legmagasabb hullám), a kivetítő böngészőjében tárolva
const RECORD_KEY = 'varvedok-rekord';
let record = 0;
try { record = Number(localStorage.getItem(RECORD_KEY)) || 0; } catch (e) { /* privát mód */ }
function saveRecord(w) {
  if (w <= record) return false;
  record = w;
  try { localStorage.setItem(RECORD_KEY, String(w)); } catch (e) { /* privát mód */ }
  return true;
}

function startBuild() {
  if (S.phase === 'lobby') { S.maxHp = castleHp(joinedLanes().length); S.hp = S.maxHp; }
  S.phase = 'build';
  S.countdown = S.wave === 0 ? 30 : 20;
  for (const p of LANES) S.players[p].ready = false;
  planNext();
}

function startWave() {
  S.wave++;
  if (!S.next) planNext();
  const { plan, elite, interval, hpMult, theme } = S.next;
  S.queue = Object.keys(plan).map((l) => ({ lane: Number(l), list: plan[l], elite: [...(elite[l] || [])], t: 0.5 + Math.random() }));
  S.interval = interval; S.hpMult = hpMult; S.theme = theme;
  S.next = null;
  S.waveHpStart = S.hp;
  S.phase = 'wave';
  sfx.wave();
}

function waveDone() {
  const flawless = S.hp >= S.waveHpStart;
  for (const p of joinedLanes()) {
    const bonus = WAVE_BONUS + (flawless ? FLAWLESS_BONUS : 0);
    S.players[p].gold += bonus;
    addFloat(slotX(0), laneY(p) - 90 * K(), `+${bonus} jutalom`, '#fde047', 44 * K());
  }
  // alkalmazkodó nehézség: jól ment, dühösebbek lesznek; nehéz volt, csillapodnak
  const lost = S.waveHpStart - S.hp;
  // két hibátlan hullám egymás után kell, hogy a düh nőjön
  S.flawStreak = flawless ? (S.flawStreak || 0) + 1 : 0;
  if (S.flawStreak >= 2) { S.rage++; S.flawStreak = 0; }
  else if (lost >= S.maxHp * RAGE.calmLoss) S.rage = Math.max(0, S.rage - 1);
  if (S.endless && saveRecord(S.wave)) cheer(`Új családi rekord: ${S.wave}. hullám! 🏆`);
  if (S.wave === MAX_WAVE && !S.endless) { S.phase = 'win'; S.medals = awardMedals(); sfx.win(); return; }
  if (flawless && !S.cheer) cheer(S.flawStreak === 0 && S.rage > 0 ? `Hibátlan! A szörnyek dühösebbek 🔥${S.rage}` : 'Hibátlan hullám! ⭐');
  if (flawless) sfx.win();
  startBuild();
}

// Győzelem után: tovább a végtelenbe, ugyanazokkal a tornyokkal
function goEndless() {
  S.endless = true; S.medals = null;
  startBuild();
  cheer('♾️ Végtelen mód! Meddig bírjátok?');
}

// Vereség után a hullám elölről indul; a közben szerzett arany és tornyok MEGMARADNAK, így minden újrapróba erősebb.
function retry() {
  S.wave = Math.max(0, S.wave - 1);
  S.rage = Math.max(0, S.rage - 1);   // vereség után csillapodnak
  S.maxHp = castleHp(joinedLanes().length) + S.tLevel * TREASURY_HP;
  S.hp = S.maxHp;
  S.enemies = []; S.shots = []; S.queue = []; S.boltPressed = {};
  startBuild();
  S.countdown = 15;
}

function awardMedals() {
  const players = joinedLanes();
  const got = {};
  for (const m of MEDALS) {
    const free = players.filter((p) => !got[p]);
    if (!free.length) break;
    free.sort((a, b) => S.players[b].stats[m.key] - S.players[a].stats[m.key]);
    got[free[0]] = m;
  }
  return players.map((p) => ({ p, ...got[p] }));
}

function addTreasury(amount) {
  S.treasury += amount;
  while (S.treasury >= NEED()) {
    S.treasury -= NEED();
    S.tLevel++;
    S.maxHp += TREASURY_HP; S.hp += TREASURY_HP;
    S.flash = 0.8; S.flashColor = '#fde047';
    cheer(`Erősebb lett a vár! ${S.tLevel}. szint 🚩`);
    burst(120, TOP + 80, '#fde047', 40);
    sfx.win();
  }
}

// ---------- telefonok parancsai ----------
net.on((m) => {
  if (!m || m.kind !== 'in') return;
  const p = m.p, P = S.players[p];
  if (!P) return;
  P.lastSeen = now();
  switch (m.type) {
    case 'hello':
      if (EASE[m.ease]) P.ease = m.ease;
      if (ROLES[m.role]) P.role = m.role;
      if (!P.joined) {
        P.joined = true;
        relayout();
        if (S.phase !== 'lobby') { S.maxHp += HP_PER_JOIN; S.hp += HP_PER_JOIN; }
        if (S.phase === 'build') planNext();
        sfx.join(); addFloat(140, laneY(p), 'Megjött!', PLAYERS[p].color, 40);
      }
      break;
    case 'start':
      if (S.phase === 'lobby') startBuild();
      break;
    case 'build': {
      if (!['build', 'wave'].includes(S.phase)) break;
      const t = TOWERS[m.tower];
      if (!t || m.slot < 0 || m.slot >= SLOTS || S.towers[p][m.slot]) break;
      const cost = towerCost(m.tower, P.role);
      if (P.gold < cost) break;
      P.gold -= cost; P.stats.built += cost;
      S.towers[p][m.slot] = { type: m.tower, lvl: 1, cd: 0.3, pulse: 1 };
      sfx.build(); burst(slotX(m.slot), laneY(p), PLAYERS[p].color, 14);
      addFloat(slotX(m.slot), laneY(p) - 70 * K(), `-${cost}`, '#fde047', 36);
      break;
    }
    case 'upgrade': {
      // fejleszteni bárki sávjában lehet, a saját aranyából: így tudnak segíteni egymásnak
      if (!['build', 'wave'].includes(S.phase)) break;
      const lane = m.lane || p;
      if (!S.players[lane]?.joined) break;
      const tw = S.towers[lane][m.slot];
      if (!tw) break;
      const cost = upgradeCost(tw.type, tw.lvl, S.players[lane].role);  // az ár a torony gazdájának szerepe szerint
      if (cost == null || P.gold < cost) break;
      P.gold -= cost; P.stats.built += cost; tw.lvl++; tw.pulse = 1;
      if (lane !== p) P.stats.help++;
      sfx.build(); if (tw.lvl === 5) sfx.win();
      burst(slotX(m.slot), laneY(lane), tw.lvl === 5 ? '#f0abfc' : PLAYERS[p].color, 14 + tw.lvl * 6);
      const look = LEVEL_LOOK[tw.lvl].name;
      addFloat(slotX(m.slot), laneY(lane) - 70 * K(), lane === p ? `${look}!` : `${look}! ${PLAYERS[p].icon} segített`, lane === p ? '#fde047' : PLAYERS[p].color, 36);
      break;
    }
    case 'gift': {
      if (P.gold < GIFT) break;
      if (m.to === 0) {  // a vár kincstárába
        P.gold -= GIFT; P.stats.given += GIFT;
        sfx.coin();
        addFloat(120, TOP + 60, `+${GIFT} 🏰 ${PLAYERS[p].icon}`, PLAYERS[p].color, 38);
        addTreasury(GIFT);
        break;
      }
      const Q = S.players[m.to];
      if (!Q || !Q.joined || m.to === p) break;
      P.gold -= GIFT; Q.gold += GIFT; P.stats.given += GIFT;
      sfx.coin();
      addFloat(120, laneY(m.to) - 60 * K(), `+${GIFT} 🎁 ${PLAYERS[p].icon}`, PLAYERS[p].color, 38);
      break;
    }
    case 'ready':
      if (S.phase === 'build') P.ready = true;
      break;
    case 'buynuke':
      // atombomba vásárlása a saját aranyból, tartalékba
      if (P.joined && P.gold >= NUKE.cost && P.nukes < NUKE.max && S.phase !== 'lobby') {
        P.gold -= NUKE.cost; P.nukes++; P.stats.built += NUKE.cost;
        sfx.coin(); addFloat(slotX(2), laneY(p) - 60 * K(), `☢️ +1 atombomba ${PLAYERS[p].icon}`, '#fde047', 38);
      }
      break;
    case 'nuke': {
      // ledobás egy sávra (a sajátjára vagy egy testvérére): ott minden szörny elpusztul, a sárkány fél életet veszít
      const lane = m.lane || p;
      if (S.phase !== 'wave' || P.nukes < 1 || !S.players[lane]?.joined) break;
      P.nukes--;
      dropNuke(lane, p);
      break;
    }
    case 'sos':
      // segélykérés: mindenki tornya ezt a sávot célozza, és eggyel messzebbre lő
      if (S.phase === 'wave' && !(S.sosCd[p] > 0)) {
        S.sos[p] = SOS_TIME; S.sosCd[p] = SOS_COOLDOWN;
        sfx.sos(); cheer(`🆘 ${PLAYERS[p].icon} ${PLAYERS[p].name} segítséget kér!`);
      }
      break;
    case 'bolt':
      if (S.phase === 'wave' && S.bolt >= BOLT()) { S.boltPressed[p] = true; S.boltT = BOLT_WINDOW; checkBolt(); }
      break;
    case 'restart':
      if (S.phase === 'lose') retry();
      else if (S.phase === 'win') newGame(true);
      break;
    case 'endless':
      if (S.phase === 'win') goEndless();
      break;
  }
  broadcast();
});

function dropNuke(lane, by) {
  let killed = 0;
  for (const e of S.enemies) {
    if (e.dead || e.lane !== lane) continue;
    if (e.type === 'boss') { e.hp -= e.max * NUKE.bossShare; e.hurt = 0.6; if (e.hp <= 0) { e.hp = 1; } continue; }
    e.dead = true; killed++;
    burst(e.x, e.y, '#f97316', 6);
  }
  if (lane !== by) S.players[by].stats.help += 3;
  // gombafelhő a sáv mentén
  for (let x = SLOT_X0; x < W; x += 140) burst(x, laneY(lane), ['#f97316', '#facc15', '#ef4444'][Math.floor(Math.random() * 3)], 14);
  S.nukeFx = { lane, t: 1.6 };
  S.flash = 1; S.flashColor = '#fdba74'; S.shake = 1.2;
  sfx.nuke();
  cheer(`☢️ ${PLAYERS[by].icon} ATOMBOMBA${lane !== by ? ' ' + PLAYERS[lane].icon + ' sávjára' : ''}! (${killed} szörny)`);
}

function checkBolt() {
  const need = connectedLanes();
  if (!need.length || !need.every((p) => S.boltPressed[p])) return;
  // a villám minden szörny életének egy részét viszi el (a vár szintjével kicsit többet, legfeljebb 70%-ot), a sárkányét kevésbé
  const share = Math.min(0.5, 0.35 + 0.03 * S.tLevel);
  for (const e of S.enemies) damage(e, e.max * (e.type === 'boss' ? share / 3 : share), 'bolt');
  S.bolt = 0; S.boltPressed = {}; S.boltT = 0;
  S.flash = 1; S.flashColor = '#e0f2fe'; S.shake = 0.5;
  sfx.bolt();
}

// ---------- billentyű a kivetítőn ----------
addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (S.phase === 'lobby') startBuild();
    else if (S.phase === 'build') S.countdown = 0;
    else if (S.phase === 'lose') retry();
    else if (S.phase === 'win') goEndless();
  }
  if ((e.key === 'n' || e.key === 'N') && S.phase === 'win') newGame(true);
  if (e.key === 'f' || e.key === 'F') {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.();
  }
});

// ---------- szimuláció ----------
// owner: kinek a tornya lőtt (a villámnál nincs). Az arany a lövőé; ha más sávjában talál, az segítség.
function damage(e, dmg, src, owner) {
  if (e.dead) return;
  const armor = ENEMIES[e.type].armor;
  if (armor && (src === 'archer' || src === 'ice' || src === 'net')) dmg *= armor;
  // kombók: a csapdamester előkészít, a vadász lecsap
  let combo = false;
  if (src === 'archer' && e.slowT > 0) { dmg *= COMBO.archerOnSlowed; combo = true; }
  if (src === 'cannon' && e.netT > 0) { dmg *= COMBO.cannonOnNetted; combo = true; }
  if (combo && Math.random() < 0.15) addFloat(e.x, e.y - 70 * K(), 'Kombó! 💥', '#fdba74', 30);
  if (owner) e.hitBy.add(owner);
  const cross = e.hitBy.size >= 2;
  if (cross) dmg *= CROSS_BONUS;
  e.hp -= dmg;
  e.hurt = 0.15;
  if (e.hp <= 0) {
    e.dead = true;
    const killer = owner || e.lane;
    const P = S.players[killer];
    P.gold += e.gold; P.stats.kills++;
    if (killer !== e.lane) P.stats.help++;
    S.bolt = Math.min(BOLT(), S.bolt + 1);
    if (cross) {
      for (const h of e.hitBy) if (S.players[h]?.joined) { S.players[h].gold += CROSS_GOLD; S.players[h].stats.help++; }
      addFloat(e.x, e.y - 95 * K(), `🤝 +${CROSS_GOLD}`, '#a7f3d0', 34);
      sfx.team();
    }
    addFloat(e.x, e.y - 50 * K(), `+${e.gold}`, PLAYERS[killer].soft, e.type === 'pig' ? 48 : 34);
    burst(e.x, e.y, e.type === 'boss' ? '#f97316' : e.type === 'pig' ? '#fde047' : '#a3e635', e.type === 'boss' ? 40 : e.type === 'pig' ? 24 : 10);
    if (e.type === 'pig') sfx.coin(); else sfx.pop();
  }
}

// Kristály-erősítés: a saját sávban a két szomszéd helyre, a szomszéd sávokban az előtte, mellette és mögötte lévő helyre.
// Több kristály összeadódik, legfeljebb +100%.
function crystalBuffs() {
  const B = {}, links = [];
  for (const p of LANES) B[p] = Array(SLOTS).fill(0);
  for (const p of LAYOUT.order) S.towers[p].forEach((tw, i) => {
    if (!tw || tw.type !== 'crystal') return;
    const b = towerStats('crystal', tw.lvl, S.players[p].role).buff;
    for (const q of LAYOUT.order) {
      if (laneDist(p, q) > 1) continue;
      for (let j = Math.max(0, i - 1); j <= Math.min(SLOTS - 1, i + 1); j++) {
        if (q === p && j === i) continue;
        B[q][j] = Math.min(1, B[q][j] + b);
        const t = S.towers[q][j];
        if (t && t.type !== 'crystal' && t.type !== 'mine') links.push([p, i, q, j]);
      }
    }
  });
  B.links = links;
  return B;
}

function spawn(lane, type, elite = false) {
  const d = ENEMIES[type];
  const boss = type === 'boss';
  const hp = d.hp * S.hpMult * EASE[S.players[lane].ease].mult * (elite ? RAGE.eliteHp : 1);
  const e = {
    id: idSeq++, type, lane, x: SPAWN_X, yOff: boss ? 0 : (Math.random() - 0.5) * 0.23, elite,
    hp, max: hp, speed: d.speed * (0.9 + Math.random() * 0.2), gold: d.gold * (elite ? RAGE.eliteGold : 1), hit: d.hit, size: d.size * (elite ? 1.15 : 1),
    slowT: 0, slowF: 1, hurt: 0, wob: Math.random() * 6,
    hitBy: new Set(), yShift: 0, netT: 0, hopT: boss ? BOSS_HOP[0] + Math.random() * (BOSS_HOP[1] - BOSS_HOP[0]) : 0,
  };
  e.y = laneY(lane) + e.yOff * LAYOUT.laneH;
  S.enemies.push(e);
}

function update(dt) {
  S.t += dt;
  S.flash = Math.max(0, S.flash - dt * 2);
  S.shake = Math.max(0, S.shake - dt);
  S.cheer = Math.max(0, S.cheer - dt);
  if (S.nukeFx) { S.nukeFx.t -= dt; if (S.nukeFx.t <= 0) S.nukeFx = null; }
  for (const e of S.enemies) {
    e.yShift *= Math.exp(-3 * dt);   // sávváltásnál simán úszik át
    e.y = laneY(e.lane) + e.yOff * LAYOUT.laneH + e.yShift;
  }
  for (const p of Object.keys(S.sos)) { S.sos[p] -= dt; if (S.sos[p] <= 0) delete S.sos[p]; }
  for (const p of Object.keys(S.sosCd)) { S.sosCd[p] -= dt; if (S.sosCd[p] <= 0) delete S.sosCd[p]; }

  if (S.phase === 'build') {
    S.countdown -= dt;
    const conn = connectedLanes();
    const allReady = conn.length > 0 && conn.every((p) => S.players[p].ready);
    if (S.countdown <= 0 || allReady) startWave();
  }

  if (S.phase === 'wave') {
    for (const q of S.queue) {
      if (!q.list.length) continue;
      q.t -= dt;
      if (q.t <= 0) { spawn(q.lane, q.list.shift(), q.elite.shift()); q.t = S.interval * (0.7 + Math.random() * 0.6); }
    }
    if (S.boltT > 0) { S.boltT -= dt; if (S.boltT <= 0) S.boltPressed = {}; }
  }

  if (S.phase === 'wave' || S.phase === 'build') {
    S.buffs = crystalBuffs();
    // tornyok
    for (const p of LANES) {
      S.towers[p].forEach((tw, i) => {
        if (!tw) return;
        tw.pulse = Math.max(0, (tw.pulse || 0) - dt * 2);
        const st = towerStats(tw.type, tw.lvl, S.players[p].role);
        if (tw.type === 'crystal') return;  // a kristály nem lő, csak erősít
        const b = S.buffs[p][i];
        if (b) { st.dmg *= 1 + b; st.rate /= 1 + b * 0.5; }
        const tx = slotX(i), ty = laneY(p);
        tw.cd -= dt;
        if (tw.type === 'mine') {
          if (S.phase !== 'wave') return;
          if (tw.cd <= 0) {
            tw.cd = st.every;
            S.players[p].gold += st.income; S.players[p].stats.mined += st.income;
            addFloat(tx, ty - 60 * K(), `+${st.income}`, '#fde047', 32);
            tw.pulse = 1;
          }
          return;
        }
        if (tw.cd > 0) return;
        // Célpont: a saját sáv és a szomszédok (reach), segélykérő sávba eggyel messzebbre is.
        // Sorrend: segélykérő sáv, utána a saját, utána a szomszéd; azon belül a várhoz legközelebbi.
        // a 8. szinten egyszerre két célpontra lő: a két legjobbat választjuk
        let target = null, best = Infinity, second = null, best2 = Infinity;
        for (const e of S.enemies) {
          if (e.dead) continue;
          if (e.x < tx - 40 || e.x - tx > st.range) continue;
          const d = laneDist(e.lane, p), sos = S.sos[e.lane] > 0;
          if (d > st.reach + (sos ? 1 : 0)) continue;
          let score = (sos ? 0 : d === 0 ? 1 : 2) * 10000 + e.x;
          if (tw.type === 'ice' && (ENEMIES[e.type].noSlow || e.slowT > 0)) score += 5000; // a jég a még lassíthatót keresi
          if (tw.type === 'net' && (e.netT > 0 || e.netImmune > 0)) score += 5000;          // a háló a még megfoghatót
          if (score < best) { second = target; best2 = best; best = score; target = e; }
          else if (score < best2) { best2 = score; second = e; }
        }
        if (target) {
          tw.cd = st.rate;
          S.shots.push({ x: tx + 20, y: ty - 20 * K(), target, type: tw.type, st, lane: target.lane, owner: p });
          if (st.double && second) S.shots.push({ x: tx - 10, y: ty + 10 * K(), target: second, type: tw.type, st, lane: second.lane, owner: p });
        }
      });
    }

    // lövedékek
    for (const s of S.shots) {
      const e = s.target;
      if (e.dead) { s.gone = true; continue; }
      const dx = e.x - s.x, dy = e.y - s.y, d = Math.hypot(dx, dy);
      const step = 1300 * dt;
      if (d <= step + 10) {
        s.gone = true;
        if (s.type === 'cannon') {
          for (const o of S.enemies) if (o.lane === e.lane && Math.abs(o.x - e.x) < s.st.splash) damage(o, s.st.dmg, 'cannon', s.owner);
          burst(e.x, e.y, '#fb923c', 12);
        } else {
          if (s.type === 'ice' && !ENEMIES[e.type].noSlow) { e.slowT = s.st.slowTime; e.slowF = s.st.slow; }
          // háló: a kiszabadult szörnyet 2,5 mp-ig nem lehet újra megfogni (különben a sok háló örökre fogva tartaná)
          if (s.type === 'net' && !(e.netImmune > 0)) e.netT = Math.max(e.netT, s.st.root * (e.type === 'boss' ? 0.3 : 1));
          damage(e, s.st.dmg, s.type, s.owner);
        }
      } else { s.vx = (dx / d) * 1300; s.vy = (dy / d) * 1300; s.x += (dx / d) * step; s.y += (dy / d) * step; }
    }
    S.shots = S.shots.filter((s) => !s.gone);

    // szörnyek
    for (const e of S.enemies) {
      if (e.dead) continue;
      e.slowT = Math.max(0, e.slowT - dt);
      e.hurt = Math.max(0, e.hurt - dt);
      // a sárkány időnként szomszéd sávba vált: mindenkinek együtt kell lőnie rá
      if (e.type === 'boss' && LAYOUT.order.length > 1) {
        e.hopT -= dt;
        if (e.hopT <= 0) {
          const opts = joinedLanes().filter((l) => laneDist(l, e.lane) === 1);
          if (opts.length) {
            const to = opts[Math.floor(Math.random() * opts.length)];
            e.yShift += laneY(e.lane) - laneY(to);
            e.lane = to;
            addFloat(e.x, laneY(to) - 90 * K(), `🐲 → ${PLAYERS[to].icon}`, PLAYERS[to].color, 40);
          }
          e.hopT = BOSS_HOP[0] + Math.random() * (BOSS_HOP[1] - BOSS_HOP[0]);
        }
      }
      if (e.netT > 0) { e.netT -= dt; if (e.netT <= 0) { e.netT = 0; e.netImmune = NET_IMMUNE; } }   // hálóban: áll
      else { e.netImmune = Math.max(0, (e.netImmune || 0) - dt); e.x -= e.speed * (e.slowT > 0 ? e.slowF : 1) * dt; }
      if (e.x <= CASTLE_X) {
        e.dead = true; e.escaped = true;
        if (e.hit > 0) {
          S.hp -= e.hit;
          S.flash = 0.6; S.flashColor = '#ef4444'; S.shake = 0.35;
          sfx.hit();
          addFloat(CASTLE_X, e.y - 40 * K(), `-${e.hit} ❤️`, '#fca5a5', 40);
        } else {
          sfx.pig();
          addFloat(CASTLE_X + 60, e.y - 40 * K(), 'Elszaladt! 🐷', '#fbcfe8', 34);
        }
      }
    }
    S.enemies = S.enemies.filter((e) => !e.dead);

    if (S.hp <= 0 && S.phase === 'wave') { S.hp = 0; S.phase = 'lose'; sfx.lose(); }
    else if (S.phase === 'wave' && S.queue.every((q) => !q.list.length) && !S.enemies.length) waveDone();
  }

  for (const f of S.floats) { f.t += dt; f.y -= 50 * dt; }
  S.floats = S.floats.filter((f) => f.t < 1.4);
  for (const q of S.parts) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 400 * dt; }
  S.parts = S.parts.filter((q) => q.t < q.life);
}

// ---------- állapot a telefonoknak ----------
function nextIcons() {
  // a következő hullám szörnyfajtái sávonként (építés alatt), különben üres
  const out = {};
  if (S.phase !== 'build' || !S.next) return out;
  for (const [l, list] of Object.entries(S.next.plan)) out[l] = [...new Set(list)];
  return out;
}

function broadcast() {
  const lanesEnemies = Object.fromEntries(LANES.map((p) => [p, []]));
  for (const e of S.enemies) lanesEnemies[e.lane].push([+((e.x - CASTLE_X) / (SPAWN_X - CASTLE_X)).toFixed(3), e.type]);
  net.send({
    kind: 'state',
    version: VERSION,
    beat: Math.floor(Date.now() / 2000),  // életjel: 2 mp-enként változik, így a telefon tudja, hogy él a kapcsolat
    phase: S.phase, wave: S.wave, maxWave: MAX_WAVE, hp: S.hp, maxHp: S.maxHp,
    countdown: Math.max(0, Math.ceil(S.countdown)),
    bolt: S.bolt, boltMax: BOLT(), boltPressed: Object.keys(S.boltPressed).map(Number),
    treasury: S.treasury, treasuryNeed: NEED(), tLevel: S.tLevel,
    theme: S.phase === 'build' && S.next ? S.next.theme : S.theme,
    next: nextIcons(),
    bossLanes: S.phase === 'build' && S.next ? S.next.bossLanes : [...new Set(S.enemies.filter((e) => e.type === 'boss').map((e) => e.lane))],
    sos: Object.keys(S.sos).map(Number),
    rage: S.rage, endless: S.endless, record,
    sosCd: Object.fromEntries(Object.entries(S.sosCd).map(([p, t]) => [p, Math.ceil(t)])),
    medals: S.medals,
    players: Object.fromEntries(LANES.map((p) => [p, {
      joined: S.players[p].joined, connected: isConnected(p), gold: S.players[p].gold,
      ready: S.players[p].ready, ease: S.players[p].ease, role: S.players[p].role, nukes: S.players[p].nukes,
    }])),
    towers: Object.fromEntries(LANES.map((p) => [p, S.towers[p].map((t) => (t ? { type: t.type, lvl: t.lvl } : null))])),
    enemies: lanesEnemies,
  });
}
setInterval(broadcast, 200);

// ---------- rajzolás ----------
function roundRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
}
function emoji(ch, x, y, size) {
  ctx.font = `${size}px ${EMOJI}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(ch, x, y);
}
function text(str, x, y, size, color = '#fff', align = 'center', weight = 800) {
  ctx.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}
function outlinedText(str, x, y, size, color) {
  ctx.font = `900 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = size / 7; ctx.strokeStyle = 'rgba(15,23,42,.85)'; ctx.lineJoin = 'round';
  ctx.strokeText(str, x, y); ctx.fillStyle = color; ctx.fillText(str, x, y);
}

function drawLanes() {
  const k = K(), LH = LAYOUT.laneH;
  LAYOUT.order.forEach((p, idx) => {
    const y0 = TOP + idx * LH, cy = laneY(p);
    ctx.fillStyle = idx % 2 ? '#5fb14f' : '#6cbf5a';
    ctx.fillRect(0, y0, W, LH);
    const pathH = Math.min(110, LH * 0.45);
    ctx.fillStyle = '#d6b37a';
    roundRect(CASTLE_X - 20, cy - pathH / 2, W - CASTLE_X + 40, pathH, pathH / 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.06)';
    for (let x = CASTLE_X + 40; x < W; x += 90) { ctx.beginPath(); ctx.ellipse(x, cy + ((x / 90) % 2 ? 0.18 : -0.16) * pathH, 14, 7, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = PLAYERS[p].color;
    ctx.fillRect(0, y0, 14, LH);
    const box = Math.min(116, LH * 0.62);
    for (let i = 0; i < SLOTS; i++) {
      const x = slotX(i);
      ctx.fillStyle = 'rgba(255,255,255,.22)';
      roundRect(x - box / 2, cy - box / 2, box, box, 22 * k); ctx.fill();
      ctx.setLineDash([10, 8]); ctx.lineWidth = 4; ctx.strokeStyle = PLAYERS[p].color;
      ctx.stroke(); ctx.setLineDash([]);
      text(String(i + 1), x - box / 2 + 14, cy - box / 2 + 16, 22 * Math.max(0.8, k), 'rgba(15,23,42,.55)');
    }
    const P = S.players[p];
    // a sáv gazdája balra, a fal mellett
    if (P.joined) emoji(PLAYERS[p].icon, SLOT_X0 - 28, y0 + 26 * Math.max(0.8, k), 32 * Math.max(0.8, k));
    if (P.joined && P.ease !== 'normal') emoji(EASE[P.ease].icon, W - 50, y0 + 34 * k, 40 * Math.max(0.8, k));
    // segélykérés: villogó piros keret és 🆘
    if (S.sos[p] > 0) {
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(S.t * 10);
      ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 10;
      ctx.strokeRect(19, y0 + 5, W - 24, LH - 10);
      ctx.globalAlpha = 1;
      emoji('🆘', W - 120, cy, 70 * Math.max(0.7, k));
    }
    // előrejelzés: mi jön a következő hullámban ebbe a sávba
    if (S.phase === 'build' && S.next?.plan[p]) {
      const icons = [...new Set(S.next.plan[p])].map((t) => ENEMIES[t].icon).join(' ');
      ctx.fillStyle = 'rgba(15,23,42,.55)';
      roundRect(1240, cy - 34 * k, 600, 68 * k, 34 * k); ctx.fill();
      emoji(icons, 1540, cy, 44 * k);
    }
    if (!P.joined) {
      ctx.fillStyle = 'rgba(15,23,42,.55)'; ctx.fillRect(14, y0, W - 14, LH);
      outlinedText(`${PLAYERS[p].icon} ${PLAYERS[p].name} sáv: még üres`, W / 2 + 100, cy, 46 * k, '#e2e8f0');
    }
  });
}

function drawCastle() {
  const k = K();
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(0, TOP, CASTLE_X - 30, FIELD_H);
  ctx.fillStyle = '#64748b';
  for (let y = TOP; y < H; y += 40) for (let x = (y / 40) % 2 ? 0 : 30; x < CASTLE_X - 30; x += 60) ctx.fillRect(x, y, 56, 36);
  ctx.fillStyle = '#475569';
  for (let y = TOP; y < H; y += 70) ctx.fillRect(CASTLE_X - 50, y, 30, 40);
  // EGY közös vár, középen, a teljes magasságban
  const midY = TOP + FIELD_H / 2;
  const low = S.hp <= S.maxHp / 4 && S.phase === 'wave';
  emoji('🏰', 100, midY, 190 + (low ? Math.sin(S.t * 12) * 8 : 0));
  text(`❤️ ${Math.max(0, S.hp)}`, 100, midY + 125, 40, low ? '#fca5a5' : '#fff', 'center', 900);
  // a sávok színe a vár falán, hogy látsszon: mindenki ugyanazt a várat védi
  for (const p of LAYOUT.order) {
    ctx.fillStyle = PLAYERS[p].color;
    ctx.fillRect(CASTLE_X - 50, laneY(p) - 20 * k, 30, 40 * k);
  }
  // zászlók a várszintekért
  for (let i = 0; i < Math.min(S.tLevel, 6); i++) emoji('🚩', 30 + i * 32, TOP + 24, 34);
}

function drawTowers() {
  const k = K();
  // kristály-kötések: a varázsló színében futó fényes szálak a felerősített tornyokhoz
  for (const [p, i, q, j] of (S.buffs && S.buffs.links) || []) {
    ctx.globalAlpha = 0.35 + 0.2 * Math.sin(S.t * 4 + i + j);
    ctx.strokeStyle = PLAYERS[p].color; ctx.lineWidth = 6; ctx.setLineDash([4, 10]);
    ctx.beginPath(); ctx.moveTo(slotX(i), laneY(p)); ctx.lineTo(slotX(j), laneY(q)); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  for (const p of LAYOUT.order) S.towers[p].forEach((tw, i) => {
    if (!tw) return;
    const x = slotX(i), y = laneY(p) - 6 * k;
    const look = LEVEL_LOOK[tw.lvl];
    // talapzat a szint színével; az 5. szint forgó szivárvány
    if (look.color) {
      const r = (38 + tw.lvl * 3) * k;
      if (look.color === 'rainbow') {
        const g = ctx.createConicGradient(S.t * 2, x, y);
        ['#f87171', '#facc15', '#4ade80', '#38bdf8', '#a78bfa', '#f472b6', '#f87171'].forEach((c, n) => g.addColorStop(n / 6, c));
        ctx.fillStyle = g;
        ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(x, y, r + 4 * Math.sin(S.t * 5), 0, 7); ctx.fill(); ctx.globalAlpha = 1;
        if (Math.random() < 0.05) burst(x + (Math.random() - 0.5) * 60, y - 30 * k, '#fde68a', 2);
      } else {
        ctx.fillStyle = look.color; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 3; ctx.stroke();
      }
    }
    let sc = (1 + (tw.pulse || 0) * 0.25) * (1 + 0.05 * (tw.lvl - 1));
    if (tw.type === 'mine' || tw.type === 'crystal') sc += Math.sin(S.t * 4 + i) * 0.05;
    emoji(TOWERS[tw.type].icon, x, y, 70 * k * sc);
    text(tw.lvl <= 5 ? '★'.repeat(tw.lvl) : `★${tw.lvl}`, x, y + 52 * k, Math.max(15, 20 * k), tw.lvl === MAX_LEVEL ? '#f0abfc' : '#facc15');
  });
}

function drawEnemies() {
  const k = K();
  for (const e of S.enemies) {
    const bob = Math.sin(S.t * 8 + e.wob) * 5 * k;
    const size = 72 * e.size * Math.max(0.7, k);
    if (e.slowT > 0) { ctx.fillStyle = 'rgba(125,211,252,.45)'; ctx.beginPath(); ctx.arc(e.x, e.y + bob, size * 0.55, 0, 7); ctx.fill(); }
    if (e.elite) { ctx.fillStyle = 'rgba(250,204,21,.35)'; ctx.beginPath(); ctx.arc(e.x, e.y + bob, size * 0.6 + 3 * Math.sin(S.t * 8), 0, 7); ctx.fill(); }
    if (e.netT > 0) emoji('🕸️', e.x, e.y + bob, size * 1.05);
    if (e.hitBy.size >= 2) {
      // kereszttűz: több játékos is eltalálta, a színeik gyűrűként
      const cols = [...e.hitBy].map((h) => PLAYERS[h].color);
      cols.forEach((c, i) => {
        ctx.strokeStyle = c; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(e.x, e.y + bob, size * 0.62, (i / cols.length) * 6.283 + S.t * 3, ((i + 1) / cols.length) * 6.283 + S.t * 3); ctx.stroke();
      });
    }
    ctx.save();
    ctx.translate(e.x, e.y + bob); ctx.scale(-1, 1);
    if (e.hurt > 0) ctx.globalAlpha = 0.6;
    if (e.type === 'ghost') ctx.globalAlpha *= 0.75;
    emoji(ENEMIES[e.type].icon, 0, 0, size);
    ctx.restore();
    const w = 70 * e.size * Math.max(0.7, k), f = Math.max(0, e.hp / e.max);
    ctx.fillStyle = 'rgba(15,23,42,.7)'; roundRect(e.x - w / 2, e.y - size * 0.62, w, 10, 5); ctx.fill();
    ctx.fillStyle = f > 0.5 ? '#4ade80' : f > 0.25 ? '#facc15' : '#f87171';
    roundRect(e.x - w / 2, e.y - size * 0.62, w * f, 10, 5); ctx.fill();
  }
}

function drawShots() {
  for (const s of S.shots) {
    const col = PLAYERS[s.owner]?.color || '#fff';
    const across = s.lane !== s.owner;  // átlövés a szomszédhoz: fénylő csík a lövő színében
    if (across) {
      ctx.globalAlpha = 0.35; ctx.strokeStyle = col; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - (s.vx || 0) * 0.05, s.y - (s.vy || 0) * 0.05); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (s.type === 'archer') {
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.atan2(s.vy || 0, s.vx || 1));
      ctx.strokeStyle = '#78350f'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(8, 0); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(4, -8); ctx.lineTo(4, 8); ctx.fill();
      ctx.restore();
    } else if (s.type === 'ice') { ctx.fillStyle = '#7dd3fc'; ctx.beginPath(); ctx.arc(s.x, s.y, 12, 0, 7); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke(); }
    else if (s.type === 'net') {
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2;
      for (let a = 0; a < 6; a++) { ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + Math.cos(a + S.t * 6) * 16, s.y + Math.sin(a + S.t * 6) * 16); ctx.stroke(); }
      ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(s.x, s.y, 14, 0, 7); ctx.stroke();
    }
    else { ctx.fillStyle = '#1f2937'; ctx.beginPath(); ctx.arc(s.x, s.y, 15, 0, 7); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.stroke(); }
  }
}

function drawFx() {
  for (const q of S.parts) { ctx.globalAlpha = 1 - q.t / q.life; ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(q.x, q.y, 6, 0, 7); ctx.fill(); }
  ctx.globalAlpha = 1;
  for (const f of S.floats) { ctx.globalAlpha = Math.max(0, 1 - f.t / 1.4); outlinedText(f.text, f.x, f.y, f.size, f.color); }
  ctx.globalAlpha = 1;
}

function drawHud() {
  ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, W, TOP);
  text('VÁRVÉDŐK', 40, 52, 46, '#facc15', 'left', 900);
  if (net.room) text(`szoba: ${net.room}`, 335, 54, 28, '#7dd3fc', 'left', 800);
  const sub = S.wave ? `Hullám ${S.wave}${S.endless ? ' ♾️' : ' / ' + MAX_WAVE}${S.phase === 'wave' && S.theme ? ' · ' + S.theme : ''}` : `${MAX_WAVE} hullám vár rátok${record ? ' · rekord: ' + record + '.' : ''}`;

  // a szörnyek dühe a felirat elején
  text((S.rage > 0 ? `🔥${S.rage} · ` : '') + sub, 40, 108, 30, S.rage >= 3 ? '#fdba74' : '#cbd5e1', 'left', 700);
  const hearts = Math.max(0, S.hp), low = hearts <= S.maxHp / 4;
  text(`❤️ ${hearts}`, 600, 62, 50, low ? '#f87171' : '#fff', 'left', 900);
  ctx.fillStyle = '#1e293b'; roundRect(770, 44, 320, 36, 18); ctx.fill();
  ctx.fillStyle = low ? '#ef4444' : '#22c55e'; roundRect(770, 44, 320 * Math.min(1, hearts / S.maxHp), 36, 18); ctx.fill();
  // kincstár
  const tf = S.treasury / NEED();
  text(`🏰 Kincstár${S.tLevel ? ` · ${S.tLevel}. szint` : ''}`, 600, 118, 26, '#fde68a', 'left', 700);
  ctx.fillStyle = '#1e293b'; roundRect(900, 104, 190, 26, 13); ctx.fill();
  ctx.fillStyle = '#facc15'; roundRect(900, 104, 190 * tf, 26, 13); ctx.fill();
  // villám
  const bm = BOLT(), bf = Math.min(1, S.bolt / bm);
  text('⚡', 1140, 62, 50, '#fff');
  ctx.fillStyle = '#1e293b'; roundRect(1180, 44, 260, 36, 18); ctx.fill();
  ctx.fillStyle = bf >= 1 ? (Math.sin(S.t * 10) > 0 ? '#fde047' : '#38bdf8') : '#38bdf8';
  roundRect(1180, 44, 260 * bf, 36, 18); ctx.fill();
  if (bf >= 1 && S.phase === 'wave') {
    const pressed = LANES.filter((p) => S.boltPressed[p]).map((p) => PLAYERS[p].icon).join(' ');
    text(`VILLÁM KÉSZ! Mindenki nyomja! ${pressed}`, 1310, 118, 24, '#fde047');
  }
  let x = 1480;
  for (const p of LANES) {
    const P = S.players[p];
    ctx.globalAlpha = !P.joined ? 0.2 : isConnected(p) ? 1 : 0.5;
    emoji(PLAYERS[p].icon, x + 30, 56, 50);
    if (P.joined) emoji(ROLES[P.role].icon, x + 64, 74, 26);
    if (P.joined) text(`💰${fmtGold(P.gold)}`, x + 36, 112, 22, PLAYERS[p].soft, 'center', 800);
    drawNukeStock(x, P);
    if (S.phase === 'build' && P.ready) text('✔', x + 66, 34, 30, '#4ade80');
    if (S.sos[p] > 0) emoji('🆘', x + 66, 34, 30);
    if (P.joined && !isConnected(p)) text('…', x + 6, 34, 30, '#f87171');
    ctx.globalAlpha = 1;
    x += 86;
  }
}

function drawNuke() {
  if (!S.nukeFx || LAYOUT.order.indexOf(S.nukeFx.lane) < 0) return;
  const f = S.nukeFx.t / 1.6, cy = laneY(S.nukeFx.lane);
  ctx.globalAlpha = Math.min(1, f * 1.5) * 0.55;
  ctx.fillStyle = '#fb923c';
  ctx.fillRect(14, cy - LAYOUT.laneH / 2, W - 14, LAYOUT.laneH);
  ctx.globalAlpha = Math.min(1, f * 2);
  for (let x = 500; x < W; x += 420) emoji('💥', x, cy - (1 - f) * 40, 140 * (1.4 - f * 0.4) * K());
  emoji('☢️', W / 2, cy, 110 * K());
  ctx.globalAlpha = 1;
}

// tartalék atombombák a HUD-ban, a játékos ikonja mellett
function drawNukeStock(x, P) {
  if (P.nukes > 0) text('☢️'.repeat(P.nukes), x + 36, 136, 14, '#fde047', 'center', 800);
}

function drawVersion() {
  // bal alul, a vár fala előtt, jól olvashatóan
  ctx.fillStyle = 'rgba(15,23,42,.85)';
  roundRect(10, H - 50, 130, 40, 20); ctx.fill();
  text(`v${VERSION}`, 75, H - 30, 24, '#e2e8f0', 'center', 800);
}

function banner(title, sub, color = '#facc15', extra) {
  const h = (sub ? 300 : 200) + (extra ? 90 : 0);
  ctx.fillStyle = 'rgba(15,23,42,.72)';
  roundRect(W / 2 - 660, H / 2 - 150, 1320, h, 40); ctx.fill();
  outlinedText(title, W / 2, H / 2 - 60, 90, color);
  if (sub) text(sub, W / 2, H / 2 + 50, 40, '#e2e8f0', 'center', 700);
  if (extra) text(extra, W / 2, H / 2 + 130, 34, '#fde68a', 'center', 700);
}

function drawOverlay() {
  if (S.phase === 'lobby') {
    ctx.fillStyle = 'rgba(15,23,42,.96)'; ctx.fillRect(0, TOP, W, H - TOP);
    if (net.room) {
      // bal oldalt a QR, jobb oldalt a cím és a szobakód
      ctx.fillStyle = '#fff'; roundRect(150, 200, 440, 440, 30); ctx.fill();
      if (qrCanvas) ctx.drawImage(qrCanvas, 170, 220, 400, 400);
      else text('QR betöltése…', 370, 420, 30, '#0f172a');
      outlinedText('🏰 VÁRVÉDŐK 🏰', 1180, 270, 100, '#facc15');
      text('Olvassátok be a QR-kódot a telefonnal!', 1180, 380, 42, '#e2e8f0', 'center', 700);
      text('Szobakód:', 1000, 480, 40, '#94a3b8', 'center', 600);
      outlinedText(net.room, 1260, 485, 110, '#7dd3fc');
      text(phoneUrl, 1180, 580, 26, '#7dd3fc', 'center', 600);
      text('Laptopról: ugyanez a cím egy másik Chrome-ablakban, billentyűzettel.', 1180, 625, 26, '#94a3b8', 'center', 500);
    } else {
      outlinedText('🏰 VÁRVÉDŐK 🏰', W / 2, 300, 120, '#facc15');
      text('Védjétek meg együtt a várat a szörnyektől!', W / 2, 410, 44, '#e2e8f0', 'center', 700);
      text('Próba mód: a telefonos oldal csak ugyanebben a böngészőben csatlakozik:', W / 2, 515, 32, '#94a3b8', 'center', 600);
      text(phoneUrl, W / 2, 568, 38, '#7dd3fc', 'center', 700);
    }
    LANES.forEach((p, i) => {
      const x = W / 2 + (i - 2) * 340, y = 800, P = S.players[p];
      ctx.fillStyle = P.joined ? PLAYERS[p].color : '#334155';
      roundRect(x - 150, y - 90, 300, 180, 36); ctx.fill();
      emoji(PLAYERS[p].icon, x, y - 20, 84);
      text(P.joined ? `${ROLES[P.role].icon} ${ROLES[P.role].name} ${EASE[P.ease].icon}` : `${PLAYERS[p].name}: várjuk…`, x, y + 58, 26, '#fff');
    });
    const n = joinedLanes().length;
    text(n ? `${n} játékos · az „Indulás!” gombbal kezdhettek (vagy szóköz). Legjobb 3-4 játékossal.` : 'Várjuk az első játékost… (3-4 játékosra a legjobb, 5 is mehet)', W / 2, 990, 32, '#facc15', 'center', 700);
  } else if (S.phase === 'build') {
    const nw = S.wave + 1;
    const title = S.wave === 0 ? `Építsetek! ${Math.ceil(S.countdown)}` : `${nw}. hullám: ${Math.ceil(S.countdown)}`;
    const sub = S.next ? `Jön: ${S.next.theme}` : '';
    const boss = S.next?.bossLanes?.length ? `🐲 Sárkány jön ide: ${S.next.bossLanes.map((l) => PLAYERS[l].icon + ' ' + PLAYERS[l].name).join(', ')}. Segítsetek neki!` : 'Tornyot a telefonon, vagy nyomjátok: Kész!';
    // alul, keskeny sávban, hogy a tornyok és az előrejelzés látsszanak
    ctx.fillStyle = 'rgba(15,23,42,.82)';
    roundRect(W / 2 - 760, H - 128, 1520, 118, 30); ctx.fill();
    outlinedText(title, W / 2 - 420, H - 69, 60, '#facc15');
    text(sub, W / 2 + 330, H - 92, 34, '#e2e8f0', 'center', 800);
    text(boss, W / 2 + 330, H - 46, 26, '#fde68a', 'center', 700);
  } else if (S.phase === 'lose') {
    banner('Ajjaj, betörtek!', 'Semmi baj! „Újra!”: minden tornyotok és aranyatok megmarad.', '#fca5a5', S.endless ? `♾️ Eddig: ${S.wave - 1}. hullám · családi rekord: ${record}.` : (S.rage ? 'A szörnyek dühe csillapodik egy kicsit.' : ''));
  } else if (S.phase === 'win') {
    ctx.fillStyle = 'rgba(15,23,42,.8)'; ctx.fillRect(0, TOP, W, H - TOP);
    outlinedText('GYŐZELEM! 🎉', W / 2, 290, 120, '#4ade80');
    text('Megvédtétek a várat! Íme az érmeitek:', W / 2, 400, 40, '#e2e8f0', 'center', 700);
    const medals = S.medals || [];
    medals.forEach((m, i) => {
      const x = W / 2 + (i - (medals.length - 1) / 2) * 340, y = 660;
      ctx.fillStyle = PLAYERS[m.p].color;
      roundRect(x - 150, y - 160, 300, 320, 36); ctx.fill();
      emoji(PLAYERS[m.p].icon, x, y - 90, 80);
      emoji(m.icon || '🏅', x, y + 10, 90);
      text(m.title || 'Hős', x, y + 110, 30, '#fff');
    });
    text('♾️ Tovább a végtelenbe: „Tovább” gomb vagy szóköz · Új játék: „Új játék” gomb vagy N', W / 2, 1000, 30, '#fde68a', 'center', 700);
    if (Math.random() < 0.3) burst(Math.random() * W, TOP + Math.random() * 300, ['#facc15', '#f472b6', '#38bdf8', '#4ade80'][Math.floor(Math.random() * 4)], 8);
  }
  if (S.cheer > 0 && S.phase !== 'win') {
    ctx.globalAlpha = Math.min(1, S.cheer);
    outlinedText(S.cheerText, W / 2, TOP + 90, 72, '#fde047');
    ctx.globalAlpha = 1;
  }
}

function render() {
  ctx.save();
  if (S.shake > 0) ctx.translate((Math.random() - 0.5) * 18 * S.shake, (Math.random() - 0.5) * 18 * S.shake);
  drawLanes(); drawCastle(); drawTowers(); drawEnemies(); drawShots(); drawFx(); drawNuke();
  ctx.restore();
  drawHud(); drawOverlay(); drawVersion();
  if (S.flash > 0) { ctx.globalAlpha = S.flash * 0.45; ctx.fillStyle = S.flashColor; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
}

// Időzítés: a valódi eltelt időt kis lépésekben pótoljuk. Így akkor is pontosan megy a játék,
// ha a kivetítő lapja háttérbe kerül (pl. a laptopos játékos ugyanabban a Chrome-ban másik lapra vált),
// amikor a böngésző a rajzolást leállítja, az időzítőt pedig másodpercenként egyszerire fojtja.
let last = performance.now();
function tick() {
  const t = performance.now();
  let left = Math.min(3, (t - last) / 1000);
  last = t;
  while (left > 0) { const dt = Math.min(0.05, left); update(dt); left -= dt; }
}
function frame() { tick(); render(); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
setInterval(tick, 250);

window.__varvedok = {
  get state() { return S; },
  // szimuláció előretekerése (csak próbához): __varvedok.step(30)
  step(sec) { for (let i = 0; i < sec * 20; i++) update(0.05); render(); broadcast(); },
};
