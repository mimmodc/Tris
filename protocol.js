/**
 * Protocollo dei messaggi scambiati tra i due giocatori.
 *
 * Volutamente minimale e "a prova di errore": `decode` restituisce null per
 * qualunque cosa non sia un messaggio valido, cosi' un peer ostile o una
 * connessione sporca non possono rompere la partita.
 */

export const HOST_PLAYER = 'X';
export const GUEST_PLAYER = 'O';

/** Chi crea la stanza gioca con X, chi si unisce con O. */
export function playerFor(isHost) {
  return isHost ? HOST_PLAYER : GUEST_PLAYER;
}

/** Messaggio: "ho giocato nella cella `index`". */
export function encodeMove(index) {
  return { t: 'move', i: index };
}

/** Messaggio: "ricominciamo". */
export function encodeReset() {
  return { t: 'reset' };
}

/** Decodifica un messaggio, accettando oggetti o stringhe JSON. */
export function decode(raw) {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (!value || typeof value !== 'object') return null;

  if (value.t === 'reset') return { t: 'reset' };

  if (value.t === 'move') {
    const index = value.i;
    if (!Number.isInteger(index) || index < 0 || index > 8) return null;
    return { t: 'move', i: index };
  }

  return null;
}
