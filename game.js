'use strict';

/* ========================
   Game Configuration
   ======================== */
const DIFFICULTIES = {
  easy:   { rows: 9,  cols: 9,  mines: 10, label: '초급' },
  medium: { rows: 16, cols: 14, mines: 35, label: '중급' },
  hard:   { rows: 22, cols: 14, mines: 60, label: '고급' },
};

/* ========================
   Game State
   ======================== */
let state = {
  difficulty: 'easy',
  board: [],         // 2D array of cell objects
  rows: 0,
  cols: 0,
  mines: 0,
  flagCount: 0,
  revealed: 0,
  status: 'idle',   // idle | playing | won | lost
  startTime: null,
  timerInterval: null,
  elapsedSeconds: 0,
  mode: 'reveal',   // reveal | flag
  vibration: true,
  animation: true,
  longPressTimer: null,
  longPressCell: null,
};

/* ========================
   DOM References
   ======================== */
const dom = {
  board:           document.getElementById('board'),
  flagCount:       document.getElementById('flagCount'),
  totalMines:      document.getElementById('totalMines'),
  timer:           document.getElementById('timer'),
  resetBtn:        document.getElementById('resetBtn'),
  resetIcon:       document.getElementById('resetIcon'),
  overlay:         document.getElementById('overlay'),
  overlayEmoji:    document.getElementById('overlayEmoji'),
  overlayTitle:    document.getElementById('overlayTitle'),
  overlaySubtitle: document.getElementById('overlaySubtitle'),
  overlayStats:    document.getElementById('overlayStats'),
  overlayBtn:      document.getElementById('overlayBtn'),
  overlayClose:    document.getElementById('overlayClose'),
  settingsBtn:     document.getElementById('settingsBtn'),
  settingsModal:   document.getElementById('settingsModal'),
  settingsClose:   document.getElementById('settingsClose'),
  modeReveal:      document.getElementById('modeReveal'),
  modeFlag:        document.getElementById('modeFlag'),
  modeSlider:      document.getElementById('modeSlider'),
  modeHint:        document.getElementById('modeHint'),
  vibrationToggle: document.getElementById('vibrationToggle'),
  animationToggle: document.getElementById('animationToggle'),
  clearRecords:    document.getElementById('clearRecords'),
  // View toggle
  viewGameTab:     document.getElementById('viewGameTab'),
  viewRecordsTab:  document.getElementById('viewRecordsTab'),
  gameView:        document.getElementById('gameView'),
  recordsPanel:    document.getElementById('recordsPanel'),
  // Scoreboard
  scoreboardList:  document.getElementById('scoreboardList'),
  scoreboardEmpty: document.getElementById('scoreboardEmpty'),
};

// Which difficulty is shown in records panel
let scoreboardDiff = 'easy';

/* ========================
   Records  (v2: per-difficulty list, max 10)
   ======================== */
const RECORDS_KEY = 'ms_records_v2';

function getRecords() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECORDS_KEY) || '{}');
    // Ensure all keys exist
    ['easy','medium','hard'].forEach(d => { if (!raw[d]) raw[d] = []; });
    return raw;
  } catch { return { easy: [], medium: [], hard: [] }; }
}

/**
 * Save a new entry. Returns true if it's the best time ever.
 * Each entry: { time: number, date: string, id: number }
 */
function saveRecord(difficulty, seconds) {
  const records = getRecords();
  const list = records[difficulty];
  const prevBest = list.length > 0 ? list[0].time : Infinity;

  const now = new Date();
  const date = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;
  list.push({ time: seconds, date, id: Date.now() });
  list.sort((a, b) => a.time - b.time);
  records[difficulty] = list.slice(0, 10);

  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  return seconds <= prevBest;  // new best?
}

/** Update mini best-time bar at bottom of game view */
function renderRecords() {
  const records = getRecords();
  ['easy', 'medium', 'hard'].forEach(d => {
    const el = document.getElementById(`record-${d}`);
    const best = records[d][0];
    el.textContent = best ? formatTime(best.time) : '--';
    el.classList.remove('new-record');
  });
}

