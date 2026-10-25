'use strict';
// 풀이 도구: 상자를 미는 수(밀기) 단위로 너비 우선 탐색해 가장 적게 미는 풀이를 찾는다. (게임 화면에는 들어가지 않는다)
const L = require('../logic.js');
const { DIRS, DIR_NAMES } = L;

// 나에게서 상자 없이 갈 수 있는 칸들 (가장 작은 칸 번호가 '나의 구역' 이름표)
function reach(st, boxSet, start) {
  const seen = new Uint8Array(st.w * st.h);
  const q = [start];
  seen[start] = 1;
  let min = start;
  while (q.length) {
    const c = q.pop();
    if (c < min) min = c;
    const x = c % st.w, y = (c / st.w) | 0;
    for (const [dx, dy] of Object.values(DIRS)) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= st.w || ny >= st.h) continue;
      const n = ny * st.w + nx;
      if (seen[n] || st.walls[n] || boxSet.has(n)) continue;
      seen[n] = 1; q.push(n);
    }
  }
  return { seen, min };
}

// 풀이를 찾는다. 돌려주는 값: { ok, pushes, nodes, path: [{ at, dir }] } (at: 밀기 직전 내 칸, dir: 미는 방향)
function solve(map, cap = 400000) {
  const st = L.newGame(map);
  const w = st.w;
  const key = (boxes, region) => boxes.slice().sort((a, b) => a - b).join(',') + '|' + region;
  let boxes0 = st.boxes.slice();
  const first = reach(st, new Set(boxes0), st.player);
  const start = { boxes: boxes0, player: st.player, region: first.min, seen: first.seen, parent: null, push: null, depth: 0 };
  const visited = new Set([key(boxes0, first.min)]);
  let frontier = [start], nodes = 0;
  const done = (b) => b.every((c) => st.goals[c]);
  if (done(boxes0)) return { ok: true, pushes: 0, nodes: 1, path: [] };
  while (frontier.length) {
    const next = [];
    for (const cur of frontier) {
      const boxSet = new Set(cur.boxes);
      for (let bi = 0; bi < cur.boxes.length; bi++) {
        const b = cur.boxes[bi], bx = b % w, by = (b / w) | 0;
        for (const dir of DIR_NAMES) {
          const [dx, dy] = DIRS[dir];
          const px = bx - dx, py = by - dy, tx = bx + dx, ty = by + dy;
          if (px < 0 || py < 0 || px >= w || py >= st.h || tx < 0 || ty < 0 || tx >= w || ty >= st.h) continue;
          const pc = py * w + px, tc = ty * w + tx;
          if (!cur.seen[pc] || st.walls[tc] || boxSet.has(tc)) continue;      // 밀 자리에 갈 수 없거나, 상자 뒤가 막힘
          if (++nodes > cap) return { ok: false, pushes: -1, nodes, path: null };
          const nb = cur.boxes.slice(); nb[bi] = tc;
          const nset = new Set(nb);
          const r = reach(st, nset, b);                                          // 밀고 나면 나는 상자가 있던 칸에 선다
          const k = key(nb, r.min);
          if (visited.has(k)) continue;
          visited.add(k);
          const node = { boxes: nb, player: b, region: r.min, seen: r.seen, parent: cur, push: { at: pc, dir }, depth: cur.depth + 1 };
          if (done(nb)) {
            const path = [];
            for (let n = node; n.parent; n = n.parent) path.push(n.push);
            return { ok: true, pushes: node.depth, nodes, path: path.reverse() };
          }
          next.push(node);
        }
      }
    }
    frontier = next;
  }
  return { ok: false, pushes: -1, nodes, path: null };
}

// 풀이를 실제 규칙(L.move)으로 재생한다: 밀 자리까지 걸어간 뒤 민다. 클리어하면 true
function replay(map, path) {
  const st = L.newGame(map);
  for (const step of path) {
    // 나 → step.at 까지 상자를 피해 걷는다 (너비 우선)
    const prev = new Map([[st.player, null]]);
    const q = [st.player];
    while (q.length && !prev.has(step.at)) {
      const c = q.shift(), x = c % st.w, y = (c / st.w) | 0;
      for (const dir of DIR_NAMES) {
        const [dx, dy] = DIRS[dir];
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= st.w || ny >= st.h) continue;
        const n = ny * st.w + nx;
        if (prev.has(n) || st.walls[n] || st.boxes.includes(n)) continue;
        prev.set(n, { c, dir }); q.push(n);
      }
    }
    if (!prev.has(step.at)) return false;
    const walk = [];
    for (let c = step.at; prev.get(c); c = prev.get(c).c) walk.push(prev.get(c).dir);
    for (const dir of walk.reverse()) if (!L.move(st, dir)) return false;
    const r = L.move(st, step.dir);
    if (!r || !r.pushed) return false;
  }
  return L.isWon(st);
}
module.exports = { solve, replay, reach };
