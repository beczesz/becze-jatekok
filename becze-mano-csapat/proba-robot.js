// Próba-robot: szkriptelt bemenettel végigjátssza a pályákat, hogy kiderüljön, megoldhatók-e.
// Használat a kivetítő konzoljában (screen.html?helyi=1): const m = await import('./proba-robot.js'); m.runAll()
// A robot ugyanazt a kart és gombot nyomja, amit a telefon küldene; semmit nem teleportál.
const { G, P, step } = window.__mano;
const T = 64, DT = 1 / 60;
const tick = (sec = DT) => step(sec);
const M = (p) => G.manos[p];
const cx = (p) => M(p).x + M(p).w / 2;
const neutral = (p) => Object.assign(P[p], { x: 0, y: 0, b: false, k: false });

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
function grow(p) { P[p].k = true; tick(DT * 3); P[p].k = false; tick(0.2); }   // Indás INDA gombja
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
function float(p, untilY, dirX = 0, max = 3) {   // Kopter: nyomva tartott gombbal emelkedik
  P[p].b = true; P[p].x = dirX;
  let t = 0;
  while (t < max && M(p).y > untilY) { tick(); t += DT; }
  return t;
}
function lift(rider, toCol) {   // Kopter felvisz valakit a fején: a fal tövében áll, a lovas ráugrik
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
    walk(4, 10); grow(4); tick(1.2);
    for (const p of [1, 2, 3, 4]) { walk(p, 10); climb(p, 1); walk(p, 12 + p); }
    walk(4, 17); grow(4); tick(1);
    walk(1, 22); walk(2, 24); walk(3, 26); walk(4, 28);
  },
  6() {
    for (const r of [2, 4, 1]) lift(r, 13);
    walk(3, 8); tick(0.5);   // Kopter lent a gombon: nyitva a kapu; Kavics a túloldali gombra áll
    walk(2, 26); walk(4, 28); walk(1, 23);
    walk(3, 13); float(3, 580, 1); neutral(3); tick(1); walk(3, 27); walk(1, 25);
  },
  7() { walk(4, 9, 15); walk(4, 12); walk(1, 18, 20); walk(1, 22); walk(2, 24); walk(3, 26); walk(4, 28); },
  8() { walk(1, 11); walk(2, 2); walk(3, 20); walk(4, 28); walk(1, 22); walk(2, 24); walk(3, 26); },
  9() {
    walk(4, 6); grow(4); tick(1.2);
    for (const p of [1, 2, 3, 4]) walk(p, 14);
    walk(3, 15); float(3, 9 * T + 60); pull(3); neutral(3); tick(1.5);
    walk(4, 18); grow(4); tick(1.2);
    for (const p of [1, 2, 3, 4]) { walk(p, 18); climb(p, 1); walk(p, 19 + p); }
    walk(1, 22); walk(2, 24); walk(3, 26); walk(4, 28);
  },
  10() {
    walk(1, 7); walk(2, 11); walk(4, 14); grow(4); tick(1.2); walk(3, 13); walk(1, 12);
    for (const p of [4, 3, 1, 2]) { walk(p, 14); climb(p, 1); walk(p, 15); walk(p, 15 + (p % 2)); }
    walk(1, 15); walk(2, 15);   // le a Kopter tetejéről, különben a Kopter magával viszi őket
    walk(4, 16); grow(4); tick(1);
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
export function runAll() { const out = []; for (let n = 1; n <= 10; n++) out.push(run(n)); out.push(kepessegek()); return out.join('\n'); }

// A négy képesség külön próbája az 1. pályán (a kiinduló helyzetet itt odatesszük, a mozgást a gombok adják)
const top = (p) => M(p).y / T;
function fresh() { window.__mano.go(1); window.__mano.join(1, 2, 3, 4); for (const p of [1, 2, 3, 4]) neutral(p); tick(0.6); }
function placeOn(p, base) { M(p).x = M(base).x + (M(base).w - M(p).w) / 2; M(p).y = M(base).y - M(p).h - 1; M(p).vy = 0; tick(0.4); }
export function kepessegek() {
  const out = [];
  const ok = (name, cond, info) => out.push(`${cond ? 'OK  ' : 'HIBA'} ${name}${info ? ' · ' + info : ''}`);
  // Indás: inda bárhol, felmászás, 30 mp után elsorvad
  fresh();
  const y4 = top(4); grow(4);
  const v = G.vines[0];
  ok('Indás indát növeszt', v && v.cells.length >= 4, v ? `${v.cells.length} csempe magas` : 'nincs inda');
  P[4].y = -1; tick(2.5); neutral(4); tick(0.1);
  ok('Indás felmászik az indán', y4 - top(4) > 3, `${(y4 - top(4)).toFixed(1)} csempét mászott`);
  tick(31);
  ok('az inda 30 mp után elsorvad', G.vines.length === 0 && v && G.grid[v.cells[1].r][v.c] !== 'v');
  // Fürge: többszörös ugrás
  fresh();
  const y2 = top(2); let best = y2;
  for (let i = 0; i < 5; i++) { press(2); tick(0.1); best = Math.min(best, top(2)); }
  for (let i = 0; i < 30; i++) { tick(0.02); best = Math.min(best, top(2)); }
  ok('Fürge a levegőben is ugrik', y2 - best > 5, `${(y2 - best).toFixed(1)} csempe magasra jutott (egy ugrás kb. 2,3)`);
  // Kopter: repül, bármeddig
  fresh();
  const y3 = top(3); P[3].b = true; tick(2.5); const flown = y3 - top(3); P[3].b = false;
  tick(1); const after = y3 - top(3);
  ok('Kopter repül, amíg nyomja', flown > 5, `${flown.toFixed(1)} csempe 2,5 mp alatt`);
  ok('Kopter elengedve lassan ereszkedik', after > 1.5 && after < flown, `1 mp után még ${after.toFixed(1)} csempe magasan`);
  // kapaszkodás: Fürge a Kopter alá ugrik, belekapaszkodik, a Kopter felviszi, leugrik
  fresh();
  M(3).x = M(2).x + (M(2).w - M(3).w) / 2; M(3).y = M(2).y - T * 1.9; M(3).vy = 0;
  P[3].b = true; tick(0.05); P[3].b = false;
  press(2); tick(0.2);
  const hung = M(2).hang === M(3);
  const yh = top(2); P[3].b = true; tick(1.5); P[3].b = false;
  ok('Fürge belekapaszkodik a Kopterbe', hung);
  ok('a Kopter viszi a kapaszkodót', yh - top(2) > 2, `${(yh - top(2)).toFixed(1)} csempét emelte`);
  press(2); tick(0.1);
  ok('leugrás a Kopterről', M(2).hang === null);
  // Kavics felröpíti, aki rajta áll
  fresh();
  placeOn(2, 1);
  const onK = M(2).on === M(1), yk = top(2); let hi = yk;
  press(1); for (let i = 0; i < 60; i++) { tick(0.02); hi = Math.min(hi, top(2)); }
  ok('Kavics felröpíti Fürgét', onK && yk - hi > 6, `${(yk - hi).toFixed(1)} csempe magasra`);
  // tűzijáték: mindenki Kavicson áll
  fresh();
  placeOn(3, 1); placeOn(4, 3); placeOn(2, 4);
  const stacked = M(3).on === M(1) && M(4).on === M(3) && M(2).on === M(4);
  P[1].b = true; tick(DT * 2); P[1].b = false;
  const boom = G.boom > 0, vxs = [2, 3, 4].map((p) => Math.round(M(p).vx));
  tick(0.3);
  ok('tűzijáték, ha mindenki Kavicson áll', stacked && boom && new Set(vxs.map(Math.sign)).size >= 2, `vx: ${vxs.join(', ')}`);
  return out.join('\n');
}
