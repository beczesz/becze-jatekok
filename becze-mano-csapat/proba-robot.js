// Próba-robot: szkriptelt bemenettel végigjátssza a pályákat, hogy kiderüljön, megoldhatók-e.
// Használat a kivetítő konzoljában (screen.html?helyi=1): const m = await import('./proba-robot.js'); m.runAll()
// A robot ugyanazt a kart és gombot nyomja, amit a telefon küldene; a pályákon semmit nem teleportál.
const { G, P, step } = window.__mano;
const T = 64, DT = 1 / 60;
const tick = (sec = DT) => step(sec);
const M = (p) => G.manos[p];
const cx = (p) => M(p).x + M(p).w / 2;
const cy = (p) => M(p).y + M(p).h / 2;
const GROUND = 14 * T;   // a legtöbb pályán a padló teteje
const neutral = (p) => Object.assign(P[p], { x: 0, y: 0, b: false, k: false });

function walk(p, col, max = 12) {   // a kar oldalra, amíg oda nem ér; elakadásnál ugrik
  const target = col * T + T / 2;
  let t = 0, last = cx(p), still = 0;
  while (t < max) {
    const d = target - cx(p);
    if (Math.abs(d) < 6) break;
    P[p].x = Math.sign(d) * (Math.abs(d) < 20 ? 0.4 : 1);
    if (Math.abs(cx(p) - last) < 0.3) still += DT; else still = 0;
    last = cx(p);
    P[p].b = still > 0.15;
    tick(); t += DT;
  }
  neutral(p); tick(0.4);
  return Math.abs(target - cx(p)) < 10;
}
function press(p) { P[p].b = true; tick(DT * 3); P[p].b = false; tick(0.2); }
function grow(p) { P[p].k = true; tick(DT * 3); P[p].k = false; tick(0.2); }   // Indás INDA gombja
function climb(p, dirX, surfaceY, max = 8) {   // fel az indán; ha a talpa a surfaceY fölé ért, oldalra lép
  let t = 0; const y0 = M(p).y;
  P[p].y = -1; P[p].x = 0;
  while (t < max) {
    if (M(p).y + M(p).h < surfaceY - 6) P[p].x = dirX;
    tick(); t += DT;
    if (M(p).ground && y0 - M(p).y > T * 3) break;
  }
  neutral(p); tick(0.4);
}
// Indás indát növeszt a col oszlopban; mindenki felmászik rajta, és rögtön a céljához megy (ne álljanak egymás fején)
function vineUp(order, col, dirX, surfaceY, dest) {
  walk(4, col); grow(4); walk(4, col - 2 * dirX); tick(0.5);   // Indás félreáll, a végén mászik fel
  for (const p of [...order.filter((q) => q !== 4), 4]) {
    if (p === 4 && !(G.vines.length && G.vines[G.vines.length - 1].life > 12)) { walk(4, col); grow(4); tick(1.5); }
    walk(p, col); climb(p, dirX, surfaceY); walk(p, dest[p]);
  }
}
function fly(untilY, dirX = 0, max = 6) {   // Kopter: nyomva tartott gombbal emelkedik
  P[3].b = true; P[3].x = dirX;
  let t = 0;
  while (t < max && M(3).y > untilY) { tick(); t += DT; }
  return t;
}
function hover(y, dirX, sec) {   // Kopter: egy magasságot tart (a gombot nyomkodja), közben a kar oldalra
  for (let t = 0; t < sec; t += DT) { P[3].b = M(3).y > y; P[3].x = dirX; tick(); }
  P[3].x = 0;
}
// Kopter: egy magasságot tart, és vízszintesen egy pont fölé áll
function hoverTo(y, x, sec) {
  for (let t = 0; t < sec; t += DT) { const d = x - cx(3); P[3].b = M(3).y > y; P[3].x = Math.abs(d) < 6 ? 0 : Math.sign(d) * (Math.abs(d) < 40 ? 0.3 : 1); tick(); }
  P[3].x = 0;
}
// Kopter-lánc: a Kopter felszáll, sorban a riders fölé áll, azok beleugranak (a második az elsőbe), aztán átviszi őket
function chainCarry(riders, toCol, cruiseY) {
  const base = GROUND - 230;
  for (const p of riders) {
    hoverTo(base, cx(p), 2);
    press(p); tick(0.3);
  }
  const ok = riders.every((p) => M(p).hang);
  hoverTo(cruiseY, cx(3), 2.5);
  hoverTo(cruiseY, toCol * T + T / 2, 6);
  hoverTo(GROUND - 260, toCol * T + T / 2, 2.5);   // le, hogy a kapaszkodók közel legyenek a földhöz
  for (const p of [...riders].reverse()) { P[p].y = 1; tick(DT * 3); neutral(p); tick(0.6); }
  P[3].b = false; P[3].y = 1; for (let t = 0; t < 4 && !M(3).ground; t += DT) tick(); neutral(3); tick(0.3);
  return ok;
}
// Kavics kötélnyila: célzás egy pontra, lövés, várakozás, amíg a kötél megakad
function shoot(tx, ty) {
  const dx = tx - cx(1), dy = ty - cy(1), d = Math.hypot(dx, dy);
  P[1].x = dx / d; P[1].y = dy / d; P[1].k = true; tick(DT * 2); P[1].k = false; P[1].x = 0; P[1].y = 0;
  let t = 0; while (t < 1 && !M(1).rope) { tick(); t += DT; }
  tick(DT * 2);
  return !!M(1).rope;
}
function ropeLen(dir, sec) { P[1].y = dir; tick(sec); P[1].y = 0; }   // -1: felmászik, 1: leereszkedik
function settle(sec) { neutral(1); tick(sec); }

