/**
 * Trasporto di rete per il gioco a due, basato su PeerJS (WebRTC).
 *
 * Sicurezza:
 *   - i due browser si collegano direttamente (P2P); WebRTC cifra gia' il
 *     canale con DTLS, il server di segnalazione non vede i dati di gioco;
 *   - IN PIU', ogni messaggio viene cifrato con AES-GCM usando una chiave
 *     derivata dal PIN condiviso "a voce" (vedi crypto.js);
 *   - all'apertura del canale c'e' uno scambio di saluto cifrato: chi non
 *     conosce il PIN non supera l'handshake e viene rifiutato.
 *
 * PeerJS viene caricato solo quando serve (le modalita' locali restano
 * funzionanti anche offline).
 */
import { decrypt, deriveKey, encrypt } from './crypto.js';
import { generateCode, normalizeCode, peerIdFor } from './room.js';

const PEERJS_URL = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
const HELLO = { t: 'hello' };

let peerJsPromise = null;

/** Carica (una sola volta) la libreria PeerJS. */
function loadPeerJs() {
  if (globalThis.Peer) return Promise.resolve(globalThis.Peer);

  if (!peerJsPromise) {
    peerJsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = PEERJS_URL;
      script.async = true;
      script.onload = () =>
        globalThis.Peer ? resolve(globalThis.Peer) : reject(new Error('PeerJS non disponibile'));
      script.onerror = () => {
        peerJsPromise = null;
        reject(new Error('Impossibile caricare PeerJS: serve la connessione a Internet.'));
      };
      document.head.append(script);
    });
  }

  return peerJsPromise;
}

/** Attende il primo evento tra quelli indicati, poi rimuove i listener. */
function firstEvent(emitter, names) {
  return new Promise((resolve) => {
    const handlers = {};
    const cleanup = () => names.forEach((name) => emitter.off(name, handlers[name]));
    for (const name of names) {
      handlers[name] = (...args) => {
        cleanup();
        resolve({ name, args });
      };
      emitter.on(name, handlers[name]);
    }
  });
}

const describeError = (error) => error?.type ?? error?.message ?? 'errore di rete';

/** WebCrypto serve per cifrare il canale: disponibile solo in contesto sicuro. */
function assertSecureContext() {
  if (!globalThis.crypto?.subtle) {
    throw new Error('La modalità in rete richiede una pagina https.');
  }
}

/**
 * Collega una DataConnection: gestisce cifratura, handshake e inoltro dei
 * messaggi di gioco.
 */
function attachConnection(conn, { key, isHost, onEvent }) {
  let authenticated = false;

  const send = async (payload) => {
    conn.send(await encrypt(key, payload));
  };

  conn.on('open', () => {
    if (!isHost) send(HELLO); // l'ospite si presenta per primo
  });

  conn.on('data', async (raw) => {
    const message = await decrypt(key, raw);

    if (!message) {
      if (!authenticated) conn.close(); // PIN errato o intruso
      return;
    }

    if (!authenticated) {
      if (message.t !== 'hello') {
        conn.close();
        return;
      }
      authenticated = true;
      if (isHost) send(HELLO);
      onEvent({ type: 'connected' });
      return;
    }

    if (message.t === 'move' || message.t === 'reset') {
      onEvent({ type: 'message', message });
    }
  });

  conn.on('close', () => onEvent({ type: 'closed' }));
  conn.on('error', (error) => onEvent({ type: 'error', error }));

  return { send, close: () => conn.close() };
}

function makeLink({ peer, code, getHandle }) {
  return {
    code,
    role: peer.role,
    async send(message) {
      const handle = getHandle();
      if (handle) await handle.send(message);
    },
    close() {
      try {
        peer.destroy();
      } catch {
        /* gia' chiuso */
      }
    },
  };
}

/** Crea una stanza come host (gioca con X). */
async function createHost({ onEvent }) {
  const Peer = await loadPeerJs();
  let lastError = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    const key = await deriveKey(code);
    const peer = new Peer(peerIdFor(code));
    peer.role = 'host';

    const outcome = await firstEvent(peer, ['open', 'error']);
    if (outcome.name === 'open') {
      let activeHandle = null;
      let connected = false;

      peer.on('connection', (conn) => {
        if (connected) {
          conn.close();
          return;
        }
        const handle = attachConnection(conn, {
          key,
          isHost: true,
          onEvent: (event) => {
            if (event.type === 'connected') {
              if (connected) {
                conn.close();
                return;
              }
              connected = true;
              activeHandle = handle;
              onEvent(event);
              return;
            }

            // Dal resto ci interessa solo la connessione autenticata: chi
            // bussa con un codice sbagliato viene ignorato in silenzio.
            if (activeHandle !== handle) return;

            if (event.type === 'closed') {
              connected = false;
              activeHandle = null;
            }
            onEvent(event);
          },
        });
      });

      peer.on('error', (error) => onEvent({ type: 'error', error }));
      return makeLink({ peer, code, getHandle: () => activeHandle });
    }

    peer.destroy();
    lastError = outcome.args[0];
    if (lastError?.type !== 'unavailable-id') break;
  }

  throw new Error(`Creazione stanza non riuscita (${describeError(lastError)})`);
}

/** Si unisce a una stanza esistente (gioca con O). */
async function createGuest({ pin, onEvent }) {
  const code = normalizeCode(pin);
  if (!code) throw new Error('Inserisci il codice della partita.');

  const Peer = await loadPeerJs();
  const key = await deriveKey(code);
  const peer = new Peer();
  peer.role = 'guest';

  const opened = await firstEvent(peer, ['open', 'error']);
  if (opened.name !== 'open') {
    peer.destroy();
    throw new Error(`Connessione non riuscita (${describeError(opened.args[0])})`);
  }

  peer.on('error', (error) => onEvent({ type: 'error', error }));

  const conn = peer.connect(peerIdFor(code), { reliable: true });
  const handle = attachConnection(conn, { key, isHost: false, onEvent });

  return makeLink({ peer, code, getHandle: () => handle });
}

/** Crea il collegamento: `role` = 'host' oppure 'guest'. */
export async function createLink({ role, pin = '', onEvent = () => {} }) {
  assertSecureContext();
  return role === 'host' ? createHost({ onEvent }) : createGuest({ pin, onEvent });
}
