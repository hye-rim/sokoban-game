'use strict';
// 오락실 튜토리얼이 '진짜로 일어난 일'을 알아채는 신호 (arcade/public/tutorial.js 가 듣는다. 튜토리얼이 아니면 아무도 안 듣는다)
const tutorialSignal = (type) => window.dispatchEvent(new CustomEvent('arcade:tutorial', { detail: { type } }));

// 소코반: 화면·입력·소리. 규칙은 logic.js (LOGIC_SOKO), 레벨은 levels.js (LEVELS)
(() => {
const L = LOGIC_SOKO;
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const INK = '#2b1d52';
const DONE_KEY = 'sokobanDone', LAST_KEY = 'sokobanLast';

// ---------- 저장소 ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};
const loadDone = () => { try { return JSON.parse(store.get(DONE_KEY)) || {}; } catch (_) { return {}; } };
let done = loadDone();                                   // { 단계 번호(0부터): { moves, pushes, stars } }
const clearedCount = () => Object.keys(done).length;
let last = Math.min(LEVELS.length - 1, Math.max(0, Number(store.get(LAST_KEY)) || 0));

// ---------- 소리 ----------
let audio = null;
let muted = store.get('sokobanMuted') === '1';
function tone(freq, dur, type = 'sine', vol = 0.09, slide = 0) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + dur);
  } catch (_) {}
}
const seq = (notes, step, type = 'triangle', vol = 0.09) => notes.forEach((f, i) => setTimeout(() => tone(f, step * 0.0009, type, vol), i * step));
const sfx = {
  step: () => tone(300, 0.04, 'triangle', 0.04),
  push: () => tone(180, 0.09, 'square', 0.06, -40),
  goal: () => tone(700, 0.1, 'triangle', 0.09, 200),
  bump: () => tone(130, 0.06, 'square', 0.04),
  undo: () => tone(500, 0.08, 'triangle', 0.07, -150),
  win: () => seq([523, 659, 784, 1047], 100, 'triangle', 0.1),
};
function toggleMute() { muted = !muted; store.set('sokobanMuted', muted ? '1' : '0'); $('muteBtn').textContent = muted ? '🔇' : '🔊'; }
$('muteBtn').onclick = (e) => { e.currentTarget.blur(); toggleMute(); };
$('muteBtn').textContent = muted ? '🔇' : '🔊';

// ---------- 상태 ----------
let level = 0, st = L.newGame(LEVELS[0].map);
let playing = false, solvedShown = false;
let flash = 0, flashCell = -1;                          // 상자가 목표 칸에 들어간 순간의 반짝임

// ---------- 그리기 ----------
let T = 40, OX = 0, OY = 0;                              // 한 칸 크기, 판 왼쪽 위
function fit() {
  const availW = Math.min(innerWidth - 28, 400), availH = Math.max(160, innerHeight - (matchMedia('(pointer: fine)').matches ? 190 : 330));
  T = Math.max(14, Math.floor(Math.min(availW / st.w, availH / st.h)));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = T * st.w, ch = T * st.h;
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  ctx.setTransform(canvas.width / cw, 0, 0, canvas.height / ch, 0, 0);
  OX = 0; OY = 0;
  draw();
}
addEventListener('resize', fit);

