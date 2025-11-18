// index.js — TOKITO-MD (Navideño Anime/Kawaii - Opción C)
// Node: v20+ (probado en 24.x), CommonJS
// Requisitos: @whiskeysockets/baileys, qrcode, qrcode-terminal
// Copia este archivo a la raíz del bot y ejecuta: node index.js

const {
  default: makeWASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  delay,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const qrcode = require("qrcode");
const qrcodeTerm = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");
const child = require("child_process");
const readline = require("readline");

// ------------------------- Configuración -------------------------
const SESSION_ROOT = path.join(__dirname, "sessions");
const TMP_ROOT = path.join(__dirname, "tmp", "tokito-php");
const QR_SAVE_FOLDER = process.env.ANDROID_SDCARD_PATH || "/sdcard/Tokito-QR";
const MAX_PAIR_ATTEMPTS = 6;
const PAIR_WAIT_TIMEOUT = 60_000;
const BACKOFF_BASE = 1400;
const USER_AGENT = ["Safari", "Android", "13"]; // UA recomendado para pairing
const DUMPER_INTERVAL_MS = 5000;
const MAX_TMP_FILES = 150;

// Asegurar carpetas
if (!fs.existsSync(SESSION_ROOT)) fs.mkdirSync(SESSION_ROOT, { recursive: true });
if (!fs.existsSync(TMP_ROOT)) fs.mkdirSync(TMP_ROOT, { recursive: true });
try { if (!fs.existsSync(QR_SAVE_FOLDER)) fs.mkdirSync(QR_SAVE_FOLDER, { recursive: true }); } catch (e) { /* ignore */ }

// ------------------------- Utilidades -------------------------
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(res => rl.question(q, res));

function nowIso() { return new Date().toISOString(); }
function logNavideño(...parts) {
  // Estilo C: kawaii/navideño — emojis suaves
  const prefix = isHolidayMode() ? "❄️🎀 Tokito-MD" : "Tokito-MD";
  console.log(prefix, "-", ...parts);
}
function warnNav(...parts){ console.warn("⚠️", ...parts); }
function errNav(...parts){ console.error("⛔", ...parts); }

function isHolidayMode() {
  // modo navideño activo entre 1 Dic y 10 Ene (año actual/ siguiente)
  const now = new Date();
  const year = now.getFullYear();
  const start = new Date(`${year}-12-01T00:00:00Z`);
  const end = new Date(`${year + 1}-01-10T23:59:59Z`);
  // si hoy está antes de start pero mes es enero -> aún podría caer en rango cuando actual sea enero of same year? 
  // (lo manejamos tal cual: fechas en UTC)
  return now >= start || now <= end;
}

function humanBackoff(attempt) {
  const jitter = Math.floor(Math.random() * 600);
  return Math.min(8000, BACKOFF_BASE * attempt + jitter);
}

function formatPair(raw) {
  if (!raw) return "";
  const clean = String(raw).replace(/[^A-Za-z0-9]/g, "");
  return clean.match(/.{1,4}/g)?.join("-") || clean;
}

function ensureSessionDir(number) {
  const dir = path.join(SESSION_ROOT, String(number));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ------------------------- Sonido (intento general) -------------------------
function playSound() {
  // Simple beep para compatibilidad
  try { process.stdout.write("\x07"); } catch {} // fallback
  // Si prefieres intentar comandos externos, se puede extender aquí
}

// ------------------------- TMP Dumper -------------------------
let dumperInterval = null;
function startDumper() {
  if (dumperInterval) return;
  dumperInterval = setInterval(() => {
    try {
      const fname = `tokito-${Date.now()}.tmp`;
      fs.writeFileSync(path.join(TMP_ROOT, fname), `dump ${nowIso()}`);
      // mantener solo últimos N archivos
      const files = fs.readdirSync(TMP_ROOT).sort();
      if (files.length > MAX_TMP_FILES) {
        const remove = files.slice(0, files.length - MAX_TMP_FILES);
        remove.forEach(f => {
          try { fs.unlinkSync(path.join(TMP_ROOT, f)); } catch {}
        });
      }
    } catch (e) { /* ignore */ }
  }, DUMPER_INTERVAL_MS);
  logNavideño("🗂️ Dumper iniciado (tokito-php).");
}
function stopDumper() {
  if (!dumperInterval) return;
  clearInterval(dumperInterval);
  dumperInterval = null;
  logNavideño("🛑 Dumper detenido.");
}

// ------------------------- QR Guardado y Apertura -------------------------
async function saveAndOpenQR(qr) {
  try {
    if (!fs.existsSync(QR_SAVE_FOLDER)) fs.mkdirSync(QR_SAVE_FOLDER, { recursive: true });
    const out = path.join(QR_SAVE_FOLDER, "qr.png");
    const buf = await qrcode.toBuffer(qr, { width: 500 });
    fs.writeFileSync(out, buf);
    logNavideño("📸 QR guardado en:", out, "— intenta abrirlo desde tu galería.");
    // intentar abrir (termux / xdg-open / open)
    const openCandidates = [
      ["termux-open", out],
      ["xdg-open", out],
      ["open", out],
      // android am (si se puede)
      ["am", "start", "-a", "android.intent.action.VIEW", "-d", `file://${out}`]
    ];
    for (const cmd of openCandidates) {
      try {
        const c = cmd[0];
        const which = child.spawnSync("which", [c]);
        if (which.status === 0) {
          child.spawn(c, cmd.slice(1), { detached: true, stdio: "ignore" }).unref();
          logNavideño("🔎 Intentando abrir con:", c);
          return out;
        }
      } catch (e) { /* ignore */ }
    }
    logNavideño("⚠ No se pudo abrir automáticamente. Abre manualmente:", out);
    return out;
  } catch (e) {
    errNav("Error guardando QR:", e && (e.message || e));
    throw e;
  }
}

// ------------------------- Socket + Factory -------------------------
async function createSocket(sessionDir) {
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const connOptions = {
    version,
    printQRInTerminal: false,
    browser: USER_AGENT,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys) },
    syncFullHistory: false,
    markOnlineOnConnect: false,
    keepAliveIntervalMs: 55_000
  };

  const sock = makeWASocket(connOptions);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update;
    if (qr) {
      // Compact QR in terminal (small)
      try { qrcodeTerm.generate(qr, { small: true }); } catch (e) {}
    }
    if (connection === "open") {
      logNavideño("🎊 Conectado correctamente. 💫");
      playSound();
    }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      warnNav("🔌 Conexión cerrada. code:", code);
      playSound();
      if (code === DisconnectReason.loggedOut) {
        warnNav("→ Sesión cerrada desde el dispositivo. Se eliminará la carpeta de sesión:", sessionDir);
        try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (e) {}
      }
    }
  });

  return sock;
}

