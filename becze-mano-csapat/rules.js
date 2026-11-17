// Becze Manó-csapat: közös számok és nevek (a kivetítő és a telefon is ezt tölti be).
export const VERSION = '0.3.0';

// A négy manó. Mindenki mást tud, és csak együtt jutnak ki.
// w, h: méret csempében; speed: futás (px/mp); jump: ugrás kezdősebessége (px/mp).
export const MANOK = {
  1: { name: 'Kavics', icon: '🗿', color: '#94a3b8', dark: '#475569', w: 0.82, h: 0.82, speed: 230, jump: 610,
       skill: 'Nehéz vagy: a nagy gombot csak te nyomod le, a repedt kő alattad összetörik. A NYÍL gomb kötelet lő: rajta lengsz, mint egy inga, és újabb nyíllal tovább!' },
  2: { name: 'Fürge', icon: '🐭', color: '#fb923c', dark: '#c2410c', w: 0.5, h: 0.5, speed: 300, jump: 810,
       skill: 'A levegőben is tudsz ugrani, de öt ugrás után elfáradsz, amíg le nem érsz. A rácson csak te férsz át.' },
  3: { name: 'Kopter', icon: '🚁', color: '#f472b6', dark: '#be185d', w: 0.78, h: 0.8, speed: 240, jump: 670,
       skill: 'Helikopter vagy: tartsd nyomva a gombot, és repülsz! Aki beléd kapaszkodik, azt viszed, akár az égig. A tetődről a propeller ledob mindenkit.' },
  4: { name: 'Indás', icon: '🌱', color: '#4ade80', dark: '#15803d', w: 0.78, h: 0.85, speed: 250, jump: 715,
       skill: 'Az INDA gombbal bárhol indát növesztesz, ami nő és nő felfelé, akár az égig; 30 másodperc múlva elsorvad. A magnál hidat is.' },
};
export const MANO_IDS = [1, 2, 3, 4];
export const COMMON_HINT = 'Kar: futás. Gomb: ugrás. Kar fel/le: mászás. A kart elég megérinteni. Ugrás a Kopter alá: belekapaszkodsz.';

// A gombok, karok és kapuk színe betű szerint (a pálya rajzán kisbetű a gomb, nagybetű a kapu).
export const LETTER_COLORS = { a: '#ef4444', b: '#3b82f6', c: '#eab308', d: '#a855f7', e: '#14b8a6' };

// Fizika
export const T = 64;          // csempe mérete
export const COLS = 30, ROWS = 16;
export const GRAVITY = 2200;
export const HELI_UP = 300;        // Kopter emelkedése, ha nyomva a gomb
export const HELI_UP_LOADED = 210; // ha valaki kapaszkodik belé
export const HELI_DOWN = 170;      // ha elengedi a gombot, lassan ereszkedik
export const VINE_LIFE = 30;       // ennyi mp-ig él Indás indája
export const VINE_MAX = 3;         // egyszerre legfeljebb ennyi inda (a legrégebbi elsorvad)
export const VINE_SPEED = 6;       // ennyi csempét nő másodpercenként, amíg falba nem ütközik
export const FURGE_JUMPS = 5;      // Fürge ennyit ugorhat, mielőtt elfárad (földet érve kipiheni)
// Kavics kötélnyila: speed (px/mp), max (a kötél leghosszabb, px), climb (fel-le a kötélen, px/mp),
// pump (lengetés ereje), drag (légellenállás, hogy a lengés idővel lecsillapodjon)
export const ROPE = { speed: 1500, max: 11 * 64, min: 0.7 * 64, climb: 220, pump: 950, drag: 0.5 };

// A vezérlő-rekord küldése: legfeljebb ennyi ms-onként, és csak ha változott.
export const PAD_MS = 100;
export const PAD_HEARTBEAT_MS = 2000;
export const PAD_GONE_MS = 8000;
