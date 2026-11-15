// Várvédők: közös játékszabályok (a kivetítő és a telefon is ezt olvassa).

// A játék verziója: a kivetítőn és a telefonon is látszik; ha eltér, a telefon szól, hogy frissíteni kell.
// Minden élesítésnél emeld (a README előzményeivel együtt).
export const VERSION = '0.7.0';

export const PLAYERS = {
  1: { name: 'Piros', color: '#ef4444', soft: '#fee2e2', icon: '🦊' },
  2: { name: 'Kék',   color: '#3b82f6', soft: '#dbeafe', icon: '🐳' },
  3: { name: 'Zöld',  color: '#22c55e', soft: '#dcfce7', icon: '🐸' },
  4: { name: 'Sárga', color: '#eab308', soft: '#fef9c3', icon: '🐥' },
  5: { name: 'Lila',  color: '#a855f7', soft: '#f3e8ff', icon: '🦄' },
};
export const PLAYER_IDS = [1, 2, 3, 4, 5];

// Nehézség játékosonként: a sávjába jövő szörnyek életét szorozza (a jutalom nem változik).
export const EASE = {
  easy:   { icon: '🐣', name: 'Könnyű', mult: 0.7 },
  normal: { icon: '🙂', name: 'Normál', mult: 1 },
  hard:   { icon: '🦁', name: 'Nehéz',  mult: 1.3 },
};

export const SLOTS = 6;          // toronyhely soronként
export const MAX_WAVE = 10;      // ennyi hullám után győzelem
export const START_GOLD = 50;
export const WAVE_BONUS = 10;    // minden hullám végén mindenkinek
export const FLAWLESS_BONUS = 10; // szívvesztés nélküli hullámért még ennyi
export const GIFT = 20;          // ajándék-arany (játékosnak vagy a vár kincstárának)
export const MAX_LEVEL = 8;
export const REACH_LEVEL = 5;    // ettől a szinttől két sávnyira is átlő
export const DOUBLE_LEVEL = 8;   // ezen a szinten egyszerre két szörnyre lő
// Szintenkénti látvány: talapzat színe (1. szint: nincs); drágakövek, a 8. szint szivárványos.
export const LEVEL_LOOK = [
  null,
  { name: 'Alap',    color: null },
  { name: 'Bronz',   color: '#cd7f32' },
  { name: 'Ezüst',   color: '#cbd5e1' },
  { name: 'Arany',   color: '#facc15' },
  { name: 'Smaragd', color: '#10b981' },
  { name: 'Zafír',   color: '#3b82f6' },
  { name: 'Rubin',   color: '#e11d48' },
  { name: 'Csoda',   color: 'rainbow' },
];

// Alkalmazkodó nehézség: a szörnyek dühe 🔥. Hibátlan hullám után nő, nehéz hullám vagy vereség után csökken.
export const RAGE = {
  hpPer: 0.15,        // dühszintenként ennyivel több élet
  countPer: 1,        // dühszintenként sávonként ennyivel több szörny
  eliteFrom: 2,       // ettől a szinttől jönnek elit (aranyló) szörnyek
  eliteChance: 0.06,  // dühszintenként ennyi az esélye, hogy egy szörny elit
  eliteHp: 2.2,       // az elit ennyiszer erősebb
  eliteGold: 2,       // és ennyiszer több aranyat ér
  calmLoss: 0.15,     // ha a hullámban a vár életének legalább ennyi része elveszett, a düh csillapodik
};
export const rageMult = (rage) => 1 + RAGE.hpPer * rage;

// Atombomba ☢️: mentőöv. Mindenki a saját aranyából veszi, tartalékolhatja, és egy sávra ledobva ott minden szörny elpusztul.
// A sárkány csak az élete felét veszíti el (különben 300 aranyért bármelyik sárkány-hullám elintézhető lenne).
// Az elpusztult szörnyekért nem jár arany és villámtöltés.
export const NUKE = { cost: 300, max: 3, bossShare: 0.5 };
// rövid aranyszám a kijelzőkre (12 300 -> 12,3e)
export const fmtGold = (g) => { g = Math.floor(g); return g >= 10000 ? (g / 1000).toFixed(g >= 100000 ? 0 : 1).replace('.', ',') + 'e' : String(g); };
export const BOLT_WINDOW = 10;   // ennyi mp-ük van mindenkinek megnyomni a villámot