// ------------------------- Pairing con reintentos -------------------------
async function pairingFlow(phone) {
  const clean = String(phone).replace(/\D/g, "");
  if (!clean) {
    errNav("Número inválido.");
    return;
  }
  const sessionDir = ensureSessionDir(clean);
  let attempt = 0;
  let lastError = null;

  while (attempt < MAX_PAIR_ATTEMPTS) {
    attempt++;
    logNavideño(`🔁 Intento ${attempt}/${MAX_PAIR_ATTEMPTS} — preparando conexión...`);
    const sock = await createSocket(sessionDir);
    await delay(500 + Math.random() * 600);

    try {
      const raw = await sock.requestPairingCode(clean);
      const pretty = formatPair(raw);
      logNavideño("🎁 CÓDIGO DE 8 DÍGITOS (pégalo en WhatsApp):", pretty);

      // esperar aceptación
      const accepted = await new Promise(resolve => {
        let done = false;
        const timer = setTimeout(() => { if (!done) { done = true; resolve(false); } }, PAIR_WAIT_TIMEOUT);

        const onCreds = () => { if (!done) { done = true; clearTimeout(timer); resolve(true); } };
        const onConn = ({ connection }) => { if (!done && connection === "open") { done = true; clearTimeout(timer); resolve(true); } };

        sock.ev.on("creds.update", onCreds);
        sock.ev.on("connection.update", onConn);
      });

      if (accepted) {
        logNavideño("🎉 Pairing aceptado. Sesión guardada en:", sessionDir);
        // no cerrar el socket, mantiene la conexión
        sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
          if (connection === "open") logNavideño("✅ Reconectado OK.");
          if (connection === "close") {
            const code = lastDisconnect?.error?.output?.statusCode;
            warnNav("❌ Conexión cerrada:", code);
            if (code === DisconnectReason.loggedOut) {
              warnNav("→ Sesión cerrada desde dispositivo. Eliminando:", sessionDir);
              try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (e) {}
            } else {
              logNavideño("🔁 Intentando reconectar...");
              setTimeout(() => mainMenu().catch(console.error), 2000);
            }
          }
        });
        playSound();
        return;
      } else {
        lastError = new Error("pairing timeout");
        warnNav("⚠ Pairing no aceptado en este intento. Cerrando socket...");
      }
    } catch (e) {
      lastError = e;
      warnNav("⚠ Error al solicitar pairing:", e && (e.message || e));
    } finally {
      try { sock.ws.close(); } catch {}
    }

    const waitMs = humanBackoff(attempt);
    logNavideño(`⏳ Esperando ${Math.round(waitMs)}ms antes del siguiente intento...`);
    await delay(waitMs);
  }

  errNav("⛔ Se agotaron los intentos de pairing.");
  if (lastError) errNav("Último error:", lastError.message || lastError);
  logNavideño("Sugerencias: prueba con otro teléfono limpio o emulador; espera 30-60 minutos si has intentado muchas veces.");
}