function rr(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function draw() {
  const w = st.w * T, h = st.h * T;
  ctx.clearRect(0, 0, w, h);
  const stuck = new Set(L.stuckBoxes(st));
  for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
    const i = y * st.w + x, px = x * T, py = y * T;
    if (st.walls[i]) {
      // 벽: 진한 보라 벽돌
      ctx.fillStyle = '#6b5cff'; rr(px + 1, py + 1, T - 2, T - 2, T * 0.18); ctx.fill();
      ctx.lineWidth = Math.max(2, T * 0.07); ctx.strokeStyle = INK; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.28)'; rr(px + T * 0.14, py + T * 0.14, T * 0.72, T * 0.14, T * 0.07); ctx.fill();
      continue;
    }
    ctx.fillStyle = (x + y) % 2 ? '#ffe6a8' : '#fff0c2'; ctx.fillRect(px, py, T, T);
    if (st.goals[i]) {                                   // 목표 칸: 노란 과녁
      ctx.fillStyle = 'rgba(255,162,0,.55)'; ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, T * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = Math.max(2, T * 0.06); ctx.strokeStyle = '#d98200'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, T * 0.1, 0, Math.PI * 2); ctx.fill();
    }
  }
  for (const b of st.boxes) {
    const x = b % st.w, y = (b / st.w) | 0, px = x * T, py = y * T, on = st.goals[b];
    const pad = T * 0.1, s = flashCell === b && flash > 0 ? 1.08 : 1;
    ctx.save(); ctx.translate(px + T / 2, py + T / 2); ctx.scale(s, s); ctx.translate(-T / 2, -T / 2);
    ctx.fillStyle = INK; rr(pad, pad + T * 0.06, T - pad * 2, T - pad * 2, T * 0.16); ctx.fill();
    ctx.fillStyle = on ? '#4cd964' : stuck.has(b) ? '#ff8a8a' : '#e9a65a'; rr(pad, pad, T - pad * 2, T - pad * 2, T * 0.16); ctx.fill();
    ctx.lineWidth = Math.max(2, T * 0.07); ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineWidth = Math.max(2, T * 0.06); ctx.strokeStyle = on ? '#1f9d3d' : stuck.has(b) ? '#c0392b' : '#a8672a';
    ctx.beginPath(); ctx.moveTo(pad + T * 0.14, pad + T * 0.14); ctx.lineTo(T - pad - T * 0.14, T - pad - T * 0.14); ctx.moveTo(T - pad - T * 0.14, pad + T * 0.14); ctx.lineTo(pad + T * 0.14, T - pad - T * 0.14); ctx.stroke();
    ctx.restore();
  }
  // 나
  const px = (st.player % st.w) * T, py = ((st.player / st.w) | 0) * T;
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2 + T * 0.05, T * 0.36, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, T * 0.36, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = Math.max(2, T * 0.07); ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(px + T * 0.38, py + T * 0.45, T * 0.05, 0, Math.PI * 2); ctx.arc(px + T * 0.62, py + T * 0.45, T * 0.05, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(px + T / 2, py + T * 0.55, T * 0.12, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
}

function updateHud() {
  $('lvl').textContent = `${level + 1} / ${LEVELS.length}`;
  $('movesN').textContent = String(st.moves);
  const total = st.boxes.length, on = L.boxesOnGoal(st);
  const stuck = L.stuckBoxes(st).length;
  const msg = $('msg');
  if (stuck) { msg.textContent = `⚠️ 구석에 박힌 상자가 있어요! ↩ 되돌려요 (상자 ${on}/${total})`; msg.className = 'warn'; }
  else { msg.textContent = `상자 ${on} / ${total} · 밀기 ${st.pushes}번 (최소 ${LEVELS[level].par}번)`; msg.className = ''; }
  $('undoBtn').disabled = !st.history.length;
}

// ---------- 창 ----------
const overlayOpen = () => !$('overlay').classList.contains('hidden');
function showOverlay(html) { $('overlay').innerHTML = html; $('overlay').classList.remove('hidden'); }
function hideOverlay() { $('overlay').classList.add('hidden'); }

// ---------- 행동 ----------
function loadLevel(i) {
  level = Math.max(0, Math.min(LEVELS.length - 1, i));
  last = level; store.set(LAST_KEY, String(level));
  st = L.newGame(LEVELS[level].map);
  playing = true; solvedShown = false; flash = 0; flashCell = -1;
  hideOverlay(); fit(); updateHud();
}
function step(dir) {
  if (!playing || solvedShown) return;
  const before = L.boxesOnGoal(st);
  const r = L.move(st, dir);
  if (!r) { sfx.bump(); return; }
  tutorialSignal('move');
  if (r.pushed) {
    tutorialSignal('push');
    if (L.boxesOnGoal(st) > before) { sfx.goal(); flash = 1; flashCell = st.boxes.find((b) => st.goals[b] && true); setTimeout(() => { flash = 0; draw(); }, 140); } else sfx.push();
  } else sfx.step();
  draw(); updateHud();
  if (L.isWon(st)) setTimeout(onClear, 350);
}
function undo() {
  if (!playing || solvedShown) return;
  if (!L.undo(st)) return;
  sfx.undo(); tutorialSignal('undo');
  draw(); updateHud();
}
function restart() {
  if (!playing || solvedShown) return;
  loadLevel(level); tutorialSignal('restart');
}
const starsFor = (pushes, par) => (pushes <= par ? 3 : pushes <= Math.ceil(par * 1.5) ? 2 : 1);
function onClear() {
  if (solvedShown) return;
  solvedShown = true; sfx.win(); tutorialSignal('clear');
  const par = LEVELS[level].par, stars = starsFor(st.pushes, par);
  const prev = done[level];
  const best = !prev || stars > prev.stars || (stars === prev.stars && st.moves < prev.moves);
  if (best) { done[level] = { moves: st.moves, pushes: st.pushes, stars }; store.set(DONE_KEY, JSON.stringify(done)); }
  store.set('sokobanCleared', String(clearedCount()));
  const lastLevel = level === LEVELS.length - 1;
  showOverlay(`
    <h2>클리어! 🎉</h2>
    <div class="stars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
    <p>이동 <b>${st.moves}</b>번 · 밀기 <b>${st.pushes}</b>번 (최소 ${par}번)${best && prev ? '<br>🏆 내 최고 기록!' : ''}</p>
    ${stars < 3 ? '<p style="font-size:12.5px">최소 밀기로 풀면 ⭐ 세 개예요</p>' : '<p style="font-size:12.5px">최소 밀기로 풀었어요! 대단해요</p>'}
    <div class="col">${lastLevel ? '<p>모든 단계를 깼어요! 🏆</p>' : '<button id="nextBtn">다음 단계 ▶</button>'}<button id="againBtn" class="sub">다시 하기</button><button id="listBtn" class="sub">단계 선택</button></div>`);
  $('nextBtn') && ($('nextBtn').onclick = () => loadLevel(level + 1));
  $('againBtn').onclick = () => loadLevel(level);
  $('listBtn').onclick = showLevels;
}
function showLevels() {
  playing = false; solvedShown = false;
  showOverlay(`
    <h2>단계 선택</h2>
    <p>깬 단계 <b>${clearedCount()}</b> / ${LEVELS.length}</p>
    <div class="scroll"><div class="levels">${LEVELS.map((lv, i) => `<button data-i="${i}" class="${done[i] ? 'done' : ''}${i === last ? ' cur' : ''}">${i + 1}<small>${done[i] ? '⭐'.repeat(done[i].stars) : ''}</small></button>`).join('')}</div></div>
    <button id="backBtn" class="sub">닫기</button>`);
  document.querySelectorAll('#overlay .levels button').forEach((b) => { b.onclick = () => loadLevel(Number(b.dataset.i)); });
  $('backBtn').onclick = () => { if (st) { playing = true; hideOverlay(); } };
}
function showTitle() {
  playing = false;
  const next = Math.min(LEVELS.length - 1, last);
  showOverlay(`
    <h1>소코반</h1>
    <p>상자를 밀어서 <b>노란 목표 칸</b>에<br>모두 올려놓으세요!</p>
    <div class="card2" style="font-size:13px">📦 상자는 <b>밀기만</b> 되고 당길 수 없어요<br>📦 한 번에 상자 <b>하나</b>만 밀 수 있어요<br>⚠️ 구석에 박히면 못 풀어요 → ↩ 되돌리기<br>⭐ 최소 밀기 수로 풀면 별 세 개!</div>
    <div class="col"><button id="startBtn">${clearedCount() ? '이어서 하기' : '시작하기'}<small>${next + 1}단계 · 깬 단계 ${clearedCount()}/${LEVELS.length}</small></button><button id="listBtn" class="sub">단계 선택</button></div>`);
  $('startBtn').onclick = () => loadLevel(next);
  $('listBtn').onclick = showLevels;
}

// ---------- 입력 ----------
const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const dir = KEYS[e.key];
  if (dir) { e.preventDefault(); step(dir); return; }
  if (e.key === 'z' || e.key === 'Z') { undo(); return; }
  if (e.key === 'r' || e.key === 'R') { restart(); return; }
  if (e.key === 'm' || e.key === 'M') toggleMute();
});
document.querySelectorAll('#pad button').forEach((b) => {
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); step(b.dataset.d); });
});
// 판 위에서 밀기(스와이프)
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} });
canvas.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
  step(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
});
canvas.addEventListener('pointercancel', () => { drag = null; });
$('undoBtn').onclick = (e) => { e.currentTarget.blur(); undo(); };
$('restartBtn').onclick = (e) => { e.currentTarget.blur(); restart(); };
$('menuBtn').onclick = (e) => { e.currentTarget.blur(); if (!overlayOpen()) showLevels(); };

fit(); updateHud();
showTitle();

/* @test-hooks:start */
window.__sk = { get st() { return st; }, get level() { return level; }, get playing() { return playing; }, get done() { return done; }, LEVELS, loadLevel, step, undo, restart };
/* @test-hooks:end */
})();