// 3-4 játékosra hangolva; 5 is mehet. A vár élete és a villám a játékosszámmal nő.
export const castleHp = (n) => Math.max(20, 7 * n);
export const boltMax = (n) => 8 * Math.max(3, n);
export const treasuryNeed = (n, level = 0) => 100 * Math.max(3, n) * (level + 1);  // a következő várszint ára; minden szint drágább
export const TREASURY_HP = 3;    // várszintenként plusz szív
export const HP_PER_JOIN = 7;    // játék közben csatlakozónál ennyi szív jár a várnak

// reach: hány sávnyira lő át a torony a szomszédokhoz (0 = csak a sajátjába). Segélykérésnél és az 5. szinten +1.
export const TOWERS = {
  archer:  { name: 'Íjász',          icon: '🏹', cost: 20, range: 600, rate: 0.8, dmg: 10, reach: 1, desc: 'Gyorsan lő; lassítottra erősebben' },
  ice:     { name: 'Jégtorony',      icon: '❄️', cost: 30, range: 500, rate: 1.3, dmg: 4, slow: 0.5, slowTime: 2.2, reach: 1, desc: 'Lelassít' },
  cannon:  { name: 'Ágyú',           icon: '💣', cost: 50, range: 650, rate: 2.2, dmg: 28, splash: 130, reach: 1, desc: 'Páncélt tör; hálósra dupla' },
  mine:    { name: 'Aranybánya',     icon: '💰', cost: 30, income: 3, every: 8, reach: 0, desc: 'Aranyat termel' },
  net:     { name: 'Hálódobó',       icon: '🕸️', cost: 35, range: 550, rate: 2.4, dmg: 2, root: 1.2, reach: 1, desc: 'Megállítja a szörnyet' },
  crystal: { name: 'Varázskristály', icon: '💎', cost: 45, buff: 0.2, reach: 1, desc: 'Erősíti a környező tornyokat, a szomszédét is' },
};
export const TOWER_ORDER = ['archer', 'ice', 'cannon', 'net', 'crystal', 'mine'];

// Kombók: a csapdamester előkészít, a vadász lecsap
export const COMBO = {
  archerOnSlowed: 1.5,  // lelassított szörnyre az íjász ennyiszer erősebb
  cannonOnNetted: 2,    // hálóban lévőre az ágyú ennyiszer erősebb
};

// Szerepek: mindenkinek más az erőssége, egymásra vannak utalva.
// discount: árszorzó (építés és fejlesztés), power: hatásszorzó (sebzés, lassítás és háló ideje, bánya hozama, kristály ereje)
export const ROLES = {
  hunter:   { icon: '🏹', name: 'Vadász',       desc: 'Íjász és ágyú: +30% sebzés',            power: { archer: 1.3, cannon: 1.3 }, discount: {} },
  guardian: { icon: '🛡️', name: 'Csapdamester', desc: 'Háló és jég: olcsóbb, tovább tart',       power: { net: 1.5, ice: 1.5 }, discount: { net: 0.7, ice: 0.7 } },
  mage:     { icon: '🧙', name: 'Varázsló',     desc: 'Kristály és bánya: erősebb, olcsóbb',     power: { crystal: 1.5, mine: 1.5 }, discount: { crystal: 0.8, mine: 0.8 } },
};
export const ROLE_ORDER = ['hunter', 'guardian', 'mage'];
export const defaultRole = (p) => ROLE_ORDER[(p - 1) % 3];
export const isStrength = (role, type) => !!(ROLES[role] && ROLES[role].power[type]);

// A varázspálca szerepenként más sorrendben tölti fel az üres helyeket.
export const WAND_RECIPES = {
  hunter:   ['archer', 'mine', 'archer', 'cannon', 'archer', 'cannon'],
  guardian: ['archer', 'net', 'ice', 'mine', 'cannon', 'net'],
  mage:     ['archer', 'mine', 'crystal', 'mine', 'archer', 'crystal'],
};