// ------------------------- SubBots (básico) -------------------------
function subbotsDir() {
  const d = path.join(__dirname, "bots", "subbots");
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}
function listSubBots() {
  const d = subbotsDir();
  return fs.readdirSync(d).filter(x => fs.statSync(path.join(d, x)).isDirectory());
}
function createSubBot(id) {
  const d = path.join(subbotsDir(), id);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  const session = path.join(d, "session");
  if (!fs.existsSync(session)) fs.mkdirSync(session, { recursive: true });
  logNavideño("✨ SubBot creado:", id);
}
function removeSubBot(id) {
  const d = path.join(subbotsDir(), id);
  if (fs.existsSync(d)) {
    fs.rmSync(d, { recursive: true, force: true });
    logNavideño("🗑️ SubBot eliminado:", id);
  } else warnNav("No existe subbot:", id);
}

// ------------------------- Menú Principal (Navideño C) -------------------------
async function mainMenu() {
  while (true) {
    console.clear();
    const title = isHolidayMode()
      ? "❄️🎀 TOKITO-MD — Menú Navideño (CUTE) 🎄✨"
      : "TOKITO-MD — Menú Principal";
    console.log("======================================");
    console.log(title);
    console.log("======================================");
    console.log("[1] Escanear Código QR (guardar png & abrir)");
    console.log("[2] Código de 8 dígitos (Pairing)");
    console.log("[3] SubBots (crear/iniciar/listar/eliminar)");
    console.log("[4] Toggle TMP dumper (tokito-php)");
    console.log("[0] Apagar bot (salir)");
    console.log("======================================");
    const op = (await ask("Elige opción: ")).trim();

    if (op === "0") {
      logNavideño("👋 Apagando Tokito. ¡Feliz día! 🎁");
      process.exit(0);
    }

    if (op === "1") {
      // QR mode — default session "default"
      const sessionDir = path.join(SESSION_ROOT, "default");
      if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
      const { version } = await fetchLatestBaileysVersion();

      const connOptions = {
        version,
        printQRInTerminal: false,
        browser: USER_AGENT,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys) },
        syncFullHistory: false,
        markOnlineOnConnect: false
      };

      const sock = makeWASocket(connOptions);
      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (update) => {
        const { qr, connection, lastDisconnect } = update;
        if (qr) {
          try {
            const out = await saveAndOpenQR(qr);
            logNavideño("📌 QR guardado y mostrado:", out);
          } catch (e) { errNav("❌ Error al guardar/abrir QR:", e && (e.message || e)); }
        }
        if (connection === "open") {
          logNavideño("🎉 Conectado via QR.");
          playSound();
        }
        if (connection === "close") {
          const code = lastDisconnect?.error?.output?.statusCode;
          warnNav("🔌 Conexión cerrada. code:", code);
        }
      });

      logNavideño("🔎 Socket iniciado en modo QR — se guardará qr.png en tu galería cuando esté listo.");
      await delay(1200);
      continue;
    }

    if (op === "2") {
      const phone = (await ask("Número del bot (ej: 573001112233) — escribe 0 para cancelar: ")).trim();
      if (phone === "0") { logNavideño("Cancelado."); await delay(600); continue; }
      await pairingFlow(phone);
      await delay(600);
      continue;
    }

    if (op === "3") {
      while (true) {
        console.clear();
        logNavideño("✨ SUB-BOTS ✨");
        const bots = listSubBots();
        console.log("Existentes:", bots.length ? bots.join(", ") : "— ninguno —");
        console.log("[1] Crear SubBot");
        console.log("[2] Iniciar SubBot (abrir carpeta)");
        console.log("[3] Eliminar SubBot");
        console.log("[4] Volver");
        const sopt = (await ask("Elige: ")).trim();
        if (sopt === "4") break;
        if (sopt === "1") {
          const id = (await ask("ID para SubBot (ej: sub1): ")).trim();
          if (id) createSubBot(id);
          await delay(400);
        } else if (sopt === "2") {
          const id = (await ask("ID a iniciar: ")).trim();
          const d = path.join(subbotsDir(), id);
          if (!fs.existsSync(d)) { warnNav("No existe:", id); await delay(600); continue; }
          logNavideño("📂 Abriendo carpeta del subbot (si procede):", d);
          try {
            const which = child.spawnSync("which", ["termux-open"]);
            if (which.status === 0) child.spawn("termux-open", [d], { detached: true }).unref();
          } catch (e) {}
          await delay(600);
        } else if (sopt === "3") {
          const id = (await ask("ID a eliminar: ")).trim();
          if (id) removeSubBot(id);
          await delay(400);
        } else { warnNav("Opción inválida."); await delay(300); }
      }
      continue;
    }

    if (op === "4") {
      if (dumperInterval) {
        stopDumper();
      } else {
        startDumper();
      }
      await delay(600);
      continue;
    }

    warnNav("Opción inválida.");
    await delay(400);
  }
}

// ------------------------- Start -------------------------
mainMenu().catch(e => {
  errNav("Error crítico:", e && (e.stack || e));
  process.exit(1);
});