/** Render full scoreboard for given difficulty */
function renderScoreboard(diff) {
  scoreboardDiff = diff;
  const records = getRecords();
  const list = records[diff] || [];

  // Update sub-tab active state
  document.querySelectorAll('.scoreboard-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.sdiff === diff);
  });

  if (list.length === 0) {
    dom.scoreboardEmpty.hidden = false;
    dom.scoreboardList.hidden = true;
    return;
  }

  dom.scoreboardEmpty.hidden = true;
  dom.scoreboardList.hidden = false;
  dom.scoreboardList.innerHTML = '';

  const MEDALS = ['👑', '🥈', '🥉'];

  list.forEach((entry, i) => {
    const rank = i + 1;
    const li = document.createElement('li');
    li.className = `scoreboard-item${rank <= 3 ? ` rank-${rank}` : ''}`;
    li.style.animationDelay = `${i * 45}ms`;

    // Rank badge
    const rankEl = document.createElement('div');
    rankEl.className = 'scoreboard-rank';
    if (rank <= 3) {
      rankEl.classList.add(`medal-${rank}`);
      rankEl.textContent = MEDALS[i];
    } else {
      rankEl.classList.add('rank-num');
      rankEl.textContent = rank;
    }

    // Info block
    const infoEl = document.createElement('div');
    infoEl.className = 'scoreboard-info';
    infoEl.innerHTML = `
      <div class="scoreboard-time">${formatTime(entry.time)}</div>
      <div class="scoreboard-date">${entry.date}</div>
    `;

    li.appendChild(rankEl);
    li.appendChild(infoEl);
    dom.scoreboardList.appendChild(li);
  });
}

/** Switch between 게임 view and 기록 view */
function setView(view) {
  const isGame = view === 'game';
  dom.gameView.hidden = !isGame;
  dom.recordsPanel.hidden = isGame;
  dom.viewGameTab.classList.toggle('active', isGame);
  dom.viewRecordsTab.classList.toggle('active', !isGame);
  if (!isGame) renderScoreboard(scoreboardDiff);
}

/* ========================
   Timer
   ======================== */
function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0
    ? `${m}:${String(sec).padStart(2, '0')}`
    : String(s).padStart(3, '0');
}

function startTimer() {
  state.startTime = Date.now();
  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    state.elapsedSeconds = Math.floor((Date.now() - state.startTime) / 1000);
    dom.timer.textContent = String(Math.min(state.elapsedSeconds, 999)).padStart(3, '0');
  }, 500);
}

function stopTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
}

/* ========================
   Board Generation
   ======================== */
function createCell() {
  return { mine: false, revealed: false, flagged: false, question: false, adjacent: 0 };
}

function initBoard(rows, cols) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => createCell())
  );
}

function placeMines(board, rows, cols, mines, safeRow, safeCol) {
  let placed = 0;
  while (placed < mines) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    // Safety zone: 3x3 area around first click
    if (board[r][c].mine) continue;
    if (Math.abs(r - safeRow) <= 1 && Math.abs(c - safeCol) <= 1) continue;
    board[r][c].mine = true;
    placed++;
  }
}

function calcAdjacent(board, rows, cols) {
  const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].mine) continue;
      let count = 0;
      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc].mine) count++;
      }
      board[r][c].adjacent = count;
    }
  }
}

/* ========================
   Rendering
   ======================== */
function calcCellSize(cols) {
  // 전체 수평 여백: board-container(margin 8+8, padding 8+8) + board-scroll(padding 8+8) = 48px
  const usableWidth = Math.min(window.innerWidth, 480) - 48;
  const gap = (cols - 1) * 3;
  const size = Math.floor((usableWidth - gap) / cols);
  return Math.max(20, Math.min(size, 44));
}

function renderBoard() {
  const { board, rows, cols } = state;
  const cellSize = calcCellSize(cols);

  dom.board.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
  dom.board.innerHTML = '';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = board[r][c];
      const el = document.createElement('button');
      el.className = 'cell';
      el.style.width = `${cellSize}px`;
      el.dataset.r = r;
      el.dataset.c = c;
      el.setAttribute('role', 'gridcell');
      el.setAttribute('aria-label', `행${r+1} 열${c+1}`);
      updateCellEl(el, cell);
      attachCellEvents(el);
      dom.board.appendChild(el);
    }
  }
}

function updateCellEl(el, cell) {
  el.className = 'cell';
  el.textContent = '';
  el.removeAttribute('data-num');

  if (cell.revealed) {
    el.classList.add('revealed');
    if (cell.mine) {
      el.textContent = '💣';
    } else if (cell.adjacent > 0) {
      el.textContent = cell.adjacent;
      el.dataset.num = cell.adjacent;
    }
  } else if (cell.flagged) {
    el.classList.add('flagged');
  } else if (cell.question) {
    el.classList.add('question');
  }
}

