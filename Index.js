// index.js — TOKITO-MD (Windows10 Chrome UA) — Pairing+QR+Retries+SafeReconnect
// Node v24+ compatible, Baileys (whiskeysockets) expected installed

const {
  default: makeWASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  delay,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

// --- Settings: tune these to be more/less aggressive
const MAX_PAIR_ATTEMPTS = 6;          // cuántos códigos intentará antes de parar
const BASE_BACKOFF_MS = 1400;         // backoff base (human-like)
const MAX_BACKOFF_MS = 8000;          // máximo entre intentos
const PAIR_JITTER_MS = 600;           // jitter aleatorio para azar humano
const SESSION_ROOT = path.join(__dirname, "sessions");

// --- Fixed UA: Chrome on Windows 10 (intencionalmente "desktop")
const DESKTOP_BROWSER_UA = ["Chrome", "Windows", "10.0"];

// --- Single-instance guard
let activeSocket = null;
let isShuttingDown = false;

// helper: human-like wait
function humanDelay(base = BASE_BACKOFF_MS) {
  const jitter = Math.floor(Math.random() * PAIR_JITTER_MS);
  const wait = Math.min(MAX_BACKOFF_MS, base + jitter);
  return delay(wait);
}

// helper: format pairing code nicely
function formatPairCode(code) {
  if (!code) return "";
  // sometimes code can be like 'ABCD1234' or 'ABCD-1234' — normalize to groups of 4
  const cleaned = code.replace(/[^A-Za-z0-9]/g, "");
  return cleaned.match(/.{1,4}/g)?.join("-") || cleaned;
}

// create session dir for number
function ensureSessionDir(number) {
  const dir = path.join(SESSION_ROOT, number);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// safe close socket
async function closeActiveSocket() {
  try {
    isShuttingDown = true;
    if (activeSocket && activeSocket.ws && activeSocket.ws.socket) {
      try { activeSocket.ws.close(); } catch {}
    }
    activeSocket = null;
  } catch {}
}

// main flow
async function main() {
  console.clear();
  console.log("=====================================================");
  console.log(" 🔐 TOKITO-MD — LOGIN DESKTOP (Chrome on Windows 10)");
  console.log("    Pairing Code (8 dígitos) + QR + Reintentos seguros");
  console.log("=====================================================");
  console.log("[1] Escanear Código QR");
  console.log("[2] Código de 8 dígitos (Pairing)");
  console.log("=====================================================");

  let op = (await ask("Elige 1 o 2: ")).trim();
  if (!["1", "2"].includes(op)) op = "1";

  const isQR = op === "1";
  const numberInput = isQR ? null : (await ask("Número del bot (ej: 573XXXXXXXXX): ")).trim();
  if (!isQR && !numberInput) {
    console.log("Número inválido. Saliendo.");
    process.exit(1);
  }
  const numberClean = isQR ? null : numberInput.replace(/\D/g, "");
  const sessionDir = !isQR ? ensureSessionDir(numberClean) : path.join(SESSION_ROOT, "default");
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  // load multi-file auth state
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  // connection options — desktop-like agent
  const connectionOptions = {
    version,
    printQRInTerminal: isQR,
    browser: DESKTOP_BROWSER_UA,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys)
    },
    syncFullHistory: false,
    markOnlineOnConnect: false,
    // keep alive heartbeat sensible
    keepAliveIntervalMs: 55_000
  };

  // create socket wrapper factory to ensure clean new socket each attempt
  const makeSocket = () => {
    // close previous active socket if exists (clean)
    if (activeSocket) {
      try { activeSocket.ws.close(); } catch {}
      activeSocket = null;
    }
    const sock = makeWASocket(connectionOptions);
    activeSocket = sock;
    // save creds handler
    sock.ev.on("creds.update", saveCreds);
    // connection handler installed below
    return sock;
  };

  // if user requested QR mode: just open socket and wait (simple)
  if (isQR) {
    const sock = makeSocket();
    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
      if (connection === "open") {
        console.log("✅ Conectado (QR) — sesión guardada en:", sessionDir);
      } else if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        console.log("❌ Conexión cerrada. code:", code);
        // if not logged out, try reconnect with backoff
        if (code !== DisconnectReason.loggedOut && !isShuttingDown) {
          console.log("🔄 Intentando reconectar...");
          setTimeout(() => main().catch(console.error), 2000);
        } else {
          console.log("⛔ Sesión desconectada (logged out). Eliminar carpeta si quieres re-pair.");
        }
      }
    });
    return;
  }

  // PAIRING FLOW (8 digits) with controlled retries + UA selection & human delays
  // We'll attempt up to MAX_PAIR_ATTEMPTS tries. Between each attempt we close socket, wait, and re-create with same UA.
  let attempt = 0;
  let lastError = null;
  let usedBrowsers = []; // track used browser signatures to avoid repeating too fast

  while (attempt < MAX_PAIR_ATTEMPTS && !isShuttingDown) {
    attempt++;
    console.log(`\n🔁 Intento ${attempt}/${MAX_PAIR_ATTEMPTS} — preparando socket...`);

    // we keep desktop UA fixed (Chrome Windows), but we randomize a small property: minor version string via environment
    // (this is harmless and keeps agent realistic)
    const dynamicUA = DESKTOP_BROWSER_UA.slice(); // copy
    // append a pseudo-version suffix to make UA slightly different between attempts (human-like)
    const variant = `r${Math.floor(Math.random() * 9999)}`;
    dynamicUA[2] = `2.3000.101-${variant}`;

    // apply dynamic UA to connectionOptions for this attempt
    connectionOptions.browser = dynamicUA;

    const sock = makeSocket();

    // attach connection update handler for feedback
    let paired = false;
    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === "open") {
        console.log("✅ Socket conectado (handshake OK). Esperando que completes el emparejamiento en el teléfono...");
      }
      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        console.log("❌ Socket cerrado. code:", code);
      }
    });

    // small human delay to let socket stabilize
    await delay(700 + Math.floor(Math.random() * 600));

    try {
      // request pairing code
      const rawCode = await sock.requestPairingCode(numberClean);
      const pretty = formatPairCode(rawCode);
      console.log("\n================================");
      console.log("👉 CÓDIGO DE 8 DÍGITOS (pegalo en WhatsApp):");
      console.log("   " + pretty);
      console.log("================================\n");

      // now we wait for the pairing to be accepted. we listen for 'connection.update' open or creds update
      // wait up to a timeout (e.g., 60s) for pairing acceptance
      const accepted = await new Promise(async (resolve) => {
        let resolved = false;
        const timer = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve(false);
          }
        }, 60_000); // 60s max wait for acceptance

        // if creds updated -> saved -> pairing accepted
        const onCreds = () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          resolve(true);
        };

        sock.ev.on("creds.update", onCreds);

        // also listen connection.update for 'open'
        const onConn = ({ connection }) => {
          if (resolved) return;
          if (connection === "open") {
            resolved = true;
            clearTimeout(timer);
            resolve(true);
          }
        };
        sock.ev.on("connection.update", onConn);

        // fallback: if socket closed early, treat as not accepted
        const onClose = ({ connection }) => {
          if (connection === "close" && !resolved) {
            // small delay to allow close to settle
            setTimeout(() => {
              if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                resolve(false);
              }
            }, 200);
          }
        };
        sock.ev.on("connection.update", onClose);
      });

      if (accepted) {
        console.log("🎉 Pairing aceptado — sesión guardada en:", sessionDir);
        // keep the socket running (do not close)
        // attach reconnect handler and normal listeners
        sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
          if (connection === "open") console.log("✅ Conectado (pairing ok).");
          if (connection === "close") {
            const code = lastDisconnect?.error?.output?.statusCode;
            console.log("❌ Conexión cerrada. code:", code);
            // if not logged out try restart main
            if (code !== DisconnectReason.loggedOut && !isShuttingDown) {
              console.log("🔄 Reconectando en breve...");
              setTimeout(() => main().catch(console.error), 2000);
            } else {
              console.log("⛔ Sesión cerrada (logged out). Elimina folder si quieres re-parear.");
            }
          }
        });
        // leave function with active socket
        return;
      } else {
        lastError = new Error("Pairing no aceptado en tiempo límite");
        console.log("⚠ Pairing no aceptado en este intento. Cerrando socket y reintentando...");
      }
    } catch (err) {
      lastError = err;
      console.log("⚠ Error al solicitar pairing code:", err?.message || err);
      // if Baileys throws a specific error meaning server rejected (Connection Closed / Unauthorized), we log and retry
      // do not flood — wait human-like backoff
    } finally {
      // close this attempt's socket cleanly before next attempt
      try { if (sock && sock.ws && sock.ws.socket) sock.ws.close(); } catch {}
      activeSocket = null;
    }

    // wait a human-like backoff before next attempt
    const backoff = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * attempt);
    await humanDelay(backoff);
  } // end while attempts

  console.log("\n⛔ Se alcanzó el número máximo de intentos para pairing.");
  if (lastError) console.log("Último error:", lastError.message || lastError);
  console.log("Sugerencias:");
  console.log(" - Asegúrate que el WhatsApp receptor no esté clonado (no Dual Apps)");
  console.log(" - Intenta en otro teléfono limpio o en un emulador (Bluestacks) como receptor");
  console.log(" - Espera 30-60 minutos (cooldown) antes de reintentar si has hecho muchos intentos");
  process.exit(0);
}

// handle signals
process.on("SIGINT", async () => {
  console.log("\nRecibido SIGINT — cerrando...");
  await closeActiveSocket();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await closeActiveSocket();
  process.exit(0);
});
process.on("unhandledRejection", (r) => {
  console.error("UnhandledRejection:", r && (r.stack || r));
});

main().catch((e) => {
  console.error("Error crítico:", e && (e.stack || e));
  process.exit(1);
});