const SCRIPTS = {
  1() {
    vineUp([4, 3, 2, 1], 13, 1, 3 * T, { 1: 22, 2: 24, 3: 26, 4: 28 });
  },
  2() {
    walk(2, 9);
    for (let i = 0; i < 4; i++) { press(2); tick(0.05); }
    P[2].x = -1; press(2); P[2].x = -1; tick(1.2); neutral(2); tick(1);
    walk(1, 22); walk(2, 24); walk(3, 26); walk(4, 28);
  },
  3() {
    // Kavics: kampóról kampóra, a kar a középső kampó alatti emelvényen, a végén a falba lő, és leereszkedik
    const hookY = 4 * T - 3;
    shoot(7.5 * T, hookY); ropeLen(-1, 3); settle(2);
    shoot(11.5 * T, hookY); settle(4); ropeLen(-1, 2); settle(1.5);
    shoot(15.5 * T, hookY); settle(4); ropeLen(-1, 2); settle(1);
    P[1].y = 1; for (let t = 0; t < 4 && !M(1).ground; t += DT) tick(); settle(0.5);   // le az emelvényre: a kar átbillen
    ropeLen(-1, 2.5); settle(1.5);
    shoot(19.5 * T, hookY); settle(4); ropeLen(-1, 2); settle(1.5);
    shoot(21 * T + 2, 6 * T); settle(2.5);
    P[1].y = 1; for (let t = 0; t < 4 && !M(1).ground; t += DT) tick(); settle(0.5);
    P[1].b = true; tick(DT * 2); P[1].b = false; tick(1);   // elengedi a kötelet
    // a többiek a Kopter-láncon
    chainCarry([2, 4], 20, 6 * T);
    walk(1, 22); walk(2, 24); walk(4, 28); walk(3, 26);
  },
  4() {
    vineUp([4, 3, 2, 1], 16, 1, 4 * T, { 1: 18, 2: 20, 3: 22, 4: 24 });
  },
  5() {
    walk(2, 2); walk(1, 10); tick(0.5);
    walk(3, 17); walk(4, 18); tick(0.3);
    walk(1, 22); walk(2, 24); walk(3, 26); walk(4, 28);
  },
  6() {
    vineUp([4, 3, 2, 1], 10, 1, 3 * T, { 1: 12, 2: 14, 3: 16, 4: 18 });
  },
  7() {
    walk(1, 7); walk(4, 16); tick(0.3);
    walk(3, 22); fly(6 * T - 10); P[3].x = 1; tick(0.4); P[3].x = 0; P[3].b = false; tick(1.5);
    walk(3, 27); walk(3, 25);
    walk(4, 27); walk(1, 21); walk(2, 23);
  },
  8() {
    fly(4 * T - 20);
    for (let t = 0; t < 4 && Math.abs(cx(3) - 14.5 * T) > 8; t += DT) { P[3].b = M(3).y > 4 * T - 30; P[3].x = Math.sign(14.5 * T - cx(3)) * (Math.abs(14.5 * T - cx(3)) < 30 ? 0.3 : 1); tick(); }
    neutral(3); tick(2);
    walk(4, 7); grow(4); tick(1.5); climb(4, -1, 5 * T); walk(4, 5); tick(0.3);
    walk(1, 25); walk(1, 22); walk(2, 24);
    walk(4, 28);
    walk(3, 17); P[3].y = 1; for (let t = 0; t < 4 && !M(3).ground; t += DT) tick(); neutral(3); walk(3, 26);
  },
  9() {
    walk(4, 19); grow(4); tick(2);
    walk(4, 17);
    walk(1, 19); climb(1, 1, 7 * T); walk(1, 22); tick(0.3);
    walk(2, 22); walk(3, 24); walk(4, 26);
    walk(1, 24);
  },
  10() {
    walk(3, 24); fly(4); P[3].x = -1; tick(0.5); P[3].x = 0; tick(0.1); walk(3, 22); P[3].b = false; tick(1.5);
    walk(2, 11); P[2].x = 1; for (let i = 0; i < 5; i++) { press(2); P[2].x = 0.35; tick(0.02); } P[2].x = 0; tick(1); walk(2, 13);
    walk(4, 7); grow(4); tick(1.5);
    walk(1, 7); climb(1, -1, 5 * T); walk(1, 5);
    walk(4, 11); grow(4); tick(1.5); climb(4, 1, 7 * T); walk(4, 21);
  },
};