function getCellEl(r, c) {
  return dom.board.querySelector(`[data-r="${r}"][data-c="${c}"]`);
}

/* ========================
   Cell Events (Touch & Mouse)
   ======================== */
function attachCellEvents(el) {
  // Long press for flag (touch)
  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('touchend', onTouchEnd, { passive: true });
  el.addEventListener('touchmove', onTouchMove, { passive: true });
  // Mouse
  el.addEventListener('mousedown', onMouseDown);
  el.addEventListener('contextmenu', onContextMenu);
}

function onTouchStart(e) {
  const el = e.currentTarget;
  state.longPressCell = el;
  state.longPressTimer = setTimeout(() => {
    state.longPressTimer = null;
    state.longPressCell = null;
    handleFlag(parseInt(el.dataset.r), parseInt(el.dataset.c));
    vibrate(30);
  }, 450);
}

function onTouchEnd(e) {
  const el = e.currentTarget;
  if (state.longPressTimer) {
    clearTimeout(state.longPressTimer);
    state.longPressTimer = null;
    handleCellTap(parseInt(el.dataset.r), parseInt(el.dataset.c));
  }
  state.longPressCell = null;
}

function onTouchMove() {
  if (state.longPressTimer) {
    clearTimeout(state.longPressTimer);
    state.longPressTimer = null;
    state.longPressCell = null;
  }
}

function onMouseDown(e) {
  if (e.button === 0) {
    handleCellTap(parseInt(e.currentTarget.dataset.r), parseInt(e.currentTarget.dataset.c));
  } else if (e.button === 2) {
    handleFlag(parseInt(e.currentTarget.dataset.r), parseInt(e.currentTarget.dataset.c));
  }
}

function onContextMenu(e) {
  e.preventDefault();
}

function handleCellTap(r, c) {
  if (state.mode === 'flag') {
    handleFlag(r, c);
  } else {
    handleReveal(r, c);
  }
}

/* ========================
   Game Logic
   ======================== */
function handleReveal(r, c) {
  if (state.status === 'won' || state.status === 'lost') return;
  const cell = state.board[r][c];
  if (cell.flagged || cell.question || cell.revealed) return;

  // First click: place mines & start timer
  if (state.status === 'idle') {
    placeMines(state.board, state.rows, state.cols, state.mines, r, c);
    calcAdjacent(state.board, state.rows, state.cols);
    state.status = 'playing';
    startTimer();
    dom.resetIcon.textContent = '😊';
  }

  if (cell.mine) {
    // Hit a mine!
    cell.revealed = true;
    stopTimer();
    state.status = 'lost';
    revealAllMines(r, c);
    dom.resetIcon.textContent = '😵';
    vibrate([50, 30, 80]);
    setTimeout(() => showOverlay(false), 600);
    return;
  }

  // BFS flood-fill reveal
  floodReveal(r, c);
  vibrate(8);
  checkWin();
}

function floodReveal(startR, startC) {
  const queue = [[startR, startC]];
  const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  const visited = new Set();
  let delay = 0;

  while (queue.length > 0) {
    const [r, c] = queue.shift();
    const key = `${r},${c}`;
    if (visited.has(key)) continue;
    visited.add(key);

    const cell = state.board[r][c];
    if (cell.revealed || cell.flagged || cell.mine) continue;

    cell.revealed = true;
    cell.flagged = false;
    state.revealed++;

    const el = getCellEl(r, c);
    if (el) {
      if (state.animation) {
        const d = delay;
        setTimeout(() => {
          updateCellEl(el, cell);
          el.classList.add('reveal-anim');
        }, d);
        delay += cell.adjacent === 0 ? 8 : 0;
      } else {
        updateCellEl(el, cell);
      }
    }

    if (cell.adjacent === 0) {
      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols) {
          queue.push([nr, nc]);
        }
      }
    }
  }
}

function handleFlag(r, c) {
  if (state.status === 'won' || state.status === 'lost') return;
  if (state.status === 'idle') return; // can't flag before first reveal
  const cell = state.board[r][c];
  if (cell.revealed) return;

  const el = getCellEl(r, c);

  if (!cell.flagged && !cell.question) {
    cell.flagged = true;
    state.flagCount++;
  } else if (cell.flagged) {
    cell.flagged = false;
    cell.question = true;
    state.flagCount--;
  } else {
    cell.question = false;
  }

  updateCellEl(el, cell);
  updateFlagCount();
  vibrate(15);
}

