// Próba-robot: szkriptelt bemenettel végigjátssza a pályákat, hogy kiderüljön, megoldhatók-e.
// Használat a kivetítő konzoljában (screen.html?helyi=1): const m = await import('./proba-robot.js'); m.runAll()
// A robot ugyanazt a kart és gombot nyomja, amit a telefon küldene; semmit nem teleportál.
const { G, P, step } = window.__mano;
const T = 64, DT = 1 / 60;
const tick = (sec = DT) => step(sec);
const M = (p) => G.manos[p];
const cx = (p) => M(p).x + M(p).w / 2;
const neutral = (p) => Object.assign(P[p], { x: 0, y: 0, b: false });

function walk(p, col, max = 12, jumpEvery = 0) {   // a kar oldalra, amíg oda nem ér; elakadásnál ugrik
  const target = col * T + T / 2;
  let t = 0, last = cx(p), still = 0;
  while (t < max) {
    const d = target - cx(p);
    if (Math.abs(d) < 6) break;
    P[p].x = Math.sign(d) * (Math.abs(d) < 20 ? 0.4 : 1);
    if (Math.abs(cx(p) - last) < 0.3) still += DT; else still = 0;
    last = cx(p);
    P[p].b = still > 0.15 || (jumpEvery && (t % jumpEvery) < DT * 3);
    tick(); t += DT;
  }
  neutral(p); tick(0.3);
  return Math.abs(target - cx(p)) < 10;
}
function press(p) { P[p].b = true; tick(DT * 3); P[p].b = false; tick(0.2); }
function pull(p) { P[p].y = 1; tick(DT * 3); P[p].y = 0; tick(DT * 2); }
function climb(p, dirX, max = 6) {   // fel az indán, közben oldalra, amíg fel nem ér
  let t = 0; const y0 = M(p).y;
  P[p].y = -1; P[p].x = 0;
  while (t < max) {
    if (y0 - M(p).y > T * 2) P[p].x = dirX;
    tick(); t += DT;
    if (M(p).ground && y0 - M(p).y > T * 3) break;
  }
  neutral(p); tick(0.4);
}
function float(p, untilY, dirX = 0, max = 3) {   // Lufi: ugrás, aztán nyomva tartott gomb
  P[p].b = true; P[p].x = dirX;
  let t = 0;
  while (t < max && M(p).y > untilY) { tick(); t += DT; if (M(p).fuel <= 0 && M(p).ground) break; }
  return t;
}
function lift(rider, toCol) {   // Lufi felvisz valakit a fején: Lufi a fal tövében, a lovas ráugrik
  walk(3, toCol);
  walk(rider, toCol - 1);
  P[rider].x = 1; P[rider].b = true; tick(0.12); P[rider].b = false;
  let t = 0; while (t < 1.5 && M(rider).on !== M(3)) { P[rider].x = Math.sign(cx(3) - cx(rider)) * 0.5; tick(); t += DT; }
  neutral(rider); tick(0.3);
  const ok = M(rider).on === M(3);
  P[3].b = true; P[3].x = 1;
  t = 0; while (t < 2.5) { if (t > 0.5) P[rider].x = 1; tick(); t += DT; if (t > 0.6 && M(rider).ground && M(rider).on !== M(3)) break; }
  neutral(3); neutral(rider); tick(1.2);
  return ok;
}

const SCRIPTS = {
  1() { walk(1, 11); walk(2, 24); walk(3, 26); walk(4, 19); walk(1, 22); walk(4, 28); },
  2() { walk(1, 15); tick(1); walk(2, 14); walk(3, 15); walk(4, 16); walk(1, 17); walk(2, 23); walk(3, 25); walk(4, 27); walk(1, 18); },
  3() { walk(2, 2); walk(1, 20); walk(2, 24); walk(3, 26); walk(4, 28); walk(1, 22); },
  4() { walk(3, 8); float(3, 8 * T + 60); pull(3); neutral(3); tick(1.5); walk(1, 18); walk(2, 20); walk(3, 22); walk(4, 24); },
  5() {
    walk(4, 10); press(4); tick(1.2);
    for (const p of [1, 2, 3, 4]) { walk(p, 10); climb(p, 1); walk(p, 12 + p); }
    walk(4, 17); press(4); tick(1);
    walk(1, 22); walk(2, 24); walk(3, 26); walk(4, 28);
  },
  6() {
    for (const r of [2, 4, 1]) lift(r, 13);
    walk(3, 8); tick(0.5);   // Lufi lent a gombon: nyitva a kapu; Kavics a túloldali gombra áll
    walk(2, 26); walk(4, 28); walk(1, 23);
    walk(3, 13); float(3, 580, 1); neutral(3); tick(1); walk(3, 27); walk(1, 25);
  },
  7() { walk(4, 9, 15); walk(4, 12); walk(1, 18, 20); walk(1, 22); walk(2, 24); walk(3, 26); walk(4, 28); },
  8() { walk(1, 11); walk(2, 2); walk(3, 20); walk(4, 28); walk(1, 22); walk(2, 24); walk(3, 26); },
  9() {
    walk(4, 6); press(4); tick(1.2);
    for (const p of [1, 2, 3, 4]) walk(p, 14);
    walk(3, 15); float(3, 9 * T + 60); pull(3); neutral(3); tick(1.5);
    walk(4, 18); press(4); tick(1.2);
    for (const p of [1, 2, 3, 4]) { walk(p, 18); climb(p, 1); walk(p, 19 + p); }
    walk(1, 22); walk(2, 24); walk(3, 26); walk(4, 28);
  },
  10() {
    walk(1, 7); walk(2, 11); walk(4, 14); press(4); tick(1.2); walk(3, 13); walk(1, 12);
    for (const p of [4, 3, 1, 2]) { walk(p, 14); climb(p, 1); walk(p, 15); walk(p, 15 + (p % 2)); }
    walk(4, 16); press(4); tick(1);
    walk(3, 23); float(3, 3 * T + 60); pull(3); neutral(3); tick(1.5);
    walk(1, 22); walk(4, 22);
    walk(2, 21); tick(0.8);
    walk(1, 25); walk(3, 26); walk(4, 27); walk(2, 22);
  },
};

export function run(n) {
  window.__mano.go(n); window.__mano.join(1, 2, 3, 4); tick(0.5);
  try { SCRIPTS[n](); } catch (e) { return `${n}: HIBA ${e.message}`; }
  tick(0.2);
  const ok = G.phase === 'win';
  const where = [1, 2, 3, 4].map((p) => `${p}@${(cx(p) / T).toFixed(1)},${((M(p).y + M(p).h) / T).toFixed(1)}`).join(' ');
  return `${n}. ${G.L.name}: ${ok ? 'MEGOLDVA' : 'NEM SIKERÜLT'}${ok ? '' : ' · ' + where}`;
}
export function runAll() { const out = []; for (let n = 1; n <= 10; n++) out.push(run(n)); return out.join('\n'); }