// Együttműködés
export const CROSS_BONUS = 1.3;  // kereszttűz: akit már egy másik játékos is eltalált, az ennyiszer többet sebződik
export const CROSS_GOLD = 2;     // kereszttűzben legyőzött szörnyért minden segítő ennyi pluszt kap
export const SOS_TIME = 8;       // segélykérés: ennyi mp-ig mindenki tornya a bajba jutottat célozza, +1 sávnyira lő
export const SOS_COOLDOWN = 20;  // ennyi mp után kérhet újra ugyanaz a játékos
export const BOSS_HOP = [6, 9];  // a sárkány ennyi mp-enként sávot vált (min, max)
// Egy torony ereje a szintje és a gazdája szerepe szerint. Minden szint erősebb (5. szint kb. 3,6-szoros, 8. szint kb. 9,5-szörös sebzés).
export function towerStats(type, lvl, role) {
  const b = TOWERS[type];
  const k = lvl - 1;
  const pw = (ROLES[role] && ROLES[role].power[type]) || 1;
  return {
    ...b,
    dmg: b.dmg ? b.dmg * Math.pow(1.38, k) * pw : 0,
    rate: b.rate ? b.rate * Math.pow(0.92, k) : 0,
    range: b.range ? b.range + 30 * k : 0,
    reach: b.reach + (b.reach && lvl >= REACH_LEVEL ? 1 : 0),
    double: lvl >= DOUBLE_LEVEL,
    income: b.income ? Math.round(b.income * (1 + 0.8 * k) * pw) : 0,
    slowTime: b.slowTime ? (b.slowTime + 0.35 * k) * pw : 0,
    root: b.root ? (b.root + 0.2 * k) * pw : 0,
    buff: b.buff ? (b.buff + 0.08 * k) * pw : 0,
    splash: b.splash ? b.splash + 12 * k : 0,
  };
}

export function towerCost(type, role) {
  const d = (ROLES[role] && ROLES[role].discount[type]) || 1;
  return Math.round(TOWERS[type].cost * d);
}

// Fejlesztés a következő szintre, az alapár szorzójában; egyre drágább; a csúcson null
const UP = [0.8, 1.4, 2.2, 3.5, 5.5, 8.5, 13];
export function upgradeCost(type, lvl, role) {
  if (lvl >= MAX_LEVEL) return null;
  return Math.round(towerCost(type, role) * UP[lvl - 1] / 5) * 5;
}

export const ENEMIES = {
  worm:   { icon: '🐛', name: 'Hernyó',     hp: 30,  speed: 60,  gold: 3,  hit: 1, size: 1 },
  bat:    { icon: '🦇', name: 'Denevér',    hp: 18,  speed: 115, gold: 3,  hit: 1, size: 1 },
  snail:  { icon: '🐌', name: 'Csiga',      hp: 90,  speed: 34,  gold: 6,  hit: 1, size: 1.1 },
  beetle: { icon: '🐞', name: 'Páncélos',   hp: 60,  speed: 45,  gold: 6,  hit: 1, size: 1, armor: 0.35 },   // íjász és jég csak 35%-ot sebez
  ghost:  { icon: '👻', name: 'Szellem',    hp: 25,  speed: 95,  gold: 4,  hit: 1, size: 1, noSlow: true },  // a jég nem lassítja
  pig:    { icon: '🐷', name: 'Malacpersely', hp: 40, speed: 100, gold: 25, hit: 0, size: 1 },               // nem bánt, csak elszalad az arannyal
  boss:   { icon: '🐲', name: 'Sárkány',    hp: 800, speed: 30,  gold: 40, hit: 5, size: 1.9 },
};

