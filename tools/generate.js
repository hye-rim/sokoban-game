'use strict';
// 레벨 만들기: node tools/generate.js [방 모양 수] [씨앗]
// 1) 무작위 방(벽 조각)을 만들고 목표 칸에 상자를 놓은 '다 푼 판'에서 시작한다
// 2) 상자를 거꾸로 끌어당기는 움직임으로 너비 우선 탐색을 해서, 그 방에서 만들 수 있는 판을 '풀기까지 필요한 최소 밀기 수'별로 모은다
//    (거꾸로 끌어당겨 만든 판이라 반드시 풀 수 있고, 깊이가 곧 최소 밀기 수다)
// 3) 가장 깊은(어려운) 판들을 모아 풀이 도구(tools/solver.js)가 앞으로 풀어 최소 밀기 수가 같은지 확인하고, 쉬운 것부터 어려운 순으로 30개를 levels.js 에 쓴다
const fs = require('fs'), path = require('path');
const L = require('../logic.js');
const { solve, replay, reach } = require('./solver.js');

function rng(seed) {                                   // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const D = [[0, -1], [0, 1], [-1, 0], [1, 0]];

function room(rand, W, H, blocks) {
  const w = W + 2, h = H + 2;
  const wall = new Array(w * h).fill(true);
  for (let y = 1; y <= H; y++) for (let x = 1; x <= W; x++) wall[y * w + x] = false;
  for (let b = 0; b < blocks; b++) {
    const x = 1 + Math.floor(rand() * W), y = 1 + Math.floor(rand() * H), i = y * w + x;
    if (wall[i]) continue;
    wall[i] = true;
    if (!connected(wall, w)) wall[i] = false;
  }
  return { w, h, wall };
}
function connected(wall, w) {
  const start = wall.indexOf(false); const seen = new Set([start]), q = [start];
  while (q.length) { const c = q.pop(); for (const [dx, dy] of D) { const n = c + dy * w + dx; if (!wall[n] && !seen.has(n)) { seen.add(n); q.push(n); } } }
  return seen.size === wall.filter((x) => !x).length;
}

// 거꾸로 너비 우선 탐색: 다 푼 판에서 끌어당겨 갈 수 있는 모든 판과 그 깊이(= 최소 밀기 수)
function reverse(rm, goals, cap, onLayer) {
  const { w, h, wall } = rm;
  const st = { w, h, walls: wall };
  const key = (boxes, region) => boxes.join(',') + '|' + region;
  const depthOf = new Map(), layers = [];
  let frontier = [];
  const sorted = goals.slice().sort((a, b) => a - b);
  const set0 = new Set(sorted);
  const regionsDone = new Set();
  for (let i = 0; i < w * h; i++) {
    if (wall[i] || set0.has(i) || regionsDone.has(i)) continue;
    const r = reach(st, set0, i);
    for (let c = 0; c < w * h; c++) if (r.seen[c]) regionsDone.add(c);
    const k = key(sorted, r.min);
    if (!depthOf.has(k)) { depthOf.set(k, 0); frontier.push({ boxes: sorted, region: r.min }); }
  }
  layers.push(frontier);
  while (frontier.length && depthOf.size < cap) {
    const next = [];
    for (const cur of frontier) {
      const boxSet = new Set(cur.boxes);
      const seen = reach(st, boxSet, cur.region).seen;
      for (let bi = 0; bi < cur.boxes.length; bi++) {
        const b = cur.boxes[bi], bx = b % w, by = (b / w) | 0;
        for (const [dx, dy] of D) {
          // 상자 b 의 한쪽(A = b - d) 에 서 있다가 반대쪽(A - d)으로 물러나며 끌어당긴다: 상자는 A 로 온다
          const ax = bx - dx, ay = by - dy, sx = ax - dx, sy = ay - dy;
          const a = ay * w + ax, s = sy * w + sx;
          if (wall[a] || wall[s] || !seen[a] || boxSet.has(s)) continue;
          const nb = cur.boxes.slice(); nb[bi] = a; nb.sort((x, y) => x - y);
          const r = reach(st, new Set(nb), s);
          const k = key(nb, r.min);
          if (depthOf.has(k)) continue;
          depthOf.set(k, layers.length);
          next.push({ boxes: nb, region: r.min });
        }
      }
    }
    if (!next.length) break;
    layers.push(next); frontier = next;
  }
  return layers;
}

function toMap(rm, goals, boxes, region) {
  const { w, h, wall } = rm;
  const st = { w, h, walls: wall };
  const player = region;                               // 구역의 가장 작은 칸에 선다 (그 구역 어디든 같은 판이다)
  const rows = [];
  for (let y = 0; y < h; y++) {
    let r = '';
    for (let x = 0; x < w; x++) {
      const i = y * w + x, g = goals.includes(i), b = boxes.includes(i);
      r += wall[i] ? '#' : i === player ? (g ? '+' : '@') : b ? (g ? '*' : '$') : g ? '.' : ' ';
    }
    rows.push(r);
  }
  return rows;
}

// 방 크기, 상자 수, 벽 조각 수, 탐색 상한
const tiers = [
  [4, 4, 1, 0, 40000], [5, 4, 1, 1, 40000], [5, 5, 1, 2, 40000], [5, 5, 2, 1, 80000], [6, 5, 2, 2, 120000], [6, 6, 2, 3, 150000],
  [6, 6, 3, 2, 200000], [7, 6, 3, 4, 250000], [7, 7, 3, 5, 250000], [7, 7, 4, 4, 300000], [8, 7, 4, 6, 300000], [8, 8, 4, 8, 300000],
];
const N = Number(process.argv[2]) || 12, seed = Number(process.argv[3]) || 20261026;
const rand = rng(seed);
const found = new Map();
for (const [W, H, k, blocks, cap] of tiers) {
  let rooms = 0, kept = 0;
  for (let t = 0; t < N; t++) {
    const rm = room(rand, W, H, blocks);
    const floor = []; for (let i = 0; i < rm.w * rm.h; i++) if (!rm.wall[i]) floor.push(i);
    if (floor.length < k * 4 + 3) continue;
    const goals = []; const pool = floor.slice();
    while (goals.length < k) goals.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    const layers = reverse(rm, goals, cap);
    rooms++;
    // 가장 깊은 층과, 그 60% · 30% 깊이의 층에서 한 판씩
    const deepest = layers.length - 1;
    for (const frac of [1, 0.6, 0.3]) {
      const d = Math.max(2, Math.round(deepest * frac));
      if (d > deepest || !layers[d] || !layers[d].length) continue;
      const s = layers[d][Math.floor(rand() * layers[d].length)];
      const rows = toMap(rm, goals, s.boxes, s.region);
      if (L.validate(rows)) continue;
      const key = rows.join('/');
      if (found.has(key)) continue;
      found.set(key, { map: rows, par: d, boxes: k, depthLimit: deepest });
      kept++;
    }
  }
  console.error(`${W}x${H} 상자 ${k}: 방 ${rooms}개, 판 ${kept}개, 가장 깊은 최소 밀기 ${[...found.values()].filter((l) => l.boxes === k).reduce((m, l) => Math.max(m, l.par), 0)}`);
}
const all = [...found.values()];
// 풀이 도구로 한 번 더 확인 (최소 밀기 수가 같아야 한다)
const verified = [];
for (const l of all.sort((a, b) => a.par - b.par)) {
  const r = solve(l.map, 2500000);
  if (!r.ok) continue;
  if (r.pushes !== l.par) { console.error('최소 밀기 수가 다름', l.par, r.pushes); continue; }
  if (!replay(l.map, r.path)) continue;
  verified.push(l);
}
console.error(`확인된 판 ${verified.length}/${all.length}`);
// 쉬운 것부터: 상자 수 · 최소 밀기 수로 줄을 세우고 30개를 고르게 뽑는다
verified.sort((a, b) => (a.boxes - b.boxes) * 1000 + (a.par - b.par));
const want = 30, picked = [];
const byKey = (l) => l.boxes * 1000 + l.par;
const sortedByDifficulty = verified.slice().sort((a, b) => (a.par + a.boxes * 5) - (b.par + b.boxes * 5));
for (let i = 0; i < want; i++) picked.push(sortedByDifficulty[Math.min(sortedByDifficulty.length - 1, Math.floor((i + 0.5) * sortedByDifficulty.length / want))]);
const uniq = []; for (const l of picked) if (!uniq.includes(l)) uniq.push(l);
const body = `'use strict';
// 소코반 레벨 ${uniq.length}개: tools/generate.js 가 거꾸로 끌어당겨 만들고 tools/solver.js 가 풀어서 확인했다 (par = 가장 적게 미는 횟수)
const LEVELS = [
${uniq.map((l) => `  { par: ${l.par}, map: [\n${l.map.map((r) => `    '${r}',`).join('\n')}\n  ] },`).join('\n')}
];
if (typeof module !== 'undefined') module.exports = LEVELS;
`;
fs.writeFileSync(path.join(__dirname, '..', 'levels.js'), body);
console.error('levels.js 에 쓴 레벨:', uniq.map((l) => `${l.boxes}상자/${l.par}`).join(' '));
