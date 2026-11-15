// Kapcsolat a kivetítő és a telefonok között. Két mód, ugyanazzal a felülettel:
//  - firebase: Realtime Database, szobakóddal (rooms/{KÓD}); a telefon bárhonnan csatlakozhat.
//      rooms/{KÓD}/host    a kivetítő névtelen azonosítója (csak ő írhatja az állapotot)
//      rooms/{KÓD}/state   a kivetítő írja, JSON-szövegként (így a null-os tömbök is épen maradnak)
//      rooms/{KÓD}/inputs  a telefonok parancsai; a kivetítő feldolgozza és törli
//  - helyi: BroadcastChannel, egy böngészőn belül (próba, ?helyi=1, vagy ha nincs config)
import { firebaseConfig } from './config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';
const params = new URLSearchParams(location.search);
export const isLocal = params.has('helyi') || !firebaseConfig;

function localTransport() {
  const ch = new BroadcastChannel('varvedok-v1');
  const handlers = [];
  ch.onmessage = (e) => handlers.forEach((h) => h(e.data));
  return { mode: 'helyi', room: null, send: (msg) => ch.postMessage(msg), on: (cb) => handlers.push(cb) };
}

async function firebaseBase() {
  const [{ initializeApp }, { getAuth, signInAnonymously }, db] = await Promise.all([
    import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-database.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const cred = await signInAnonymously(getAuth(app));
  return { db, database: db.getDatabase(app), uid: cred.user.uid };
}

const LETTERS = 'ABCDEFGHJKLMNPRSTUVZ'; // könnyen kimondható, összetéveszthetetlen betűk
const newCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
export const validRoom = (c) => /^[A-Z]{4}$/.test(c || '');

// A kivetítő: szobát nyit, olvassa a parancsokat, írja az állapotot.
export async function connectScreen() {
  if (isLocal) return localTransport();
  const { db, database, uid } = await firebaseBase();
  let room = sessionStorage.getItem('varvedok-szoba');
  for (let i = 0; i < 8; i++) {
    if (!validRoom(room)) room = newCode();
    try { await db.set(db.ref(database, `rooms/${room}/host`), uid); break; } // foglalt szobánál a szabály elutasít
    catch (e) { room = null; }
  }
  if (!room) throw new Error('Nem sikerült szobát nyitni');
  sessionStorage.setItem('varvedok-szoba', room);
  const handlers = [];
  const inputs = db.ref(database, `rooms/${room}/inputs`);
  db.onChildAdded(inputs, (snap) => {
    const m = snap.val();
    db.remove(snap.ref);
    if (m) handlers.forEach((h) => h({ ...m, kind: 'in' }));
  });
  let last = '';
  const stateRef = db.ref(database, `rooms/${room}/state`);
  return {
    mode: 'firebase', room,
    send: (msg) => { const s = JSON.stringify(msg); if (s !== last) { last = s; db.set(stateRef, s); } },
    on: (cb) => handlers.push(cb),
  };
}

// A telefon (vagy laptop): a szoba állapotát figyeli, parancsot küld.
export async function connectPhone(room) {
  if (isLocal) return localTransport();
  const { db, database, uid } = await firebaseBase();
  const handlers = [];
  db.onValue(db.ref(database, `rooms/${room}/state`), (snap) => {
    const v = snap.val();
    if (typeof v !== 'string') return;
    try { const m = JSON.parse(v); handlers.forEach((h) => h(m)); } catch (e) { /* hibás állapot */ }
  });
  const inputs = db.ref(database, `rooms/${room}/inputs`);
  return {
    mode: 'firebase', room,
    send: (msg) => { const { kind, ...rest } = msg; db.push(inputs, { ...rest, uid }); },
    on: (cb) => handlers.push(cb),
  };
}
