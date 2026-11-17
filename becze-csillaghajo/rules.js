// Becze Csillaghajó: közös számok és nevek (a kivetítő és a telefon is ezt tölti be).
export const VERSION = '0.2.0';

export const PLAYERS = {
  1: { name: 'Piros', color: '#ef4444', soft: '#fee2e2', icon: '🦊' },
  2: { name: 'Kék',   color: '#3b82f6', soft: '#dbeafe', icon: '🐳' },
  3: { name: 'Zöld',  color: '#22c55e', soft: '#dcfce7', icon: '🐸' },
  4: { name: 'Sárga', color: '#eab308', soft: '#fef9c3', icon: '🐥' },
  5: { name: 'Lila',  color: '#a855f7', soft: '#f3e8ff', icon: '🦄' },
};
export const PLAYER_IDS = [1, 2, 3, 4, 5];

// Állomások. Most három van; a többi (pajzs-állomás, nagyágyú, szerelő) később jön.
// pos: hol ül a hajón (a hajó saját koordinátáiban, a hajó orra +x irányba néz)
export const STATIONS = {
  helm: { name: 'Kormány', icon: '🧭', pos: [38, 0], stick: 'merre repüljünk', button: 'turbó' },
  gun1: { name: 'Ágyú 1', icon: '🔫', pos: [-22, -52], stick: 'célzás', button: 'lövés' },
  gun2: { name: 'Ágyú 2', icon: '🔫', pos: [-22, 52], stick: 'célzás', button: 'lövés' },
};
export const STATION_IDS = ['helm', 'gun1', 'gun2'];

// A vezérlő-rekord küldése: legfeljebb ennyi ms-onként, és csak ha változott.
export const PAD_MS = 100;
export const PAD_HEARTBEAT_MS = 2000;   // változás nélkül is ennyi időnként (életjel)
export const PAD_GONE_MS = 8000;        // ennyi csend után a kivetítő elengedi a játékos állomását

// ---------- fejlődés: minden legyőzött gonosz után egy új szint valamelyikből ----------
// Fegyverek: az elején egy lassú kavicsvető, a végén csillagvihar. dmg: sebzés lövedékenként,
// cd: két lövés között (mp), shots: egyszerre hány lövedék, spread: legyező szöge, par: párhuzamos távolság,
// homing: mennyire fordul a cél felé (0: egyenesen megy).
export const WEAPONS = [
  { name: 'Kavicsvető',   icon: '🥌', cd: 0.55, dmg: 1,  speed: 650,  shots: 1, spread: 0,    par: 0,  size: 9,  kind: 'ball',   homing: 0 },
  { name: 'Gyorstüzelő',  icon: '🔫', cd: 0.32, dmg: 1,  speed: 800,  shots: 1, spread: 0,    par: 0,  size: 8,  kind: 'ball',   homing: 0 },
  { name: 'Dupla ágyú',   icon: '🔫', cd: 0.30, dmg: 1.5, speed: 850, shots: 2, spread: 0,    par: 14, size: 8,  kind: 'ball',   homing: 0 },
  { name: 'Lézer',        icon: '🔦', cd: 0.20, dmg: 2.5, speed: 1300, shots: 2, spread: 0,   par: 14, size: 6,  kind: 'laser',  homing: 0 },
  { name: 'Hármas lézer', icon: '🔦', cd: 0.20, dmg: 3,  speed: 1300, shots: 3, spread: 0.16, par: 0,  size: 6,  kind: 'laser',  homing: 0 },
  { name: 'Rakéták',      icon: '🚀', cd: 0.28, dmg: 9,  speed: 700,  shots: 2, spread: 0,    par: 16, size: 9,  kind: 'rocket', homing: 3 },
  { name: 'Plazmaágyú',   icon: '🟣', cd: 0.24, dmg: 10, speed: 1000, shots: 3, spread: 0.14, par: 0,  size: 16, kind: 'plasma', homing: 1.5 },
  { name: 'Csillagvihar', icon: '🌟', cd: 0.16, dmg: 12, speed: 1200, shots: 5, spread: 0.12, par: 0,  size: 12, kind: 'star',   homing: 3 },
];
// Pajzs: magától véd. charge: ennyi találatot fog meg, regen: ennyi mp alatt tölt vissza egyet.
export const SHIELDS = [
  { name: 'Nincs pajzs',   icon: '⭕', charge: 0,  regen: 0 },
  { name: 'Buborékpajzs',  icon: '🫧', charge: 2,  regen: 5 },
  { name: 'Erőtér',        icon: '🛡️', charge: 4,  regen: 3.5 },
  { name: 'Kristálypajzs', icon: '💎', charge: 6,  regen: 2.5 },
  { name: 'Csillagpajzs',  icon: '✨', charge: 10, regen: 1.5 },
];
// Hajtómű: az elején lassú, pöfögő; acc: gyorsulás, max: csúcssebesség.
export const ENGINES = [
  { name: 'Pöfögő',       icon: '💨', acc: 420,  max: 270 },
  { name: 'Kerozinos',    icon: '🔥', acc: 560,  max: 360 },
  { name: 'Ionhajtómű',   icon: '🔵', acc: 700,  max: 450 },
  { name: 'Fúziós',       icon: '☀️', acc: 850,  max: 540 },
  { name: 'Hiperhajtómű', icon: '🌀', acc: 1000, max: 650 },
];
// Hajótest: egyre modernebb forma.
export const HULLS = [
  { name: 'Bádogteknő',      icon: '🥫' },
  { name: 'Uszonyos',        icon: '🐟' },
  { name: 'Nyílhegy',        icon: '➹' },
  { name: 'Szárnyas vadász', icon: '🦅' },
  { name: 'Csillagcirkáló',  icon: '🌠' },
];
export const GEAR = { weapon: WEAPONS, shield: SHIELDS, engine: ENGINES, hull: HULLS };
export const GEAR_LABEL = { weapon: 'Új fegyver', shield: 'Új pajzs', engine: 'Gyorsabb hajtómű', hull: 'Új hajótest', crown: 'A csillagköd megmentve' };

