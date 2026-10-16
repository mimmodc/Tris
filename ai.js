/**
 * Avversario artificiale per il TRIS.
 *
 * Modulo puro (nessun DOM), testabile in isolamento — vedi test/ai.test.js.
 * Tre difficolta':
 *   - easy:   mossa casuale
 *   - medium: vince se puo', altrimenti blocca, altrimenti a caso
 *   - hard:   minimax perfetto (non perde mai)
 */
import {
  availableMoves,
  applyMove,
  winner,
} from './game.js';

/** Difficolta' disponibili, dalla piu' facile alla piu' forte. */
export const DIFFICULTIES = ['easy', 'medium', 'hard'];

const CENTER = 4;
const CORNERS = new Set([0, 2, 6, 8]);

function opponent(player) {
  return player === 'X' ? 'O' : 'X';
}

/** "Bonta'" posizionale: centro > angoli > lati. */
function rank(index) {
  if (index === CENTER) return 2;
  if (CORNERS.has(index)) return 1;
  return 0;
}

/** Mosse libere ordinate per bonta' (utile per rompere i pareggi in modo naturale). */
function orderedMoves(board) {
  return availableMoves(board).sort((a, b) => rank(b) - rank(a));
}

function pick(list, rng) {
  return list[Math.floor(rng() * list.length)];
}

/** Punteggio minimax con potatura alfa-beta: positivo se conviene a `me`. */
function minimax(board, player, me, depth, alpha, beta) {
  const result = winner(board);
  if (result) return result.player === me ? 10 - depth : depth - 10;

  const moves = orderedMoves(board);
  if (moves.length === 0) return 0;

  if (player === me) {
    let best = -Infinity;
    for (const move of moves) {
      const score = minimax(applyMove(board, move, player), opponent(player), me, depth + 1, alpha, beta);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break; // potatura
    }
    return best;
  }

  let best = Infinity;
  for (const move of moves) {
    const score = minimax(applyMove(board, move, player), opponent(player), me, depth + 1, alpha, beta);
    if (score < best) best = score;
    if (best < beta) beta = best;
    if (alpha >= beta) break; // potatura
  }
  return best;
}

/** Mossa perfetta (minimax): non perde mai. */
export function bestMove(board, player) {
  const moves = orderedMoves(board);
  if (moves.length === 0) return null;

  let bestScore = -Infinity;
  let best = moves[0];
  for (const move of moves) {
    const score = minimax(applyMove(board, move, player), opponent(player), player, 0, -Infinity, Infinity);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}

/** Vince se puo', altrimenti blocca, altrimenti gioca a caso. */
export function smartMove(board, player, rng = Math.random) {
  const moves = availableMoves(board);
  if (moves.length === 0) return null;

  const winning = moves.filter((move) => winner(applyMove(board, move, player)));
  if (winning.length > 0) return pick(winning, rng);

  const other = opponent(player);
  const blocking = moves.filter((move) => winner(applyMove(board, move, other)));
  if (blocking.length > 0) return pick(blocking, rng);

  return pick(moves, rng);
}

/** Mossa puramente casuale tra le celle libere. */
export function randomMove(board, rng = Math.random) {
  const moves = availableMoves(board);
  if (moves.length === 0) return null;
  return pick(moves, rng);
}

/** Sceglie la mossa in base alla difficolta' richiesta. */
export function chooseMove(board, player, difficulty = 'hard', rng = Math.random) {
  switch (difficulty) {
    case 'easy':
      return randomMove(board, rng);
    case 'medium':
      return smartMove(board, player, rng);
    default:
      return bestMove(board, player);
  }
}
