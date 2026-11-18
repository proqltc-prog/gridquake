// Tuning bot for campaign levels. It plays each level many times with the real game rules
// (the core of index.html between /*CORE-START*/ and /*CORE-END*/).
//
//   node scripts/tune-bot.mjs tune 1-20 > map1.json   tune levels: obstacle scale, layout, limits and stars (JSON lines)
//   node scripts/tune-bot.mjs apply map*.json          write the tuned levels into index.html (CTUNE)
//   node scripts/tune-bot.mjs verify 1-220             check: how often the bot wins each level within its limits
//   node scripts/tune-bot.mjs why 1-20                 why the bot loses (bomb, lava, full board, too slow)
//
// Method: a level has a move limit, a time limit or both (levelPlan in index.html). The bot plays every
// candidate (obstacle scale x layout) 24 times and keeps the hardest one it still wins often enough with a
// sensible length. The limit then follows from the bot's winning games: the share of games the bot wins within
// the limit is the target of that map, from 95% on map 1 down to 70% on map 11 (tough and boss levels a little
// lower). Every limit gets 10% extra for human players. Time is counted at PACE seconds per move.
// A level is accepted only when the bot wins it within its limits in at least 70% of 48 new games.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const core = html.slice(html.indexOf('/*CORE-START*/'), html.indexOf('/*CORE-END*/'));
const G = new Function('tx', core + ';return {newState,applyMove,refillG,rerollTray,trayStuck,fitsG,makeLevel,levelPlan,goalLeft,levelWon,N,MAPSIZE,MOVE_BONUS,TIME_BONUS,CTUNE};')(x => x);
const { N } = G;

const GAMES = 24, CHECK = 48, MAX_MOVES = 120, PACE = 4.5, HUMAN = 1.1, MIN_OK = 0.7;
const SCALES = [0.25, 0.4, 0.55, 0.7, 0.85, 1, 1.2, 1.45, 1.75, 2.1];
const clone = st => ({ ...st, mode: 'tut', lvl: { ...st.lvl, moss: 0 }, grid: st.grid.map(r => r.map(x => x && { ...x })),
  ice: st.ice.map(r => r.slice()), paint: st.paint.map(r => r.slice()), tray: st.tray.slice(),
  stats: { ...st.stats, made: { ...st.stats.made } } });

// room for big blocks: a 3x3 square and a straight line of 5 (the blocks that get a player stuck first)
function room(st) {
  const free = (r, c) => r < N && c < N && !st.grid[r][c];
  let sq = false, ln = false;
  for (let r = 0; r < N && !(sq && ln); r++) for (let c = 0; c < N; c++) {
    if (!sq && r + 2 < N && c + 2 < N) { let ok = true; for (let a = 0; a < 3 && ok; a++) for (let b = 0; b < 3; b++) if (!free(r + a, c + b)) { ok = false; break; } if (ok) sq = true; }
    if (!ln) { let h = true, w = true; for (let a = 0; a < 5; a++) { if (!free(r, c + a)) h = false; if (!free(r + a, c)) w = false; } if (h || w) ln = true; }
  }
  return (sq ? 0 : 45) + (ln ? 0 : 25);
}
// how good a board is for the bot: goal progress first, then a tidy board with room for big blocks
function value(st, rep, before) {
  if (st.boom || st.overflow) return -1e6; // a bomb that goes off or lava at the top loses the level
  let v = rep.gain / 100;
  st.lvl.goals.forEach((g, j) => { v += (before[j] - G.goalLeft(st, g)) * (g.t === 'score' ? 0.02 : 220); });
  let filled = 0, holes = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const x = st.grid[r][c];
    if (x && !x.hole) filled++;
    if (!x) { let s = 0; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => { const R = r + a, K = c + b; if (R < 0 || K < 0 || R >= N || K >= N || st.grid[R][K]) s++; }); if (s === 4) holes++; }
    if (x && x.crystal) { v += r * 18; for (let d = r + 1; d < N; d++) if (st.grid[d][c]) v -= 9; }
    // a bomb close to 0 is urgent: defuse it first
    if (x && x.bomb) v -= x.bomb <= 1 ? 600 : x.bomb <= 2 ? 260 : x.bomb <= 4 ? 70 : (12 - Math.min(12, x.bomb)) * 6;
  }
  return v - filled * 3 - holes * 9 - room(st);
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
    if (st.boom || st.overflow) return { won: false, moves, why: st.boom ? 'bomb' : 'lava' };
    const m = bestMove(st); if (!m) return { won: false, moves, why: 'full' };
    G.applyMove(st, ...m);
  }
  return G.levelWon(st) ? { won: true, moves: MAX_MOVES, score: st.score } : { won: false, moves: MAX_MOVES, why: 'max' };
}
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : 0; };
const r500 = v => Math.max(500, Math.round(v / 500) * 500);
const games = (n, sc, vr, k0, cnt) => { const lv0 = G.makeLevel(n, sc, vr), out = [];
  for (let k = 0; k < cnt; k++) out.push(play(G.makeLevel(n, sc, vr), (lv0.seed ^ ((k + k0) * 0x9e3779b1)) >>> 0)); return { lv: lv0, out }; };

