// Becze Manó-csapat: közös számok és nevek (a kivetítő és a telefon is ezt tölti be).
export const VERSION = '0.1.0';

// A négy manó. Mindenki mást tud, és csak együtt jutnak ki.
// w, h: méret csempében; speed: futás (px/mp); jump: ugrás kezdősebessége (px/mp).
export const MANOK = {
  1: { name: 'Kavics', icon: '🗿', color: '#94a3b8', dark: '#475569', w: 0.82, h: 0.82, speed: 230, jump: 610,
       skill: 'Nehéz vagy: a nagy gombot csak te nyomod le, a repedt kő alattad összetörik, a nehéz ládát csak te tolod.' },
  2: { name: 'Fürge', icon: '🐭', color: '#fb923c', dark: '#c2410c', w: 0.5, h: 0.5, speed: 300, jump: 810,
       skill: 'Kicsi vagy, és te ugrasz a legnagyobbat. A rácson csak te férsz át.' },
  3: { name: 'Lufi', icon: '🎈', color: '#f472b6', dark: '#be185d', w: 0.78, h: 0.8, speed: 240, jump: 670,
       skill: 'Ugrás után tartsd nyomva a gombot: lebegsz! Aki a fejeden áll, azt is felviszed.' },
  4: { name: 'Indás', icon: '🌱', color: '#4ade80', dark: '#15803d', w: 0.78, h: 0.85, speed: 250, jump: 715,
       skill: 'A magnál nyomd meg a gombot: indát vagy hidat növesztesz.' },
};
export const MANO_IDS = [1, 2, 3, 4];
export const COMMON_HINT = 'Kar: futás. Gomb: ugrás. Kar fel/le: mászás az indán. Kar le a karnál: meghúzod.';

// A gombok, karok és kapuk színe betű szerint (a pálya rajzán kisbetű a gomb, nagybetű a kapu).
export const LETTER_COLORS = { a: '#ef4444', b: '#3b82f6', c: '#eab308', d: '#a855f7', e: '#14b8a6' };

// Fizika
export const T = 64;          // csempe mérete
export const COLS = 30, ROWS = 16;
export const GRAVITY = 2200;
export const FLOAT_FUEL = 1.4;   // Lufi ennyi mp-ig lebeghet egy ugrással
export const FLOAT_UP = 170;     // lebegés emelkedése egyedül
export const FLOAT_UP_LOADED = 115;   // ha valaki a fején áll

// A vezérlő-rekord küldése: legfeljebb ennyi ms-onként, és csak ha változott.
export const PAD_MS = 100;
export const PAD_HEARTBEAT_MS = 2000;
export const PAD_GONE_MS = 8000;
