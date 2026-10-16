/**
 * Codici delle stanze di gioco.
 *
 * Il codice e' pensato per essere letto e comunicato a voce: niente
 * caratteri facilmente confondibili (I/O/0/1).
 */

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const DEFAULT_PREFIX = 'tris-';

/** Genera un codice casuale (deterministico se si passa un `rng`). */
export function generateCode(rng = Math.random, length = CODE_LENGTH) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  }
  return code;
}

/** Normalizza un codice digitato dall'utente (maiuscole, senza separatori). */
export function normalizeCode(input) {
  return String(input ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** Id del peer PeerJS corrispondente a un codice stanza. */
export function peerIdFor(code, prefix = DEFAULT_PREFIX) {
  return `${prefix}${normalizeCode(code)}`;
}
