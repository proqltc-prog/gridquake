// Tuning bot for campaign levels. It plays each level many times with the real game rules
// (the core of index.html between /*CORE-START*/ and /*CORE-END*/).
//
//   node scripts/tune-bot.mjs calibrate 1-20     compare the bot with the tuned levels (TUNE)
//   node scripts/tune-bot.mjs tune 181-200       tune levels: obstacle scale, moves and star limits
//
// Method (concept "Afstelling"): the bot plays every level 24 times; the obstacle scale is changed until
// a level is won (nearly) always and takes about 20-40 moves. Moves = 75th percentile of the bot +10%
// (tougher levels tighter). Star limits come from the bot scores, lowered for human players.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const core = html.slice(html.indexOf('/*CORE-START*/'), html.indexOf('/*CORE-END*/'));
const G = new Function('tx', core + ';return {newState,applyMove,refillG,rerollTray,trayStuck,fitsG,makeLevel,goalLeft,levelWon,N,MAPSIZE,MOVE_BONUS,TUNE,LSCALE,tuneNo};')(x => x);
const { N } = G;

const GAMES = 24, MAX_MOVES = 120;
// calibrated so the bot gives the same limits as the tuned maps 1-4 (node scripts/tune-bot.mjs calibrate 1-80)
const K = { mn: 1.23, mt: 1.12, s2: 1.1, s3: 1.15 };
const clone = st => ({ ...st, mode: 'tut', lvl: { ...st.lvl, moss: 0 }, grid: st.grid.map(r => r.map(x => x && { ...x })),
  ice: st.ice.map(r => r.slice()), paint: st.paint.map(r => r.slice()), tray: st.tray.slice(),
  stats: { ...st.stats, made: { ...st.stats.made } } });

// how good a board is for the bot: goal progress first, then a tidy board
function value(st, rep, before) {
  let v = rep.gain / 100;
  st.lvl.goals.forEach((g, j) => { v += (before[j] - G.goalLeft(st, g)) * (g.t === 'score' ? 0.02 : 220); });
  let filled = 0, holes = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const x = st.grid[r][c];
    if (x && !x.hole) filled++;
    if (!x) { let s = 0; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => { const R = r + a, K = c + b; if (R < 0 || K < 0 || R >= N || K >= N || st.grid[R][K]) s++; }); if (s === 4) holes++; }
    if (x && x.crystal) { v += r * 18; for (let d = r + 1; d < N; d++) if (st.grid[d][c]) v -= 9; }
    if (x && x.bomb) v -= (12 - Math.min(12, x.bomb)) * 6;
  }
  return v - filled * 3 - holes * 9;
}
function moves1(st, before) {
  const out = [];
  for (let i = 0; i < 3; i++) { const p = st.tray[i]; if (!p) continue;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { if (!G.fitsG(st, p, r, c)) continue;
      const cl = clone(st), rep = G.applyMove(cl, i, r, c); out.push({ m: [i, r, c], v: value(cl, rep, before), st: cl }); } }
  return out;
}
// one step ahead: the best first moves are judged together with the best place for a block that is left
function bestMove(st) {
  const before = st.lvl.goals.map(g => G.goalLeft(st, g));
  const first = moves1(st, before).sort((x, y) => y.v - x.v).slice(0, 8);
  let best = null, bv = -Infinity;
  for (const f of first) {
    let tot = f.v;
    if (f.st.tray.some(Boolean)) {
      const b2 = f.st.lvl.goals.map(g => G.goalLeft(f.st, g)), nxt = moves1(f.st, b2);
      tot += nxt.length ? 0.9 * Math.max(...nxt.map(x => x.v)) : -2000;
    }
    if (tot > bv) { bv = tot; best = f.m; }
  }
  return best;
}
function play(lv, seed) {
  const st = G.newState({ mode: 'camp', seed, lvl: lv });
  G.refillG(st); if (G.trayStuck(st)) G.rerollTray(st);
  for (let moves = 0; moves < MAX_MOVES; moves++) {
    if (G.levelWon(st)) return { won: true, moves, score: st.score };
    if (st.boom || st.overflow) return { won: false, moves };
    const m = bestMove(st); if (!m) return { won: false, moves, stuck: true };
    G.applyMove(st, ...m);
  }
  return G.levelWon(st) ? { won: true, moves: MAX_MOVES, score: st.score } : { won: false, moves: MAX_MOVES };
}
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : 0; };
const r500 = v => Math.max(500, Math.round(v / 500) * 500);
function runLevel(n, sc, vr) {
  const scale = sc == null ? undefined : { [G.tuneNo(n)]: sc };
  const lv0 = G.makeLevel(n, scale, vr), out = [];
  for (let k = 0; k < GAMES; k++) out.push(play(G.makeLevel(n, scale, vr), (lv0.seed ^ (k * 0x9e3779b1)) >>> 0));
  const wins = out.filter(o => o.won);
  return { lv: lv0, rate: wins.length / GAMES, moves: wins.map(o => o.moves), scores: wins.map(o => o.score) };
}
// moves and star limits from the bot results
function limits(lv, res) {
  const tough = lv.hard || lv.boss;
  const M = Math.max(12, Math.min(50, Math.ceil(pct(res.moves, 0.75) * (tough ? K.mt : K.mn))));
  const fin = res.moves.map((m, j) => res.scores[j] + Math.max(0, M - m) * G.MOVE_BONUS).filter((_, j) => res.moves[j] <= M);
  return [M, r500(pct(fin, 0.5) * K.s2), r500(pct(fin, 0.75) * K.s3)];
}

