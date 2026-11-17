// Becze Csillaghajó: közös számok és nevek (a kivetítő és a telefon is ezt tölti be).
export const VERSION = '0.1.0';

export const PLAYERS = {
  1: { name: 'Piros', color: '#ef4444', soft: '#fee2e2', icon: '🦊' },
  2: { name: 'Kék',   color: '#3b82f6', soft: '#dbeafe', icon: '🐳' },
  3: { name: 'Zöld',  color: '#22c55e', soft: '#dcfce7', icon: '🐸' },
  4: { name: 'Sárga', color: '#eab308', soft: '#fef9c3', icon: '🐥' },
  5: { name: 'Lila',  color: '#a855f7', soft: '#f3e8ff', icon: '🦄' },
};
export const PLAYER_IDS = [1, 2, 3, 4, 5];

// Állomások. A kar-próbában három van; a többi (pajzs, nagyágyú, szerelő) a prototípusban jön.
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