// A 20 gonosz, sorban. Mindegyik legyőzése után jár a mellette álló jutalom.
export const BOSSES = [
  { name: 'Morcos Maszat',        color: '#84cc16', gift: 'weapon' },
  { name: 'Nyálkás Nyamnyam',     color: '#22c55e', gift: 'engine' },
  { name: 'Köpködő Kobak',        color: '#14b8a6', gift: 'shield' },
  { name: 'Szarvas Szörcsög',     color: '#f97316', gift: 'weapon' },
  { name: 'Tüskés Tóbiás',        color: '#eab308', gift: 'hull' },
  { name: 'Hatkarú Huhogó',       color: '#06b6d4', gift: 'engine' },
  { name: 'Ragacs Rém',           color: '#a3e635', gift: 'weapon' },
  { name: 'Vicsorgó Vackor',      color: '#f43f5e', gift: 'shield' },
  { name: 'Bütykös Bumm',         color: '#d97706', gift: 'weapon' },
  { name: 'Csápos Csámcsogó',     color: '#8b5cf6', gift: 'hull' },
  { name: 'Ködlidérc',            color: '#94a3b8', gift: 'engine' },
  { name: 'Jeges Jajveszék',      color: '#38bdf8', gift: 'weapon' },
  { name: 'Villámfogú',           color: '#facc15', gift: 'shield' },
  { name: 'Kráterszájú',          color: '#b45309', gift: 'hull' },
  { name: 'Sötét Sárkánygomba',   color: '#7c3aed', gift: 'weapon' },
  { name: 'Háromszemű Hörgő',     color: '#ec4899', gift: 'engine' },
  { name: 'Lávaköpő Lajhár',      color: '#ef4444', gift: 'shield' },
  { name: 'Árnyékpók-király',     color: '#6366f1', gift: 'weapon' },
  { name: 'Feketelyuk-falánk',    color: '#4c1d95', gift: 'hull' },
  { name: 'A Ködkirály',          color: '#dc2626', gift: 'crown' },
];
export const LEVELS = BOSSES.length;

// A hajó felszerelése egy szint elején: az addig legyőzött gonoszok jutalmai.
export function gearAt(level) {
  const g = { weapon: 0, shield: 0, engine: 0, hull: 0 };
  for (let i = 0; i < Math.min(level - 1, LEVELS); i++) { const k = BOSSES[i].gift; if (k in g) g[k]++; }
  return g;
}

// A gonosz ereje a hajó akkori fegyveréhez igazodik: két gyerek, közepes célzással,
// az 1. szinten kb. 15 mp, a 20.-on kb. 40 mp alatt győzi le. Mindig le lehet győzni.
export function weaponDps(w) {
  const W = WEAPONS[w];
  return (W.dmg * W.shots / W.cd) * (W.homing ? 0.85 : 0.55);
}
export function bossStats(level) {
  const L = Math.min(level, LEVELS);
  const dps = weaponDps(gearAt(L).weapon) * 1.5;   // átlagosan másfél ágyú lő
  return {
    hp: Math.max(16, Math.round(dps * (14 + L * 1.3))),
    r: 80 + L * 9,                   // méret: 89-től 260 pixelig
    speed: 30 + L * 2.5,             // lassú, mindig utol lehet érni
    spitEvery: L >= 3 ? Math.max(1.8, 4.2 - L * 0.12) : 0,   // nyálgolyó (a pajzs megfogja)
    spitSpeed: 190 + L * 6,
    minions: Math.min(2 + Math.floor(L / 2), 11),
    summonEvery: L >= 6 ? Math.max(5, 11 - L * 0.3) : 0,
    eyes: 1 + Math.floor(L / 5),
    horns: L >= 4, spikes: L >= 7, tentacles: 3 + Math.floor(L / 3),
    minionDps: dps,
  };
}
