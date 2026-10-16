/**
 * Interfaccia del gioco TRIS.
 *
 * Tutta la logica vive in ./game.js; qui ci occupiamo solo di DOM,
 * rendering, punteggio e interazione.
 */
import {
  EMPTY,
  createBoard,
  applyMove,
  gameStatus,
  currentPlayer,
} from './game.js';

const boardEl = document.getElementById('board');
const turnEl = document.getElementById('turn');
const scoreEls = {
  X: document.getElementById('score-x'),
  O: document.getElementById('score-o'),
  D: document.getElementById('score-d'),
};
const newBtn = document.getElementById('new');
const resetBtn = document.getElementById('reset');

const scores = { X: 0, O: 0, D: 0 };
let board = createBoard();
let moves = 0;
let finished = false;

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

/** Classe CSS del colore associato a un giocatore. */
function colorClass(player) {
  return player === 'X' ? 'mark-x' : 'mark-o';
}

/** Aggiorna le celle in base allo stato della board. */
function render() {
  board.forEach((value, index) => {
    const cell = cells[index];
    cell.textContent = value ?? '';
    cell.classList.toggle('x', value === 'X');
    cell.classList.toggle('o', value === 'O');
    cell.disabled = finished || value !== EMPTY;
    const descrizione = value ? `segno ${value}` : 'vuota';
    cell.setAttribute('aria-label', `Cella ${index + 1}, ${descrizione}`);
  });
}

/** Scrive il messaggio di stato in alto. */
function setTurn(html, isWin = false) {
  turnEl.classList.toggle('win', isWin);
  turnEl.innerHTML = html;
}

/** Mostra di chi e' il turno. */
function updateTurn() {
  const player = currentPlayer(moves);
  setTurn(`Tocca a <strong class="${colorClass(player)}">${player}</strong>`);
}

/** Aggiorna i numeri del punteggio. */
function updateScores() {
  scoreEls.X.textContent = String(scores.X);
  scoreEls.O.textContent = String(scores.O);
  scoreEls.D.textContent = String(scores.D);
}

/** Gioca una mossa, se valida, e aggiorna tutto. */
function play(index) {
  if (finished || board[index] !== EMPTY) return;

  board = applyMove(board, index, currentPlayer(moves));
  moves += 1;

  const status = gameStatus(board);
  if (status.state === 'playing') {
    render();
    updateTurn();
    return;
  }

  finished = true;
  render();

  if (status.state === 'won') {
    scores[status.winner] += 1;
    status.line.forEach((i) => cells[i].classList.add('win'));
    setTurn(`<strong class="${colorClass(status.winner)}">${status.winner}</strong> ha vinto!`, true);
  } else {
    scores.D += 1;
    setTurn('Pareggio!', true);
  }

  updateScores();
}

/** Inizia una nuova partita (mantiene il punteggio). */
function newGame() {
  board = createBoard();
  moves = 0;
  finished = false;
  cells.forEach((cell) => cell.classList.remove('win'));
  render();
  updateTurn();
}

/** Azzera il punteggio e ricomincia. */
function resetScores() {
  scores.X = 0;
  scores.O = 0;
  scores.D = 0;
  updateScores();
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

newBtn.addEventListener('click', newGame);
resetBtn.addEventListener('click', resetScores);

updateScores();
newGame();

// Rende l'app installabile e funzionante offline.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .catch((error) => console.warn('Service worker non registrato:', error));
  });
}