const [mode, range = '181-200'] = process.argv.slice(2);
const [a, b] = range.split('-').map(Number);
if (mode === 'calibrate') {
  for (let n = a; n <= (b || a); n++) {
    const res = runLevel(n), lv = res.lv, mine = limits(lv, res), tuned = G.TUNE[G.tuneNo(n) - 1];
    console.log(`L${n} win ${(res.rate * 100).toFixed(0)}% p50 ${pct(res.moves, .5)} | bot ${mine.join('/')} | tuned ${tuned.join('/')}`);
  }
} else if (mode === 'verify') {
  // check the finished tuning with other games than the ones it was tuned with: win rate within the move limit
  for (let n = a; n <= (b || a); n++) {
    const lv = G.makeLevel(n), res = [];
    for (let k = 0; k < 48; k++) res.push(play(G.makeLevel(n), (lv.seed ^ ((k + 1000) * 0x85ebca6b)) >>> 0));
    const inTime = res.filter(o => o.won && o.moves <= lv.moves), sc = inTime.map(o => o.score + (lv.moves - o.moves) * G.MOVE_BONUS);
    const s2 = sc.filter(x => x >= lv.stars[0]).length, s3 = sc.filter(x => x >= lv.stars[1]).length;
    console.log(`L${n} moves ${lv.moves} | won in time ${(inTime.length / 48 * 100).toFixed(0)}% | p50 ${pct(inTime.map(o => o.moves), .5)} | ★★ ${(s2 / 48 * 100).toFixed(0)}% ★★★ ${(s3 / 48 * 100).toFixed(0)}%`);
  }
} else if (mode === 'tune') {
  // every level tries a grid of obstacle scales and 3 layouts; the winner is (nearly) always won
  // and its median length is closest to the target: easy 22, normal 28, tough 34, boss 36 moves
  const SCALES = [0.4, 0.55, 0.7, 0.85, 1, 1.2, 1.45, 1.75, 2.1], xt = [], xs = {}, xv = {};
  for (let n = a; n <= b; n++) {
    const lv1 = G.makeLevel(n), target = lv1.boss ? 36 : lv1.hard ? 34 : lv1.easy ? 22 : 28;
    let best = null;
    for (const vr of [0, 1, 2]) for (const sc of SCALES) {
      const res = runLevel(n, sc, vr), p50 = pct(res.moves, 0.5);
      const cost = (res.rate < 0.9 ? 100 + (0.9 - res.rate) * 200 : 0) + Math.abs(p50 - target) + (p50 < 20 || p50 > 40 ? 30 : 0);
      if (!best || cost < best.cost) best = { cost, sc, vr, res, p50 };
    }
    const lim = limits(best.res.lv, best.res); xt.push(lim);
    if (best.sc !== 1) xs[n] = best.sc; if (best.vr) xv[n] = best.vr;
    console.error(`L${n} scale ${best.sc} variant ${best.vr} win ${(best.res.rate * 100).toFixed(0)}% p50 ${best.p50} (target ${target}) -> ${lim.join('/')} goals ${best.res.lv.goals.map(g => g.t).join('+')}`);
  }
  console.log('const XTUNE=' + JSON.stringify(xt) + ';');
  console.log('const XSCALE=' + JSON.stringify(xs) + ';');
  console.log('const XVAR=' + JSON.stringify(xv) + ';');
} else {
  console.log('usage: node scripts/tune-bot.mjs calibrate 1-20 | tune 181-200');
}