// Hullám-témák: mi jön inkább (súlyok). A malac és a sárkány külön kerül bele.
const THEMES = {
  1:  { name: 'Hernyók jönnek',  mix: { worm: 1 } },
  2:  { name: 'Szárnyas vendégek', mix: { worm: 2, bat: 1 } },
  3:  { name: 'Denevérraj!',     mix: { bat: 7, worm: 3 } },
  4:  { name: 'Csigamenet',      mix: { snail: 6, worm: 4 } },
  5:  { name: 'A sárkány jön!',  mix: { worm: 3, bat: 3, snail: 2 } },
  6:  { name: 'Páncélosok!',     mix: { beetle: 5, worm: 3, bat: 2 } },
  7:  { name: 'Szellemjárás',    mix: { ghost: 5, snail: 3, worm: 2 } },
  8:  { name: 'Mindenki egyszerre', mix: { worm: 2, bat: 2, snail: 2, beetle: 2, ghost: 2 } },
  9:  { name: 'Páncél és szellem', mix: { beetle: 4, ghost: 4, snail: 2 } },
  10: { name: 'A nagy csata!',   mix: { worm: 1, bat: 2, snail: 2, beetle: 3, ghost: 2 } },
};

function pick(mix) {
  const total = Object.values(mix).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [k, w] of Object.entries(mix)) { r -= w; if (r <= 0) return k; }
  return Object.keys(mix)[0];
}

// A végtelen módban (10. hullám után) a témák keverednek.
const ENDLESS_THEMES = [
  { name: 'Végtelen roham', mix: { worm: 1, bat: 2, snail: 2, beetle: 3, ghost: 2 } },
  { name: 'Páncélos áradat', mix: { beetle: 6, snail: 3, bat: 1 } },
  { name: 'Szellemvihar', mix: { ghost: 6, bat: 3, worm: 1 } },
  { name: 'Csigák hada', mix: { snail: 6, beetle: 3, worm: 1 } },
];

// Egy hullám: soronként a szörnyek listája. Csak a csatlakozott játékosok sorába jön szörny.
// rage: a szörnyek dühe (alkalmazkodó nehézség); n > MAX_WAVE: végtelen mód.
export function wavePlan(n, lanes, rage = 0) {
  const theme = THEMES[n] || ENDLESS_THEMES[(n - MAX_WAVE - 1 + ENDLESS_THEMES.length * 10) % ENDLESS_THEMES.length];
  const plan = {}, elite = {};
  const count = Math.min(5 + 2 * n, 32) + RAGE.countPer * rage;
  const eliteP = rage >= RAGE.eliteFrom ? RAGE.eliteChance * rage : 0;
  for (const l of lanes) {
    const list = [];
    for (let i = 0; i < count; i++) list.push(pick(theme.mix));
    if (n >= 2) {
      const pigs = n >= 6 ? 2 : 1;
      for (let i = 0; i < pigs; i++) list.splice(Math.floor(Math.random() * list.length), 0, 'pig');
    }
    plan[l] = list;
    // elit jelölés: ugyanolyan hosszú lista, igaz/hamis (a malac sosem elit)
    elite[l] = list.map((t) => t !== 'pig' && Math.random() < eliteP);
  }
  const bossLanes = [];
  if (n % 5 === 0 && lanes.length) {
    // 4-5 játékosnál a 10. hullámtól két sárkány jön, két különböző sávban; a végtelenben 15-től három is
    let bosses = lanes.length >= 4 && n >= 10 ? 2 : 1;
    if (n >= 15 && lanes.length >= 3) bosses = Math.min(lanes.length, bosses + 1);
    const pool = [...lanes].sort(() => Math.random() - 0.5);
    for (let b = 0; b < bosses; b++) { plan[pool[b]].push('boss'); elite[pool[b]].push(false); bossLanes.push(pool[b]); }
  }
  const k = n - 1;
  return {
    plan, elite, theme: theme.name, bossLanes,
    interval: Math.max(0.6, 2.2 - n * 0.14),
    hpMult: (1 + 0.45 * k + 0.36 * k * k) * rageMult(rage),
  };
}

// Érmek a győzelem után: mindenki pontosan egyet kap, más kategóriában.
export const MEDALS = [
  { key: 'kills',  icon: '🏹', title: 'Szörnyvadász' },
  { key: 'given',  icon: '🎁', title: 'Legnagylelkűbb' },
  { key: 'help',   icon: '⭐', title: 'Legjobb segítő' },
  { key: 'built',  icon: '🏰', title: 'Várépítő' },
  { key: 'mined',  icon: '⛏️', title: 'Aranyásó' },
];
