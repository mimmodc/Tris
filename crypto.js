/**
 * Crittografia del canale di gioco.
 *
 * I due giocatori condividono un PIN scambiato "fuori banda" (a voce, al
 * telefono). Da quel PIN si deriva una chiave AES-GCM: tutti i messaggi
 * viaggiano cifrati, quindi chi non conosce il PIN:
 *   - non riesce a leggere i messaggi;
 *   - non riesce a forgiarne di validi (la decifratura fallisce).
 *
 * La decifratura restituisce sempre `null` in caso di problemi: nessuna
 * eccezione puo' propagarsi dal traffico di rete.
 */

export const DEFAULT_ITERATIONS = 150000;
export const DEFAULT_SALT = 'tris-p2p-v1';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const subtle = () => globalThis.crypto.subtle;

/** Deriva una chiave AES-GCM (256 bit) dal PIN con PBKDF2. */
export async function deriveKey(
  pin,
  { iterations = DEFAULT_ITERATIONS, salt = DEFAULT_SALT } = {},
) {
  const base = await subtle().importKey('raw', encoder.encode(pin), 'PBKDF2', false, [
    'deriveKey',
  ]);

  return subtle().deriveKey(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Cifra un oggetto. Restituisce una stringa "iv.cifrato" in base64. */
export async function encrypt(key, value) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const data = encoder.encode(JSON.stringify(value));
  const cipher = await subtle().encrypt({ name: 'AES-GCM', iv }, key, data);
  return `${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`;
}

/** Decifra un payload. Restituisce l'oggetto, oppure null se non e' valido. */
export async function decrypt(key, payload) {
  if (typeof payload !== 'string') return null;

  const [ivPart, cipherPart] = payload.split('.');
  if (!ivPart || !cipherPart) return null;

  try {
    const iv = fromBase64(ivPart);
    const cipher = fromBase64(cipherPart);
    const plain = await subtle().decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return JSON.parse(decoder.decode(plain));
  } catch {
    return null;
  }
}
