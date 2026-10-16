/**
 * Sincronizzazione di una partita in rete.
 *
 * Modulo indipendente dal trasporto (PeerJS, WebSocket, ...): riceve una
 * funzione `send` e applica i messaggi in arrivo con `receive`. Questo lo
 * rende testabile con un trasporto finto — vedi test/netgame.test.js.
 */
import {
  EMPTY,
  createBoard,
  applyMove,
  gameStatus,
  currentPlayer,
} from './game.js';
import { playerFor, encodeMove, encodeReset, decode } from './protocol.js';

export function createNetGame({ isHost, send, onChange = () => {} }) {
  const player = playerFor(isHost);
  const opponent = player === 'X' ? 'O' : 'X';

  let board = createBoard();
  let moves = 0;
  let result = null;
  let connected = false;

  function status() {
    if (!connected) return 'waiting';
    if (result) return 'over';
    return 'playing';
  }

  function state() {
    return {
      player,
      opponent,
      board: [...board],
      moves,
      result,
      status: status(),
      turn: currentPlayer(moves),
    };
  }

  const emit = () => onChange(state());

  function applyAt(index, by) {
    board = applyMove(board, index, by);
    moves += 1;
    const outcome = gameStatus(board);
    if (outcome.state !== 'playing') result = outcome;
  }

  function clear() {
    board = createBoard();
    moves = 0;
    result = null;
  }

  return {
    getPlayer: () => player,
    getState: state,

    /** L'avversario si e' collegato: si puo' giocare. */
    start() {
      connected = true;
      emit();
    },

    /** Tenta una mossa locale; restituisce true se e' stata accettata. */
    playLocal(index) {
      if (status() !== 'playing') return false;
      if (currentPlayer(moves) !== player) return false;
      if (board[index] !== EMPTY) return false;

      applyAt(index, player);
      send(encodeMove(index));
      emit();
      return true;
    },

    /** Elabora un messaggio ricevuto dall'avversario. */
    receive(raw) {
      const message = decode(raw);
      if (!message) return;

      if (message.t === 'reset') {
        clear();
        emit();
        return;
      }

      if (message.t === 'move') {
        if (status() !== 'playing') return;
        if (currentPlayer(moves) !== opponent) return; // non e' il suo turno
        if (board[message.i] !== EMPTY) return; // cella occupata
        applyAt(message.i, opponent);
        emit();
      }
    },

    /** Ricomincia solo in locale (senza avvisare l'avversario). */
    reset() {
      clear();
      emit();
    },

    /** Ricomincia e avvisa l'avversario. */
    requestReset() {
      clear();
      send(encodeReset());
      emit();
    },

    /** L'avversario si e' disconnesso. */
    disconnect() {
      connected = false;
      emit();
    },
  };
}
