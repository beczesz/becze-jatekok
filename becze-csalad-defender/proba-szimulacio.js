// Egyensúly-szimuláció a proba.html konzoljából:
//   await import('/proba-szimulacio.js'); await runSim({ n: 4, gyenge: [3], ease: { 3: 'easy' } })
// n: játékosszám; gyenge: akik csak íjászt raknak és nem fejlesztenek; ease: nehézség játékosonként.
// Az okos játékosok a varázspálca receptje szerint építenek, fejlesztenek, a gyengébbet segítik, a fölösleget a kincstárba adják.
// vegtelen: a 10. hullám után a végtelen módban folytatja, amíg háromszor egymás után el nem bukik ugyanannál a hullámnál.
window.runSim = async function ({ n = 3, gyenge = [], ease = {}, segit = true, vegtelen = false } = {}) {
  const W = document.querySelector('.screen iframe').contentWindow;
  const V = W.__varvedok;
  const R = await import('/rules.js');
  const ch = new BroadcastChannel('varvedok-v1');
  const s = (p, type, extra = {}) => ch.postMessage({ kind: 'in', p, type, ...extra });
  const tick = () => new Promise((r) => setTimeout(r, 60));
  const ids = R.PLAYER_IDS.slice(0, n);
  const role = (p) => R.defaultRole(p);
  const hello = () => ids.forEach((p) => s(p, 'hello', { ease: ease[p] || 'normal', role: role(p) }));

  // Okos játékos: a varázspálca szerint épít, a legolcsóbb fejlesztést veszi; gyenge: csak íjász, nem fejleszt.
  function spend(p) {
    const S = V.state; let g = S.players[p].gold; const T = S.towers[p];
    const weak = gyenge.includes(p);
    for (let i = 0; i < 6; i++) {
      if (!T[i]) { const k = weak ? 'archer' : R.WAND_RECIPES[role(p)][i]; const c = R.towerCost(k, role(p)); if (g >= c) { s(p, 'build', { slot: i, tower: k }); g -= c; } else return; }
    }
    if (weak) return;
    const ups = (lane) => S.towers[lane].map((t, i) => [t, i, t ? R.upgradeCost(t.type, t.lvl, role(lane)) : null]).filter(([t, , c]) => c != null).sort((a, b) => a[2] - b[2]);
    for (const [, i, c] of ups(p)) { if (g >= c) { s(p, 'upgrade', { slot: i, lane: p }); g -= c; } }
    if (segit) for (const q of gyenge) for (const [, i, c] of ups(q)) { if (g >= c + 20) { s(p, 'upgrade', { slot: i, lane: q }); g -= c; } }
    while (g >= 200) { s(p, 'gift', { to: 0 }); g -= R.GIFT; }
  }

  const log = [];
  let losses = 0, streak = 0, lastLose = 0, best = 0;
  hello(); await tick();
  s(1, 'start'); await tick();
  for (let round = 0; round < 200; round++) {
    const S = V.state;
    if (S.phase === 'win') { if (vegtelen && !S.endless) { s(1, 'endless'); await tick(); continue; } break; }
    if (S.phase === 'lose') {
      losses++; streak = S.wave === lastLose ? streak + 1 : 1; lastLose = S.wave;
      log.push(`  VESZTETT a(z) ${S.wave}. hullámban (düh ${S.rage})`);
      if ((!vegtelen && losses > 6) || streak >= 3) break;
      s(1, 'restart'); await tick(); continue;
    }
    if (S.phase === 'build') {
      for (const p of ids) spend(p);
      await tick(); hello(); ids.forEach((p) => s(p, 'ready')); await tick(); V.step(0.1);
      for (let k = 0; k < 40 && V.state.phase === 'build'; k++) V.step(1);  // ha valaki nem nyomott Készt, kivárjuk az órát
    }
    const hp0 = V.state.hp, w = V.state.wave;
    for (let k = 0; k < 20 && V.state.phase === 'wave'; k++) {
      V.step(6); hello();
      if (V.state.bolt >= R.boltMax(n)) ids.forEach((p) => s(p, 'bolt'));
      await tick();
    }
    if (V.state.phase !== 'lose') best = Math.max(best, w);
    if (V.state.phase !== 'lose') log.push(`w${w} 🔥${V.state.rage} ${V.state.theme || ''}: -${hp0 - V.state.hp} szív (${V.state.hp}/${V.state.maxHp}), várszint ${V.state.tLevel}, arany ${ids.map((p) => V.state.players[p].gold)}`);
  }
  log.push(`VÉGE: ${V.state.phase}, legjobb teljesített hullám ${best}, vereség ${losses}x, érmek: ${(V.state.medals || []).map((m) => R.PLAYERS[m.p].icon + m.icon).join(' ')}`);
  return log.join('\n');
};
