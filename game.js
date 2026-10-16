/**
 * Logica pura del gioco TRIS (tic-tac-toe).
 *
 * Nessuna dipendenza dal DOM: questo modulo e' testabile in isolamento
 * (vedi test/game.test.js) ed e' riutilizzabile sia nel browser sia in Node.
 */

/** Cella vuota. */
export const EMPTY = null;

/** I due giocatori, nell'ordine di turno (X inizia). */
export const PLAYERS = ['X', 'O'];

/** Le 8 combinazioni vincenti: 3 righe, 3 colonne, 2 diagonali. */
export const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

/** Crea una board vuota (array di 9 celle). */
export function createBoard() {
  return Array(9).fill(EMPTY);
}

/**
 * Applica una mossa in modo immutabile.
 * @returns una NUOVA board, senza toccare quella originale.
 */
export function applyMove(board, index, player) {
  if (!Number.isInteger(index) || index < 0 || index >= 9) {
    throw new RangeError(`Indice non valido: ${index}`);
  }
  if (!PLAYERS.includes(player)) {
    throw new TypeError(`Giocatore non valido: ${player}`);
  }
  if (board[index] !== EMPTY) {
    throw new Error(`Cella gia' occupata: ${index}`);
  }
  const next = board.slice();
  next[index] = player;
  return next;
}

/** Elenca gli indici delle celle ancora libere. */
export function availableMoves(board) {
  const moves = [];
  for (let i = 0; i < 9; i += 1) {
    if (board[i] === EMPTY) moves.push(i);
  }
  return moves;
}

/**
 * Cerca un tris.
 * @returns { player, line } con gli indici vincenti, oppure null.
 */
export function winner(board) {
  for (const line of LINES) {
    const [a, b, c] = line;
    const value = board[a];
    if (value !== EMPTY && value === board[b] && value === board[c]) {
      return { player: value, line: [...line] };
    }
  }
  return null;
}

/** true solo se la board e' piena e nessuno ha vinto (pareggio). */
export function isDraw(board) {
  return winner(board) === null && board.every((cell) => cell !== EMPTY);
}

/** Il giocatore di turno in base al numero di mosse gia' fatte. */
export function currentPlayer(moveCount) {
  return PLAYERS[moveCount % 2];
}

/**
 * Stato complessivo della partita.
 * @returns { state: 'playing'|'won'|'draw', winner, line }
 */
export function gameStatus(board) {
  const result = winner(board);
  if (result) {
    return { state: 'won', winner: result.player, line: result.line };
  }
  if (board.every((cell) => cell !== EMPTY)) {
    return { state: 'draw', winner: null, line: null };
  }
  return { state: 'playing', winner: null, line: null };
}