// how many moves fit in the limits of a level (time at PACE seconds per move)
const cap = (M, T) => Math.min(M || Infinity, T ? Math.floor(T / PACE) : Infinity);
// the score of a game won within the limits, with the bonus for moves and seconds left
const final = (o, M, T) => o.score + (M ? (M - o.moves) * G.MOVE_BONUS : 0) + (T ? Math.max(0, Math.floor(T - o.moves * PACE)) * G.TIME_BONUS : 0);
// target share of bot wins within the limits: 95% on map 1 down to 70% on map 11; tough and boss levels lower
function target(lv) { return Math.max(MIN_OK + 0.02, 0.95 - 0.025 * lv.m - (lv.boss ? 0.05 : lv.hard ? 0.03 : 0)); }
// limits and stars from the bot's winning games
function limits(lv, wins, rate) {
  const q = Math.min(0.98, target(lv) / Math.max(rate, 0.01) + 0.03), mv = pct(wins.map(o => o.moves), q) * HUMAN, plan = lv.plan.limit;
  const M = plan === 'time' ? 0 : Math.max(10, Math.min(60, Math.ceil(mv * (plan === 'both' ? 1.15 : 1))));
  const T = plan === 'moves' ? 0 : Math.max(45, Math.min(300, Math.ceil(mv / HUMAN * PACE / 5) * 5)); // PACE is already generous
  const fin = wins.filter(o => o.moves <= cap(M, T)).map(o => final(o, M, T));
  return [M, T, r500(pct(fin, 0.5)), r500(pct(fin, 0.8))];
}
function tuneLevel(n, maxScale = Infinity) {
  const lv1 = G.makeLevel(n, 1, 0), tgt = target(lv1), len = ((lv1.boss ? 34 : lv1.hard ? 30 : lv1.easy ? 20 : 25) + lv1.m * 0.6) * (lv1.plan.limit === 'moves' ? 1 : 0.8); // time levels: short and snappy
  let best = null;
  // more layouts to choose from with TUNE_VARS=4 (for the few levels the bot finds hard)
  for (let vr = 0; vr < (+process.env.TUNE_VARS || 2); vr++) for (const sc of SCALES) {
    if (sc > maxScale) continue;
    const { lv, out } = games(n, sc, vr, 0, GAMES), wins = out.filter(o => o.won), rate = wins.length / GAMES, p50 = pct(wins.map(o => o.moves), 0.5);
    // prefer: won often enough by the bot, a length close to the target, and then the harder setting
    const cost = (rate < tgt + 0.05 ? 200 + (tgt + 0.05 - rate) * 400 : 0) + Math.abs(p50 - len) + (p50 < 12 || p50 > 48 ? 30 : 0) - sc * 2;
    if (!best || cost < best.cost) best = { cost, sc, vr, lv, wins, rate, p50 };
  }
  return { n, t: [...limits(best.lv, best.wins, best.rate), best.sc, best.vr], rate: best.rate, p50: best.p50, plan: best.lv.plan.limit };
}
// the share of new games the bot wins within the limits of entry t
function check(n, t, k0 = 1000) {
  const [M, T, s2, s3, sc, vr] = t, { out } = games(n, sc, vr, k0, CHECK), lim = cap(M, T);
  const ok = out.filter(o => o.won && o.moves <= lim), fin = ok.map(o => final(o, M, T));
  return { rate: ok.length / CHECK, s2: fin.filter(x => x >= s2).length / CHECK, s3: fin.filter(x => x >= s3).length / CHECK, out };
}

