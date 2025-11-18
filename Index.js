// index.js — TOKITO-MD Paired Mode estable (Safari + Android 13)
// Compatible con Node 20+, Baileys whiskeysockets edición pairing actual

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
const ask = (q) => new Promise(res => rl.question(q, res));

// --- ajustes ---
const MAX_PAIR_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 1500;
const MAX_BACKOFF_MS = 9000;
const PAIR_WAIT_TIMEOUT = 65000; // 65s

// UA más estable actualmente (simula WebView Android)
const SAFARI_ANDROID_UA = ["Safari", "Android", "13"];

// sesiones
const SESSION_ROOT = path.join(__dirname, "sessions");
if (!fs.existsSync(SESSION_ROOT)) fs.mkdirSync(SESSION_ROOT, { recursive: true });

// espera humana
function humanWait(ms = BASE_BACKOFF_MS) {
  const jitter = Math.floor(Math.random() * 400);
  const final = Math.min(MAX_BACKOFF_MS, ms + jitter);
  return delay(final);
}

// formatear código
function formatCode(code = "") {
  const clean = code.replace(/[^A-Za-z0-9]/g, "");
  return clean.match(/.{1,4}/g)?.join("-") || clean;
}

// crear carpeta
function ensureSessionDir(n) {
  const d = path.join(SESSION_ROOT, n);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}

async function startQRMode() {
  const sessionDir = path.join(SESSION_ROOT, "default");
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    printQRInTerminal: true,
    browser: SAFARI_ANDROID_UA,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys) },
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "open") console.log("✅ Conectado (QR).");
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log("❌ Conexión cerrada:", code);
      if (code !== DisconnectReason.loggedOut) {
        console.log("🔄 Reintentando en 2s...");
        setTimeout(() => startQRMode(), 2000);
      }
    }
  });
}

async function startPairing(number) {
  const clean = number.replace(/\D/g, "");
  const sessionDir = ensureSessionDir(clean);

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  let attempt = 0;

  while (attempt < MAX_PAIR_ATTEMPTS) {
    attempt++;
    console.clear();
    console.log(`🔁 Intento ${attempt}/${MAX_PAIR_ATTEMPTS}`);

    const sock = makeWASocket({
      version,
      printQRInTerminal: false,
      browser: SAFARI_ANDROID_UA,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys) },
      syncFullHistory: false,
      markOnlineOnConnect: false
    });

    sock.ev.on("creds.update", saveCreds);

    await delay(600 + Math.random() * 500);

    try {
      const rawCode = await sock.requestPairingCode(clean);
      const pretty = formatCode(rawCode);

      console.log("================================");
      console.log("👉 CÓDIGO DE 8 DÍGITOS:");
      console.log("   " + pretty);
      console.log("================================");

      const success = await new Promise(resolve => {
        let done = false;
        const timer = setTimeout(() => !done && resolve(false), PAIR_WAIT_TIMEOUT);

        sock.ev.on("creds.update", () => {
          if (!done) {
            done = true;
            clearTimeout(timer);
            resolve(true);
          }
        });

        sock.ev.on("connection.update", ({ connection }) => {
          if (connection === "open" && !done) {
            done = true;
            clearTimeout(timer);
            resolve(true);
          }
        });
      });

      if (success) {
        console.log("🎉 PAIRING ACEPTADO — sesión guardada en:", sessionDir);

        sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
          if (connection === "open") console.log("✅ Reconectado OK");
          if (connection === "close") {
            const code = lastDisconnect?.error?.output?.statusCode;
            console.log("❌ Conexión cerrada:", code);
            if (code !== DisconnectReason.loggedOut) {
              console.log("🔄 Reintentando en 2s...");
              setTimeout(() => startPairing(clean), 2000);
            }
          }
        });

        return;
      } else {
        console.log("⚠ Pairing NO aceptado. Cerrando socket...");
      }
    } catch (e) {
      console.log("⚠ Error solicitando pairing:", e.message);
    }

    try { sock.ws.close(); } catch {}
    await humanWait(BASE_BACKOFF_MS * attempt);
  }

  console.log("⛔ Se agotaron los intentos. Cooldown 30–60 min recomendado.");
}

(async () => {
  console.clear();
  console.log("======================================");
  console.log(" TOKITO-MD — Login (Safari Android UA)");
  console.log("======================================");
  console.log("[1] Escanear QR");
  console.log("[2] Código de 8 dígitos");
  console.log("======================================");

  const op = (await ask("Opción: ")).trim();

  if (op === "1") return startQRMode();
  if (op === "2") {
    const num = await ask("Número (ej: 573001112233): ");
    return startPairing(num.trim());
  }

  console.log("Opción inválida.");
  process.exit(0);
})();