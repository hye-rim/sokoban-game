'use strict';

// 소코반: 규칙만 모아 둔 파일 (그리기·입력 없음). 브라우저와 테스트(Node)가 같이 쓴다.
//
// - 판 글자: '#' 벽 · ' ' 바닥 · '.' 목표 칸 · '$' 상자 · '*' 목표 칸 위의 상자 · '@' 나 · '+' 목표 칸 위의 나
// - 나는 상하좌우로 한 칸씩 움직인다. 앞에 상자가 있으면 밀고, 상자 뒤가 벽이나 다른 상자면 못 민다. 상자는 당길 수 없다
// - 상자를 전부 목표 칸에 올리면 클리어. 되돌리기는 제한이 없다
// - 구석에 박혀 더는 못 움직이는 상자(목표 칸이 아닌 곳)는 '막힘'으로 알려 준다
const LOGIC_SOKO = (() => {
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIR_NAMES = Object.keys(DIRS);

// 판(글자 줄 목록)을 읽는다. 짧은 줄은 오른쪽을 벽으로 채운다
function parse(map) {
  const h = map.length, w = Math.max(...map.map((r) => r.length));
  const walls = new Array(w * h).fill(true), goals = new Array(w * h).fill(false), boxes = [];
  let player = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < map[y].length; x++) {
    const ch = map[y][x], i = y * w + x;
    if (ch !== '#') walls[i] = false;
    if (ch === '.' || ch === '*' || ch === '+') goals[i] = true;
    if (ch === '$' || ch === '*') boxes.push(i);
    if (ch === '@' || ch === '+') player = i;
  }
  return { w, h, walls, goals, boxes, player };
}

// 판이 올바른지: 나 한 명, 상자 수 = 목표 수(1개 이상), 갇힌 곳 없이 벽으로 둘러싸임. 문제가 없으면 null
function validate(map) {
  if (!Array.isArray(map) || !map.length || !map.every((r) => typeof r === 'string')) return '판이 글자 줄 목록이 아니에요';
  const bad = map.join('').match(/[^# .$*@+]/);
  if (bad) return `알 수 없는 글자 ${bad[0]}`;
  const p = parse(map);
  const count = (re) => (map.join('').match(re) || []).length;
  if (count(/[@+]/g) !== 1) return '나는 한 명이어야 해요';
  const boxes = count(/[$*]/g), goals = count(/[.*+]/g);
  if (boxes < 1) return '상자가 없어요';
  if (boxes !== goals) return `상자(${boxes})와 목표(${goals})의 수가 달라요`;
  // 나에게서 갈 수 있는 곳이 판 가장자리 밖으로 새면 안 된다 (벽으로 둘러싸임)
  const seen = new Set([p.player]), q = [p.player];
  while (q.length) {
    const c = q.pop(), x = c % p.w, y = (c / p.w) | 0;
    for (const [dx, dy] of Object.values(DIRS)) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= p.w || ny >= p.h) return '벽으로 둘러싸이지 않았어요';
      const n = ny * p.w + nx;
      if (p.walls[n] || seen.has(n)) continue;
      seen.add(n); q.push(n);
    }
  }
  return null;
}

function newGame(map) {
  const p = parse(map);
  return { w: p.w, h: p.h, walls: p.walls, goals: p.goals, boxes: p.boxes.slice(), player: p.player, moves: 0, pushes: 0, history: [] };
}

const hasBox = (st, i) => st.boxes.includes(i);

// 한 칸 움직인다. 안 되면 null, 되면 { pushed }
function move(st, dir) {
  const d = DIRS[dir];
  if (!d) return null;
  const x = st.player % st.w, y = (st.player / st.w) | 0;
  const nx = x + d[0], ny = y + d[1];
  if (nx < 0 || ny < 0 || nx >= st.w || ny >= st.h) return null;
  const to = ny * st.w + nx;
  if (st.walls[to]) return null;
  const bi = st.boxes.indexOf(to);
  let pushed = false;
  if (bi >= 0) {
    const bx = nx + d[0], by = ny + d[1];
    if (bx < 0 || by < 0 || bx >= st.w || by >= st.h) return null;
    const beyond = by * st.w + bx;
    if (st.walls[beyond] || hasBox(st, beyond)) return null;
    st.boxes[bi] = beyond;
    pushed = true;
    st.history.push({ from: st.player, box: bi, boxFrom: to });
    st.pushes++;
  } else st.history.push({ from: st.player, box: -1, boxFrom: -1 });
  st.player = to;
  st.moves++;
  return { pushed };
}

// 한 수 되돌린다. 되돌릴 게 없으면 false
function undo(st) {
  const h = st.history.pop();
  if (!h) return false;
  if (h.box >= 0) { st.boxes[h.box] = h.boxFrom; st.pushes--; }
  st.player = h.from;
  st.moves--;
  return true;
}

const isWon = (st) => st.boxes.length > 0 && st.boxes.every((b) => st.goals[b]);
const boxesOnGoal = (st) => st.boxes.filter((b) => st.goals[b]).length;

// 목표 칸이 아닌 구석(서로 직각인 두 방향이 벽)에 박힌 상자들 — 더는 못 움직이니 풀 수 없다
function stuckBoxes(st) {
  const wall = (x, y) => x < 0 || y < 0 || x >= st.w || y >= st.h || st.walls[y * st.w + x];
  return st.boxes.filter((b) => {
    if (st.goals[b]) return false;
    const x = b % st.w, y = (b / st.w) | 0;
    return (wall(x - 1, y) || wall(x + 1, y)) && (wall(x, y - 1) || wall(x, y + 1));
  });
}

const cellOf = (st, x, y) => y * st.w + x;
return { DIRS, DIR_NAMES, parse, validate, newGame, move, undo, isWon, boxesOnGoal, stuckBoxes, cellOf };
})();
if (typeof module !== 'undefined') module.exports = LOGIC_SOKO;