const [mode, ...args] = process.argv.slice(2);
const range = s => { const [a, b] = (s || '1-220').split('-').map(Number); return [a, b || a]; };
if (mode === 'tune') {
  // tune, then check with new games; a level the bot wins too rarely is made easier and tuned again
  const [a, b] = range(args[0]);
  for (let n = a; n <= b; n++) {
    let r = tuneLevel(n), c = check(n, r.t), tries = 0;
    while (c.rate < MIN_OK && tries < 4) { const lower = SCALES.filter(s => s < r.t[4]); if (!lower.length) break;
      r = tuneLevel(n, lower[lower.length - 1]); c = check(n, r.t); tries++; }
    console.log(JSON.stringify({ ...r, check: Math.round(c.rate * 100), s2: Math.round(c.s2 * 100), s3: Math.round(c.s3 * 100) }));
    console.error(`L${n} ${r.plan} scale ${r.t[4]} variant ${r.t[5]} -> moves ${r.t[0]} time ${r.t[1]} stars ${r.t[2]}/${r.t[3]} | bot wins in limits ${Math.round(c.rate * 100)}%`);
  }
} else if (mode === 'apply') {
  // merge the JSON lines of tune runs into the CTUNE table in index.html
  const all = [];
  for (const f of args) for (const line of readFileSync(f, 'utf8').split('\n')) if (line.trim().startsWith('{')) { const x = JSON.parse(line); all[x.n - 1] = x.t; }
  const missing = []; for (let i = 0; i < 220; i++) if (!all[i]) missing.push(i + 1);
  if (missing.length) { console.error('missing levels: ' + missing.join(',')); process.exit(1); }
  const file = join(ROOT, 'index.html'), src = readFileSync(file, 'utf8'), a = src.indexOf('/*CTUNE-START*/'), b = src.indexOf('/*CTUNE-END*/');
  writeFileSync(file, src.slice(0, a) + '/*CTUNE-START*/const CTUNE=' + JSON.stringify(all) + ';' + src.slice(b));
  console.log('CTUNE written: 220 levels');
} else if (mode === 'verify') {
  // check the finished table with games the tuning never saw
  const [a, b] = range(args[0]); let bad = 0;
  for (let n = a; n <= b; n++) {
    const t = G.CTUNE[n - 1]; if (!t) { console.log(`L${n} not tuned`); bad++; continue; }
    const c = check(n, t, 5000), lv = G.makeLevel(n); if (c.rate < MIN_OK) bad++; // games the tuning never saw
    console.log(`L${n} ${lv.plan.limit} moves ${t[0]} time ${t[1]} | won in limits ${Math.round(c.rate * 100)}% | ★★ ${Math.round(c.s2 * 100)}% ★★★ ${Math.round(c.s3 * 100)}%${c.rate < MIN_OK ? '  << too hard' : ''}`);
  }
  console.log(bad ? `${bad} level(s) below ${MIN_OK * 100}%` : `all levels won by the bot in at least ${MIN_OK * 100}% of games`);
} else if (mode === 'why') {
  const [a, b] = range(args[0]);
  for (let n = a; n <= b; n++) {
    const lv = G.makeLevel(n), t = G.CTUNE[n - 1] || [lv.moves, lv.time], lim = cap(t[0], t[1]), tally = {};
    for (const o of games(n, undefined, undefined, 1000, CHECK).out) { const w = o.won ? (o.moves <= lim ? 'won' : 'too-slow') : o.why; tally[w] = (tally[w] || 0) + 1; }
    console.log(`L${n} ${lv.plan.limit} goals ${lv.goals.map(g => g.t + (g.target ? ':' + g.target : '')).join('+')} ${JSON.stringify(tally)}`);
  }
} else {
  console.log('usage: node scripts/tune-bot.mjs tune 1-20 | apply a.json b.json | verify 1-220 | why 1-20');
}
