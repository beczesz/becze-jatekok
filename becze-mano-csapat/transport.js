// Kapcsolat a kivetítő és a telefonok között. Két mód, ugyanazzal a felülettel:
//  - firebase: Realtime Database, szobakóddal (mano/{KÓD}); a telefon bárhonnan csatlakozhat.
//      mano/{KÓD}/host      a kivetítő névtelen azonosítója (csak ő írhatja az állapotot)
//      mano/{KÓD}/state     a kivetítő írja, JSON-szövegként
//      mano/{KÓD}/pads/{p}  a játékos vezérlő-rekordja (kar, gomb, állomás); a telefon FELÜLÍRJA,
//                           nem parancssort küld, mert a kar állása folyamatosan változik
//  - helyi: BroadcastChannel, egy böngészőn belül (próba, ?helyi=1, vagy ha nincs config)
import { firebaseConfig } from './config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';
const params = new URLSearchParams(location.search);
export const isLocal = params.has('helyi') || !firebaseConfig;

function localTransport(role) {
  const ch = new BroadcastChannel('mano-csapat-v1');
  const stateH = [], padH = [];
  ch.onmessage = (e) => {
    const m = e.data;
    if (m.kind === 'state' && role === 'phone') stateH.forEach((h) => h(m.state));
    if (m.kind === 'pad' && role === 'screen') padH.forEach((h) => h(m.p, m.pad));
  };
  return {
    mode: 'helyi', room: null,
    send: (state) => ch.postMessage({ kind: 'state', state }),
    onPad: (cb) => padH.push(cb),
    on: (cb) => stateH.push(cb),
    setPad: async (p, pad) => ch.postMessage({ kind: 'pad', p, pad }),
    leave: (p) => ch.postMessage({ kind: 'pad', p, pad: null }),
  };
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

// A kivetítő: szobát nyit, figyeli a vezérlő-rekordokat, írja az állapotot.
export async function connectScreen() {
  if (isLocal) return localTransport('screen');
  const { db, database, uid } = await firebaseBase();
  let room = sessionStorage.getItem('mano-szoba');
  for (let i = 0; i < 8; i++) {
    if (!validRoom(room)) room = newCode();
    try { await db.set(db.ref(database, `mano/${room}/host`), uid); break; } // foglalt szobánál a szabály elutasít
    catch (e) { room = null; }
  }
  if (!room) throw new Error('Nem sikerült szobát nyitni');
  sessionStorage.setItem('mano-szoba', room);
  const padH = [];
  const pads = db.ref(database, `mano/${room}/pads`);
  const fire = (snap) => padH.forEach((h) => h(Number(snap.key), snap.val()));
  db.onChildAdded(pads, fire);
  db.onChildChanged(pads, fire);
  db.onChildRemoved(pads, (snap) => padH.forEach((h) => h(Number(snap.key), null)));
  let last = '';
  const stateRef = db.ref(database, `mano/${room}/state`);
  return {
    mode: 'firebase', room,
    send: (state) => { const s = JSON.stringify(state); if (s !== last) { last = s; db.set(stateRef, s); } },
    onPad: (cb) => padH.push(cb),
    kick: (p) => db.remove(db.ref(database, `mano/${room}/pads/${p}`)).catch(() => {}),
  };
}

// A telefon (vagy laptop): az állapotot figyeli, a saját vezérlő-rekordját írja.
export async function connectPhone(room) {
  if (isLocal) return localTransport('phone');
  const { db, database, uid } = await firebaseBase();
  const stateH = [];
  db.onValue(db.ref(database, `mano/${room}/state`), (snap) => {
    const v = snap.val();
    if (typeof v !== 'string') return;
    try { const m = JSON.parse(v); stateH.forEach((h) => h(m)); } catch (e) { /* hibás állapot */ }
  });
  let armed = null;
  return {
    mode: 'firebase', room,
    on: (cb) => stateH.push(cb),
    // Elutasít, ha a szín foglalt (a szabály dönt). Az első sikeres írás után a lap bezárásakor
    // a Firebase magától törli a rekordot (onDisconnect).
    setPad: async (p, pad) => {
      const ref = db.ref(database, `mano/${room}/pads/${p}`);
      await db.set(ref, { ...pad, uid, t: db.serverTimestamp() });
      if (armed !== p) { armed = p; db.onDisconnect(ref).remove(); }
    },
    leave: (p) => db.remove(db.ref(database, `mano/${room}/pads/${p}`)).catch(() => {}),
  };
}
