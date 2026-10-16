/**
 * Interfaccia del gioco TRIS.
 *
 * La logica di gioco sta in ./game.js, l'avversario artificiale in ./ai.js,
 * la partita in rete in ./netgame.js (+ ./net.js per il trasporto); qui ci
 * occupiamo di DOM, rendering, punteggio, modalita' e interazione.
 */
import {
  EMPTY,
  createBoard,
  applyMove,
  gameStatus,
  currentPlayer,
} from './game.js';
import { chooseMove } from './ai.js';
import { createNetGame } from './netgame.js';
import { createLink } from './net.js';
import { normalizeCode } from './room.js';

const HUMAN = 'X';
const COMPUTER = 'O';
const THINK_DELAY = 420; // ms di "riflessione" del computer

const boardEl = document.getElementById('board');
const turnEl = document.getElementById('turn');
const whoX = document.getElementById('who-x');
const whoO = document.getElementById('who-o');
const scoreEls = {
  X: document.getElementById('score-x'),
  O: document.getElementById('score-o'),
  D: document.getElementById('score-d'),
};
const newBtn = document.getElementById('new');
const resetBtn = document.getElementById('reset');
const pvpBtn = document.getElementById('mode-pvp');
const cpuBtn = document.getElementById('mode-cpu');
const netBtn = document.getElementById('mode-net');
const difficultyField = document.getElementById('difficulty-field');
const difficultySelect = document.getElementById('difficulty');

const netPanel = document.getElementById('net-panel');
const netActions = document.getElementById('net-actions');
const netRoom = document.getElementById('net-room');
const netHostBtn = document.getElementById('net-host');
const netJoinForm = document.getElementById('net-join-form');
const netCodeInput = document.getElementById('net-code');
const netCodeValue = document.getElementById('net-code-value');
const netHint = document.getElementById('net-hint');
const netLeaveBtn = document.getElementById('net-leave');

const scores = { X: 0, O: 0, D: 0 };
let board = createBoard();
let moves = 0;
let result = null;
let thinking = false;
let mode = 'pvp';
let difficulty = 'medium';
let timerId = null;

// Stato della partita in rete.
let link = null;
let net = null;
let netPhase = 'idle'; // 'idle' | 'pending' | 'connected' | 'closed'
let netStatus = 'waiting'; // 'waiting' | 'playing' | 'over'
let netPlayer = 'X';
let netOpponent = 'O';
let netScored = false;


/** I 9 pulsanti-cella, creati una sola volta. */
const cells = Array.from({ length: 9 }, (_, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cell';
  button.dataset.index = String(index);
  button.addEventListener('click', () => play(index));
  boardEl.append(button);
  return button;
});

function colorClass(player) {
  return player === 'X' ? 'mark-x' : 'mark-o';
}

/** true se tocca al computer. */
function isComputerTurn() {
  return mode === 'cpu' && result === null && currentPlayer(moves) === COMPUTER;
}

/** true se in rete tocca a noi. */
function isMyNetworkTurn() {
  return netStatus === 'playing' && currentPlayer(moves) === netPlayer;
}

/** true se il giocatore umano puo' cliccare adesso. */
function canPlay() {
  if (result !== null || thinking) return false;
  if (mode === 'cpu') return currentPlayer(moves) === HUMAN;
  if (mode === 'net') return isMyNetworkTurn();
  return true;
}

/** Ridisegna le celle in base allo stato corrente. */
function render() {
  const playable = canPlay();
  board.forEach((value, index) => {
    const cell = cells[index];
    cell.textContent = value ?? '';
    cell.classList.toggle('x', value === 'X');
    cell.classList.toggle('o', value === 'O');
    cell.classList.toggle('win', Boolean(result?.line?.includes(index)));
    cell.disabled = value !== EMPTY || !playable;
    const description = value ? `segno ${value}` : 'vuota';
    cell.setAttribute('aria-label', `Cella ${index + 1}, ${description}`);
  });
}

function setTurn(html, isWin = false) {
  turnEl.classList.toggle('win', isWin);
  turnEl.innerHTML = html;
}

/** Aggiorna il messaggio "tocca a...". */
function updateTurn() {
  if (result) return;

  if (mode === 'net') {
    if (netPhase === 'idle') {
      setTurn('Crea una partita oppure unisciti con un codice');
      return;
    }
    if (netPhase === 'closed') {
      setTurn('Avversario disconnesso');
      return;
    }
    if (netPhase !== 'connected' || netStatus !== 'playing') {
      setTurn('In attesa dell&#8217;avversario…');
      return;
    }
    if (isMyNetworkTurn()) {
      setTurn(`Tocca a te (<strong class="${colorClass(netPlayer)}">${netPlayer}</strong>)`);
    } else {
      setTurn(`Tocca all&#8217;avversario (<strong class="${colorClass(netOpponent)}">${netOpponent}</strong>)`);
    }
    return;
  }

  if (mode === 'cpu') {
    if (currentPlayer(moves) === HUMAN) {
      setTurn('Tocca a te (<strong class="mark-x">X</strong>)');
    } else {
      setTurn('Sta giocando il computer <strong class="mark-o">O</strong>…');
    }
    return;
  }

  const player = currentPlayer(moves);
  setTurn(`Tocca a <strong class="${colorClass(player)}">${player}</strong>`);
}