function revealAllMines(hitR, hitC) {
  const { board, rows, cols } = state;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = board[r][c];
      const el = getCellEl(r, c);
      if (!el) continue;

      if (r === hitR && c === hitC) {
        cell.revealed = true;
        updateCellEl(el, cell);
        el.classList.add('mine-hit');
      } else if (cell.mine && !cell.flagged) {
        // Animate with delay
        const delay = Math.random() * 400;
        setTimeout(() => {
          cell.revealed = true;
          updateCellEl(el, cell);
          el.classList.add('mine-revealed');
        }, delay);
      } else if (!cell.mine && cell.flagged) {
        // Wrong flag — show X
        el.textContent = '❌';
      }
    }
  }

  // Shake board
  setTimeout(() => {
    dom.board.classList.add('shake');
    setTimeout(() => dom.board.classList.remove('shake'), 500);
  }, 300);
}

function checkWin() {
  const { rows, cols, mines, revealed } = state;
  const totalSafe = rows * cols - mines;
  if (revealed >= totalSafe) {
    state.status = 'won';
    stopTimer();
    dom.resetIcon.textContent = '🥳';
    vibrate([50, 30, 50, 30, 100]);
    // Auto-flag remaining mines
    autoFlagMines();
    const isNew = saveRecord(state.difficulty, state.elapsedSeconds);
    renderRecords();
    if (isNew) {
      const el = document.getElementById(`record-${state.difficulty}`);
      el.classList.add('new-record');
    }
    // Add NEW badge to the just-saved entry in scoreboard if visible
    if (dom.recordsPanel && !dom.recordsPanel.hidden) {
      renderScoreboard(scoreboardDiff);
    }
    setTimeout(() => showOverlay(true, isNew), 600);
  }
}

function autoFlagMines() {
  const { board, rows, cols } = state;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = board[r][c];
      if (cell.mine && !cell.flagged) {
        cell.flagged = true;
        state.flagCount++;
        const el = getCellEl(r, c);
        if (el) updateCellEl(el, cell);
      }
    }
  }
  updateFlagCount();
}

/* ========================
   UI Updates
   ======================== */
function updateFlagCount() {
  dom.flagCount.textContent = state.flagCount;
}

function showOverlay(won, isNewRecord = false) {
  const cfg = DIFFICULTIES[state.difficulty];
  dom.overlayEmoji.textContent = won ? '🎉' : '💥';
  dom.overlayTitle.textContent = won ? '클리어!' : '게임 오버';
  dom.overlaySubtitle.textContent = won
    ? (isNewRecord ? '🏆 새 최고 기록!' : `${cfg.label} 완료!`)
    : '지뢰를 밟았어요!';

  dom.overlayStats.innerHTML = `
    <div class="overlay-stat">
      <span class="overlay-stat-value">${formatTime(state.elapsedSeconds)}</span>
      <span class="overlay-stat-label">⏱️ 시간</span>
    </div>
    <div class="overlay-stat">
      <span class="overlay-stat-value">${state.flagCount}</span>
      <span class="overlay-stat-label">🚩 깃발</span>
    </div>
    <div class="overlay-stat">
      <span class="overlay-stat-value">${cfg.mines}</span>
      <span class="overlay-stat-label">💣 지뢰</span>
    </div>
  `;

  dom.overlay.setAttribute('aria-hidden', 'false');
  dom.overlay.classList.add('visible');
}

function hideOverlay() {
  dom.overlay.classList.remove('visible');
  dom.overlay.setAttribute('aria-hidden', 'true');
}

/* ========================
   New Game
   ======================== */
function newGame(difficulty) {
  difficulty = difficulty || state.difficulty;
  state.difficulty = difficulty;

  const cfg = DIFFICULTIES[difficulty];
  stopTimer();

  state.board = initBoard(cfg.rows, cfg.cols);
  state.rows = cfg.rows;
  state.cols = cfg.cols;
  state.mines = cfg.mines;
  state.flagCount = 0;
  state.revealed = 0;
  state.status = 'idle';
  state.startTime = null;
  state.elapsedSeconds = 0;

  dom.timer.textContent = '000';
  dom.resetIcon.textContent = '😊';
  dom.flagCount.textContent = '0';
  dom.totalMines.textContent = cfg.mines;

  hideOverlay();
  renderBoard();
}

