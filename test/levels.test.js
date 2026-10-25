'use strict';
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');
const LEVELS = require('../levels.js');
const { solve, replay } = require('../tools/solver.js');

test('there are thirty levels and every one is a valid map', () => {
  assert.strictEqual(LEVELS.length, 30);
  LEVELS.forEach((lv, i) => assert.strictEqual(L.validate(lv.map), null, 'level ' + (i + 1)));
});

test('no two levels are the same map', () => {
  assert.strictEqual(new Set(LEVELS.map((l) => l.map.join('/'))).size, LEVELS.length);
});

test('levels start unsolved and get harder: boxes and par never shrink much', () => {
  LEVELS.forEach((lv, i) => assert.ok(!L.isWon(L.newGame(lv.map)), 'level ' + (i + 1) + ' is already solved'));
  assert.ok(LEVELS[0].par <= 3 && LEVELS[1].par <= 3 && LEVELS[2].par <= 4, 'the first levels are gentle');
  assert.ok(LEVELS[LEVELS.length - 1].par >= 15, 'the last levels need real planning');
  const avg = (a) => a.reduce((s, l) => s + l.par, 0) / a.length;
  assert.ok(avg(LEVELS.slice(0, 10)) < avg(LEVELS.slice(10, 20)) && avg(LEVELS.slice(10, 20)) < avg(LEVELS.slice(20)), 'each third is harder than the one before');
});

test('every level is solvable with exactly par pushes, and the solution really clears it', () => {
  LEVELS.forEach((lv, i) => {
    const r = solve(lv.map, 4000000);
    assert.ok(r.ok, 'level ' + (i + 1) + ' is solvable');
    assert.strictEqual(r.pushes, lv.par, 'level ' + (i + 1) + ' par');
    assert.ok(replay(lv.map, r.path), 'level ' + (i + 1) + ' replays to a clear');
  });
});

test('solver reports unsolvable maps and replay rejects wrong paths', () => {
  const stuck = ['#####', '#$@.#', '#####'];                          // 상자가 왼쪽 벽에 붙어 오른쪽으로 밀 수 없다
  assert.strictEqual(solve(stuck).ok, false);
  const easy = ['#####', '#@$.#', '#####'];
  const r = solve(easy);
  assert.ok(r.ok && r.pushes === 1);
  assert.strictEqual(replay(easy, []), false, 'doing nothing does not clear it');
  assert.strictEqual(replay(easy, [{ at: 1 * 5 + 1, dir: 'left' }]), false, 'a push into a wall fails');
  assert.ok(replay(easy, r.path));
});