function updateTurnLabels() {
  if (mode === 'cpu') {
    whoX.textContent = 'Tu';
    whoO.textContent = 'PC';
  } else if (mode === 'net') {
    whoX.textContent = netPlayer === 'X' ? 'Tu' : 'Avv.';
    whoO.textContent = netPlayer === 'O' ? 'Tu' : 'Avv.';
  } else {
    whoX.textContent = 'X';
    whoO.textContent = 'O';
  }
}

function updateScores() {
  scoreEls.X.textContent = String(scores.X);
  scoreEls.O.textContent = String(scores.O);
  scoreEls.D.textContent = String(scores.D);
}

/** Aggiorna il punteggio in base all'esito di una partita. */
function registerResult(status) {
  if (status.state === 'won') scores[status.winner] += 1;
  else scores.D += 1;
  updateScores();
}

/** Annuncia il risultato finale. */
function announceResult() {
  if (result.state === 'draw') {
    setTurn('Pareggio!', true);
    return;
  }

  const winner = result.winner;

  if (mode === 'net') {
    if (winner === netPlayer) setTurn('Hai vinto! 🎉', true);
    else setTurn('Ha vinto l&#8217;avversario (<strong class="' + colorClass(winner) + '">' + winner + '</strong>)', true);
    return;
  }

  if (mode === 'cpu') {
    if (winner === HUMAN) setTurn('Hai vinto! 🎉', true);
    else setTurn('Ha vinto il computer (<strong class="mark-o">O</strong>)', true);
    return;
  }

  setTurn(`<strong class="${colorClass(winner)}">${winner}</strong> ha vinto!`, true);
}

/** Esegue una mossa e prosegue la partita. */
function step(index, player) {
  board = applyMove(board, index, player);
  moves += 1;

  const status = gameStatus(board);
  if (status.state !== 'playing') {
    result = status;
    registerResult(status);
    render();
    announceResult();
    return;
  }

  render();
  updateTurn();

  if (isComputerTurn()) scheduleComputer();
}

/** Fa giocare il computer dopo una breve pausa. */
function scheduleComputer() {
  thinking = true;
  render();
  updateTurn();

  timerId = window.setTimeout(() => {
    timerId = null;
    thinking = false;
    if (result !== null) return;

    const move = chooseMove(board, COMPUTER, difficulty);
    if (move === null) {
      render();
      updateTurn();
      return;
    }
    step(move, COMPUTER);
  }, THINK_DELAY);
}

/** Gestisce il clic su una cella. */
function play(index) {
  if (!canPlay() || board[index] !== EMPTY) return;

  if (mode === 'net') {
    net?.playLocal(index);
    return;
  }

  step(index, currentPlayer(moves));
}

function clearTimer() {
  if (timerId !== null) {
    window.clearTimeout(timerId);
    timerId = null;
  }
}

/** Nuova partita (mantiene il punteggio). */
function newGame() {
  clearTimer();
  thinking = false;

  if (mode === 'net' && net) {
    net.requestReset();
    return;
  }

  board = createBoard();
  moves = 0;
  result = null;
  cells.forEach((cell) => cell.classList.remove('win'));
  render();
  updateTurn();
}

function resetScores() {
  scores.X = 0;
  scores.O = 0;
  scores.D = 0;
  updateScores();
  newGame();
}

/* ------------------------------- rete ---------------------------------- */

function showNetError(message) {
  netActions.hidden = true;
  netRoom.hidden = false;
  netCodeValue.textContent = '------';
  netHint.classList.add('error');
  netHint.textContent = message;
}

function showNetChoose() {
  netActions.hidden = false;
  netRoom.hidden = true;
  netHint.classList.remove('error');
  netHint.textContent = '';
}

function showNetRoom(code, hint) {
  netActions.hidden = true;
  netRoom.hidden = false;
  netCodeValue.textContent = code;
  netHint.classList.toggle('error', false);
  netHint.textContent = hint;
}

/** Stato locale sincronizzato da netgame dopo ogni cambiamento. */
function onNetChange(snapshot) {
  board = snapshot.board;
  moves = snapshot.moves;
  result = snapshot.result;
  netStatus = snapshot.status;
  netPlayer = snapshot.player;
  netOpponent = snapshot.opponent;

  if (result && !netScored) {
    netScored = true;
    registerResult(result);
  } else if (!result) {
    netScored = false;
  }

  updateTurnLabels();
  render();
  if (result) announceResult();
  else updateTurn();
}