/* ========================
   Mode Toggle
   ======================== */
function setMode(mode) {
  state.mode = mode;
  if (mode === 'reveal') {
    dom.modeReveal.classList.add('active');
    dom.modeFlag.classList.remove('active');
    dom.modeSlider.classList.remove('flag-mode');
    dom.modeHint.textContent = '탭: 열기 / 길게 탭: 깃발';
  } else {
    dom.modeFlag.classList.add('active');
    dom.modeReveal.classList.remove('active');
    dom.modeSlider.classList.add('flag-mode');
    dom.modeHint.textContent = '탭: 깃발 / 길게 탭: 열기';
  }
}

/* ========================
   Vibration
   ======================== */
function vibrate(pattern) {
  if (!state.vibration) return;
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

/* ========================
   Settings
   ======================== */
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('ms_settings') || '{}');
    state.vibration = s.vibration !== false;
    state.animation = s.animation !== false;
    dom.vibrationToggle.checked = state.vibration;
    dom.animationToggle.checked = state.animation;

    const theme = s.theme || 'purple';
    applyTheme(theme);
    document.querySelectorAll('.theme-swatch').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
  } catch {}
}

function saveSettings() {
  const theme = document.querySelector('.theme-swatch.active')?.dataset.theme || 'purple';
  localStorage.setItem('ms_settings', JSON.stringify({
    vibration: state.vibration,
    animation: state.animation,
    theme,
  }));
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

/* ========================
   Event Listeners
   ======================== */
// Difficulty tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    newGame(btn.dataset.difficulty);
  });
});

// Reset button
dom.resetBtn.addEventListener('click', () => {
  vibrate(10);
  newGame(state.difficulty);
});

// Overlay
dom.overlayBtn.addEventListener('click', () => {
  hideOverlay();
  newGame(state.difficulty);
});
dom.overlayClose.addEventListener('click', hideOverlay);
dom.overlay.addEventListener('click', e => {
  if (e.target === dom.overlay) hideOverlay();
});

// Mode toggle
dom.modeReveal.addEventListener('click', () => setMode('reveal'));
dom.modeFlag.addEventListener('click', () => setMode('flag'));

// Settings
dom.settingsBtn.addEventListener('click', () => {
  dom.settingsModal.classList.add('visible');
  dom.settingsModal.setAttribute('aria-hidden', 'false');
});
dom.settingsClose.addEventListener('click', closeSettings);
dom.settingsModal.addEventListener('click', e => {
  if (e.target === dom.settingsModal) closeSettings();
});

function closeSettings() {
  dom.settingsModal.classList.remove('visible');
  dom.settingsModal.setAttribute('aria-hidden', 'true');
}

dom.vibrationToggle.addEventListener('change', () => {
  state.vibration = dom.vibrationToggle.checked;
  saveSettings();
});

dom.animationToggle.addEventListener('change', () => {
  state.animation = dom.animationToggle.checked;
  saveSettings();
});

document.querySelectorAll('.theme-swatch').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.theme-swatch').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyTheme(btn.dataset.theme);
    saveSettings();
    vibrate(10);
  });
});

dom.clearRecords.addEventListener('click', () => {
  if (confirm('모든 기록을 삭제할까요?')) {
    localStorage.removeItem(RECORDS_KEY);
    renderRecords();
    renderScoreboard(scoreboardDiff);
    vibrate(20);
  }
});

// View toggle
dom.viewGameTab.addEventListener('click', () => setView('game'));
dom.viewRecordsTab.addEventListener('click', () => setView('records'));

// Scoreboard difficulty sub-tabs
document.querySelectorAll('.scoreboard-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    renderScoreboard(btn.dataset.sdiff);
    vibrate(8);
  });
});

// Prevent page zoom on double tap
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });

// Keyboard shortcuts (desktop)
document.addEventListener('keydown', e => {
  if (e.key === 'r' || e.key === 'R') newGame(state.difficulty);
  if (e.key === 'f' || e.key === 'F') setMode(state.mode === 'reveal' ? 'flag' : 'reveal');
  if (e.key === '1') { document.getElementById('tab-easy').click(); }
  if (e.key === '2') { document.getElementById('tab-medium').click(); }
  if (e.key === '3') { document.getElementById('tab-hard').click(); }
});

/* ========================
   Init
   ======================== */
loadSettings();
renderRecords();
renderScoreboard('easy');
newGame('easy');