export function run(n) {
  window.__mano.go(n); window.__mano.join(1, 2, 3, 4); for (const p of [1, 2, 3, 4]) neutral(p); tick(0.5);
  try { SCRIPTS[n](); } catch (e) { return `${n}: HIBA ${e.message}`; }
  tick(0.2);
  const ok = G.phase === 'win';
  const where = [1, 2, 3, 4].map((p) => `${p}@${(cx(p) / T).toFixed(1)},${((M(p).y + M(p).h) / T).toFixed(1)}`).join(' ');
  return `${n}. ${G.L.name}: ${ok ? 'MEGOLDVA' : 'NEM SIKERÜLT'}${ok ? '' : ' · ' + where}`;
}
export function runAll() { const out = []; for (let n = 1; n <= 10; n++) out.push(run(n)); out.push(kepessegek()); return out.join('\n'); }

// A képességek külön próbája a 6. pályán (égi pálya, nagy szabad tér; a kiinduló helyzetet itt odatesszük, a mozgást a gombok adják)
const top = (p) => M(p).y / T;
function fresh() { window.__mano.go(6); window.__mano.join(1, 2, 3, 4); for (const p of [1, 2, 3, 4]) neutral(p); tick(0.6); }
function placeOn(p, base) { M(p).x = M(base).x + (M(base).w - M(p).w) / 2; M(p).y = M(base).y - M(p).h - 1; M(p).vy = 0; tick(0.4); }
export function kepessegek() {
  const out = [];
  const ok = (name, cond, info) => out.push(`${cond ? 'OK  ' : 'HIBA'} ${name}${info ? ' · ' + info : ''}`);
  // Indás: inda bárhol, nő felfelé az égbe, 30 mp után elsorvad
  fresh();
  const y4 = top(4); grow(4); tick(4);
  const v = G.vines[0];
  ok('Indás indája az égbe nő', v && v.top < -5, v ? `teteje a ${v.top}. sorban (a pálya teteje a 0.)` : 'nincs inda');
  P[4].y = -1; tick(3); neutral(4); tick(0.1);
  ok('Indás felmászik az indán', y4 - top(4) > 5, `${(y4 - top(4)).toFixed(1)} csempét mászott`);
  tick(30);
  ok('az inda 30 mp után elsorvad', G.vines.length === 0 && v && Object.values(G.sky).every((t) => t !== 'v'));
  // Fürge: legfeljebb öt ugrás
  fresh();
  const y2 = top(2); let best = y2;
  for (let i = 0; i < 8; i++) { press(2); tick(0.1); best = Math.min(best, top(2)); }
  for (let i = 0; i < 30; i++) { tick(0.02); best = Math.min(best, top(2)); }
  ok('Fürge öt ugrás után elfárad', y2 - best > 6 && y2 - best < 11, `${(y2 - best).toFixed(1)} csempe magasra jutott 8 gombnyomással`);
  // Kopter: egyedül csak a pálya tetejéig
  fresh();
  P[3].b = true; tick(5); const alone = M(3).y; P[3].b = false;
  ok('Kopter egyedül nem megy az égbe', alone >= -2, `legfeljebb y=${alone.toFixed(0)}`);
  // kapaszkodás, felrepülés az égbe, lezuhanás
  fresh();
  walk(3, 9); walk(2, 9);
  hover(GROUND - 230, 0, 1.2);
  press(2); tick(0.2);
  const hung = M(2).hang === M(3);
  hover(-1200, 0, 8);
  ok('Fürge belekapaszkodik a Kopterbe', hung);
  ok('lánccal a Kopter az égbe repül', M(3).y < -800, `${Math.round(-M(3).y / T)} csempével a pálya fölött`);
  P[3].b = true; press(2); tick(0.2);
  ok('ha fent valaki elenged, az egész lánc zuhan', M(3).stall === true);
  P[3].b = false; tick(8);
  ok('mindenki leér', M(3).ground && M(2).ground && !M(3).stall);
  // propeller: aki a Kopter tetejére ugrik, azt ledobja
  fresh();
  placeOn(4, 3); tick(0.3);
  ok('a propeller ledobja, aki a Kopterre áll', M(4).on !== M(3) && M(4).y + M(4).h < M(3).y - 20 || M(4).x + M(4).w < M(3).x || M(4).x > M(3).x + M(3).w);
  // Kavics: nyíl, kötél, inga
  window.__mano.go(3); window.__mano.join(1, 2, 3, 4); for (const p of [1, 2, 3, 4]) neutral(p); tick(0.6);
  const hooked = shoot(7.5 * T, 4 * T - 2);
  ok('Kavics nyila megakad a kampón', hooked);
  ropeLen(-1, 3); settle(1);
  const yr = cy(1);
  ok('Kavics felmászik a kötélen', yr < 6 * T, `a középpontja a ${(yr / T).toFixed(1)}. sorban`);
  shoot(11.5 * T, 4 * T - 2);
  let minX = cx(1), maxX = cx(1);
  for (let i = 0; i < 180; i++) { tick(); minX = Math.min(minX, cx(1)); maxX = Math.max(maxX, cx(1)); }
  ok('Kavics leng, mint egy inga', maxX - minX > 3 * T, `${((maxX - minX) / T).toFixed(1)} csempe széles lengés`);
  // kar érintésre
  run(7);
  ok('a kar átbillen, ha a Kopter hozzáér, és úgy marad', G.levers.c === true);
  // tűzijáték: ha legalább ketten Kavicson állnak
  fresh();
  placeOn(4, 1); placeOn(2, 4);
  P[1].b = true; tick(DT * 2); P[1].b = false;
  ok('tűzijáték, ha ketten Kavicson állnak', G.boom > 0);
  return out.join('\n');
}