function onNetEvent(event) {
  if (event.type === 'connected') {
    netPhase = 'connected';
    netHint.classList.remove('error');
    netHint.textContent = 'Avversario collegato!';
    net?.start();
    return;
  }

  if (event.type === 'message') {
    net?.receive(event.message);
    return;
  }

  if (event.type === 'closed') {
    netPhase = 'closed';
    netStatus = 'waiting';
    netHint.classList.add('error');
    netHint.textContent = 'Avversario disconnesso.';
    net?.disconnect();
    return;
  }

  if (event.type === 'error') {
    showNetError(String(event.error?.message ?? event.error ?? 'Errore di rete'));
  }
}

function leaveNet() {
  if (link) {
    link.close();
    link = null;
  }
  net = null;
  netPhase = 'idle';
  netStatus = 'waiting';
  netPlayer = 'X';
  netOpponent = 'O';
  netScored = false;
}

function showEmptyBoard() {
  board = createBoard();
  moves = 0;
  result = null;
  thinking = false;
  cells.forEach((cell) => cell.classList.remove('win'));
  updateTurnLabels();
  render();
  updateTurn();
}

async function hostGame() {
  leaveNet();
  showEmptyBoard();
  showNetRoom('------', 'Creazione della stanza…');

  try {
    link = await createLink({ role: 'host', onEvent: onNetEvent });
    net = createNetGame({ isHost: true, send: (message) => link.send(message), onChange: onNetChange });
    netPlayer = net.getPlayer();
    netOpponent = netPlayer === 'X' ? 'O' : 'X';
    netPhase = 'pending';
    showNetRoom(link.code, 'Comunica il codice all&#8217;altra persona e attendi.');
    updateTurnLabels();
    updateTurn();
  } catch (error) {
    showNetError(error.message);
  }
}

async function joinGame(pin) {
  leaveNet();
  showEmptyBoard();
  showNetRoom(pin, 'Connessione in corso…');

  try {
    link = await createLink({ role: 'guest', pin, onEvent: onNetEvent });
    net = createNetGame({ isHost: false, send: (message) => link.send(message), onChange: onNetChange });
    netPlayer = net.getPlayer();
    netOpponent = netPlayer === 'X' ? 'O' : 'X';
    netPhase = 'pending';
    showNetRoom(link.code, 'Connessione in corso…');
    updateTurnLabels();
    updateTurn();
  } catch (error) {
    showNetError(error.message);
  }
}

function setMode(next) {
  if (mode === next) return;

  clearTimer();
  if (mode === 'net') leaveNet();
  mode = next;

  pvpBtn.setAttribute('aria-pressed', String(mode === 'pvp'));
  cpuBtn.setAttribute('aria-pressed', String(mode === 'cpu'));
  netBtn.setAttribute('aria-pressed', String(mode === 'net'));
  difficultyField.hidden = mode !== 'cpu';
  netPanel.hidden = mode !== 'net';

  if (mode === 'net') {
    showNetChoose();
    showEmptyBoard();
    return;
  }

  updateTurnLabels();
  newGame();
}

/** Navigazione da tastiera tra le celle (griglia 3x3). */
boardEl.addEventListener('keydown', (event) => {
  const deltas = { ArrowUp: -3, ArrowDown: 3, ArrowLeft: -1, ArrowRight: 1 };
  const delta = deltas[event.key];
  if (delta === undefined) return;

  const current = cells.indexOf(document.activeElement);
  if (current === -1) return;

  const column = current % 3;
  if (event.key === 'ArrowLeft' && column === 0) return;
  if (event.key === 'ArrowRight' && column === 2) return;

  const target = current + delta;
  if (target < 0 || target > 8) return;

  event.preventDefault();
  cells[target].focus();
});

pvpBtn.addEventListener('click', () => setMode('pvp'));
cpuBtn.addEventListener('click', () => setMode('cpu'));
netBtn.addEventListener('click', () => setMode('net'));
difficultySelect.addEventListener('change', () => {
  difficulty = difficultySelect.value;
});
newBtn.addEventListener('click', newGame);
resetBtn.addEventListener('click', resetScores);

netHostBtn.addEventListener('click', hostGame);

netJoinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const code = normalizeCode(netCodeInput.value);
  if (!code) {
    netCodeInput.focus();
    return;
  }
  joinGame(code);
});

netLeaveBtn.addEventListener('click', () => {
  leaveNet();
  showNetChoose();
  showEmptyBoard();
});

updateScores();
updateTurnLabels();
newGame();

// Rende l'app installabile e funzionante offline.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .catch((error) => console.warn('Service worker non registrato:', error));
  });
}
