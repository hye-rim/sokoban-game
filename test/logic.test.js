'use strict';
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

const small = ['#######', '#@ $ .#', '#######'];

test('parse reads walls goals boxes and the player', () => {
  const p = L.parse(['#####', '#@$.#', '#####']);
  assert.deepStrictEqual([p.w, p.h], [5, 3]);
  assert.strictEqual(p.player, 6);
  assert.deepStrictEqual(p.boxes, [7]);
  assert.ok(p.goals[8]);
  assert.ok(p.walls[0] && !p.walls[6]);
  const q = L.parse(['###', '#*#', '#+#', '###']);
  assert.deepStrictEqual(q.boxes, [4]);
  assert.ok(q.goals[4] && q.goals[7]);
  assert.strictEqual(q.player, 7);
});

test('ragged rows are padded with walls', () => {
  const p = L.parse(['####', '#@$.', '###']);
  assert.strictEqual(p.w, 4);
  assert.ok(p.walls[2 * 4 + 3]);
});

test('validate accepts good maps and names the problem in bad ones', () => {
  assert.strictEqual(L.validate(small), null);
  assert.match(L.validate(['#####', '#$ .#', '#####']), /한 명/);
  assert.match(L.validate(['#####', '#@@.#', '#####']), /한 명/);
  assert.match(L.validate(['#####', '#@ .#', '#####']), /상자가 없/);
  assert.match(L.validate(['######', '#@$$.#', '######']), /수가 달라/);
  assert.match(L.validate(['#####', '#@x.#', '#####']), /알 수 없는 글자/);
  assert.match(L.validate(['#####', '#@$. ', '#####']), /둘러싸이지/);
  assert.match(L.validate(['  @$.']), /둘러싸이지/);
  assert.ok(L.validate('x'));
});

test('walking: moves one cell, stops at walls and the edge', () => {
  const st = L.newGame(['#####', '#@  #', '#####']);
  assert.deepStrictEqual(L.move(st, 'right'), { pushed: false });
  assert.strictEqual(st.player, 7);
  assert.strictEqual(L.move(st, 'up'), null);
  assert.strictEqual(L.move(st, 'down'), null);
  assert.strictEqual(L.move(st, 'sideways'), null);
  L.move(st, 'right');
  assert.strictEqual(L.move(st, 'right'), null);
  assert.strictEqual(st.moves, 2);
  const edge = L.newGame(['@ ']);
  assert.strictEqual(L.move(edge, 'left'), null, 'the map edge also stops you');
});

test('pushing moves the box one cell ahead and counts pushes', () => {
  const st = L.newGame(small);
  L.move(st, 'right');
  const r = L.move(st, 'right');                                     // 상자가 있는 칸으로 들어가며 민다
  assert.deepStrictEqual(r, { pushed: true });
  assert.deepStrictEqual(st.boxes, [11]);
  assert.strictEqual(st.player, 10);
  assert.strictEqual(st.pushes, 1);
  assert.strictEqual(st.moves, 2);
});

test('a box cannot be pushed into a wall or another box, or pulled', () => {
  const st = L.newGame(['#######', '#@$$ .#', '#######']);
  assert.strictEqual(L.move(st, 'right'), null, 'two boxes in a row');
  const w = L.newGame(['####', '#@$#', '####']);
  assert.strictEqual(L.move(w, 'right'), null, 'wall behind the box');
  const p = L.newGame(['######', '# $@ #', '######']);
  L.move(p, 'right');
  assert.deepStrictEqual(p.boxes, [8], 'walking away leaves the box where it is');
  const edge = L.newGame(['@$']);
  assert.strictEqual(L.move(edge, 'right'), null, 'the box would leave the map');
  assert.strictEqual(edge.moves, 0);
});

test('winning needs every box on a goal', () => {
  const st = L.newGame(['######', '#@$ .#', '######']);
  assert.ok(!L.isWon(st));
  L.move(st, 'right');
  assert.ok(!L.isWon(st));
  L.move(st, 'right');
  assert.ok(L.isWon(st));
  assert.strictEqual(L.boxesOnGoal(st), 1);
  const two = L.newGame(['#######', '#@$ .$.#', '#######']);
  assert.ok(!L.isWon(two));
  assert.strictEqual(L.boxesOnGoal(two), 0);
});

test('a map that starts solved counts as won, and an empty box list never wins', () => {
  const st = L.newGame(['#####', '#@* #', '#####']);
  assert.ok(L.isWon(st));
  st.boxes = [];
  assert.ok(!L.isWon(st));
});

test('undo restores walking and pushing exactly', () => {
  const st = L.newGame(small);
  const start = JSON.stringify([st.player, st.boxes, st.moves, st.pushes]);
  L.move(st, 'right'); L.move(st, 'right'); L.move(st, 'right');
  assert.ok(L.undo(st) && L.undo(st) && L.undo(st));
  assert.strictEqual(JSON.stringify([st.player, st.boxes, st.moves, st.pushes]), start);
  assert.strictEqual(L.undo(st), false);
  const st2 = L.newGame(small);
  L.move(st2, 'right'); L.move(st2, 'right');
  L.move(st2, 'left');
  L.undo(st2);
  assert.strictEqual(st2.player, 10);
  assert.deepStrictEqual(st2.boxes, [11]);
});

test('failed moves leave no history and undo is unlimited', () => {
  const st = L.newGame(['#####', '#@ $#', '#####']);
  L.move(st, 'up');
  assert.strictEqual(st.history.length, 0);
  for (let i = 0; i < 100; i++) { L.move(st, 'right'); L.move(st, 'left'); }
  assert.strictEqual(st.history.length, 200);
  for (let i = 0; i < 200; i++) assert.ok(L.undo(st));
  assert.strictEqual(st.history.length, 0);
  assert.strictEqual(L.undo(st), false);
});

test('stuck boxes are boxes in a corner that is not a goal', () => {
  const st = L.newGame(['######', '#$   #', '# @ .#', '######']);
  assert.deepStrictEqual(L.stuckBoxes(st), [st.w + 1], 'the top-left corner');
  const ok = L.newGame(['######', '#*   #', '# @  #', '######']);
  assert.deepStrictEqual(L.stuckBoxes(ok), [], 'a goal in a corner is fine');
  const mid = L.newGame(['######', '# $  #', '# @ .#', '######']);
  assert.deepStrictEqual(L.stuckBoxes(mid), [], 'against one wall is not stuck by this rule');
});
