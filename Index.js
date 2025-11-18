// Index.js — TOKITO-MD (mejorado)
// Requiere: @whiskeysockets/baileys, qrcode, qrcode-terminal
// Node v24+, CommonJS

const {
  default: makeWASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  delay,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const qrcodeLib = require("qrcode");
const qrcodeTerm = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");
const child = require("child_process");
const readline = require("readline");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(res => rl.question(q, res));

/* ------------------ CONFIG ------------------ */
const SESSION_ROOT = path.join(__dirname, "sessions");
const TMP_ROOT = path.join(__dirname, "tmp", "tokito-php");
if (!fs.existsSync(TMP_ROOT)) fs.mkdirSync(TMP_ROOT, { recursive: true });
const QR_SAVE_FOLDER = process.env.ANDROID_SDCARD_PATH || "/sdcard/Tokito-QR"; // tries /sdcard
const MAX_PAIR_ATTEMPTS = 6;
const PAIR_WAIT_TIMEOUT = 60_000; // ms to wait for acceptance
const BACKOFF_BASE = 1400;
const USER_AGENT = ["Safari", "Android", "13"]; // you can change: ["Chrome","Windows","10.0"]
const DUMPER_ENABLED_DEFAULT = false; // si quieres que empiece a spamear tmp por defecto

// Ensure folders
if (!fs.existsSync(SESSION_ROOT)) fs.mkdirSync(SESSION_ROOT, { recursive: true });
if (!fs.existsSync(TMP_ROOT)) fs.mkdirSync(TMP_ROOT, { recursive: true });
if (!fs.existsSync(QR_SAVE_FOLDER)) {
  try { fs.mkdirSync(QR_SAVE_FOLDER, { recursive: true }); } catch(e){ /* ignore */ }
}

/* ------------------ UTIL ------------------ */
function log(...a) { console.log(...a); }
function warn(...a) { console.warn(...a); }
function err(...a) { console.error(...a); }

function humanBackoff(attempt) {
  const jitter = Math.floor(Math.random() * 600);
  return Math.min(8000, BACKOFF_BASE * attempt + jitter);
}

function formatPair(raw) {
  const clean = (raw || "").replace(/[^A-Za-z0-9]/g, "");
  return clean.match(/.{1,4}/g)?.join("-") || clean;
}

function ensureSessionDir(num) {
  const d = path.join(SESSION_ROOT, num);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}

// Play sound helper: tries termux, afplay (mac), paplay (linux), play (sox), aplay; fallback bell
function playSound(event = "connect") {
  const files = {
    connect: null, // user can set file paths or leave null for short beep
    close: null
  };
  // minimal: try platform-specific players for a short tone
  const tryCmds = [
    // termux
    ["termux-media-player", "play", "/system/media/audio/ui/Effect_Tick.ogg"], // may not exist
    // Android generic intent open won't play easily, skip
    // macOS
    ["afplay", "/System/Library/Sounds/Glass.aiff"],
    // linux
    ["paplay", "/usr/share/sounds/freedesktop/stereo/complete.oga"],
    ["play", "-n synth 0.08 sin 880"], // sox
    ["aplay", "/usr/share/sounds/alsa/Front_Center.wav"]
  ];
  // Try to run a command that exists
  for (const cmd of tryCmds) {
    try {
      // if the command is composite string (like "play ..."), split
      const c0 = cmd[0];
      if (!c0) continue;
      // check if executable exists in PATH
      const which = child.spawnSync("which", [c0]);
      if (which.status === 0) {
        // spawn asynchronously
        try {
          if (cmd.length === 1) child.spawn(c0);
          else child.spawn(c0, cmd.slice(1), { stdio: "ignore", detached: true }).unref();
          return;
        } catch (e) { /* continue to next */ }
      }
    } catch (e) { /* ignore */ }
  }
  // fallback: bell
  process.stdout.write("\x07");
}

/* ------------------ TMP DUMPER ------------------ */
let dumperInterval = null;
function startDumper() {
  if (dumperInterval) return;
  dumperInterval = setInterval(() => {
    const filename = `tokito-${Date.now()}.tmp`;
    try {
      fs.writeFileSync(path.join(TMP_ROOT, filename), `dump ${new Date().toISOString()}`);
      // keep only last 100 files
      const kids = fs.readdirSync(TMP_ROOT).sort();
      if (kids.length > 150) {
        const remove = kids.slice(0, kids.length - 150);
        remove.forEach(f => {
          try { fs.unlinkSync(path.join(TMP_ROOT, f)); } catch {}
        });
      }
    } catch (e) { /* ignore */ }
  }, 5_000); // every 5s
}
function stopDumper() {
  if (!dumperInterval) return;
  clearInterval(dumperInterval);
  dumperInterval = null;
}

/* ------------------ QR FILE OPEN ------------------ */
function saveAndOpenQR(qr) {
  try {
    if (!fs.existsSync(QR_SAVE_FOLDER)) fs.mkdirSync(QR_SAVE_FOLDER, { recursive: true });
    const out = path.join(QR_SAVE_FOLDER, "qr.png");
    const buf = qrcodeLib.toBufferSync(qr, { width: 512 });
    fs.writeFileSync(out, buf);
    log("\n=======================");
    log("        QR LISTO");
    log("=======================\n");
    log("✔ Guardado en:", out);
    log("📱 Intentando abrir en dispositivo (si está disponible)...");
    // Try to open automatically on Android (termux), Linux, mac
    // Termux: termux-open
    const tryOpen = () => {
      const apps = [
        ["termux-open", out],
        ["xdg-open", out],
        ["open", out], // mac
        // android am (may fail if path not allowed) — use file://
        ["am", "start", "-a", "android.intent.action.VIEW", "-d", `file://${out}`]
      ];
      for (const args of apps) {
        try {
          const c = args[0];
          const which = child.spawnSync("which", [c]);
          if (which.status === 0) {
            child.spawn(c, args.slice(1), { stdio: "ignore", detached: true }).unref();
            return true;
          }
        } catch (e) { /* ignore */ }
      }
      return false;
    };
    const opened = tryOpen();
    if (!opened) log("⚠ No se pudo abrir automáticamente. Abre manualmente:", out);
  } catch (e) {
    err("❌ Error al crear qr.png:", e?.message || e);
  }
}

/* ------------------ SOCKET / PAIRING FLOW ------------------ */
async function createSocket(sessionDir, opts = {}) {
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

  // base connection updates
  sock.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update;
    if (qr) {
      // small terminal QR for convenience
      try { qrcodeTerm.generate(qr, { small: true }); } catch {}
    }

    if (connection === "open") {
      log("✅ Bot conectado correctamente.");
      playSound("connect"); // sonido al conectar
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      warn("❌ Conexión cerrada. code:", code);
      playSound("close"); // sonido al cerrar
      // if session logged out, remove session dir to allow fresh pairing
      if (code === DisconnectReason.loggedOut) {
        warn("→ Sesión cerrada desde el dispositivo. Eliminando carpeta de sesión:", sessionDir);
        try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (e) {}
      }
    }
  });

  return sock;
}

/* ------------------ PAIRING WITH RETRIES ------------------ */
async function pairingFlow(phone, options = {}) {
  const clean = phone.replace(/\D/g, "");
  if (!clean) { err("Número inválido."); return; }
  const sessionDir = ensureSessionDir(clean);
  let attempt = 0;
  let lastErr = null;

  while (attempt < MAX_PAIR_ATTEMPTS) {
    attempt++;
    log(`\n🔁 Intento ${attempt}/${MAX_PAIR_ATTEMPTS} — preparando socket...`);
    const sock = await createSocket(sessionDir);
    // small wait for socket handshake
    await delay(500 + Math.random() * 600);

    try {
      const raw = await sock.requestPairingCode(clean);
      const pretty = formatPair(raw);
      log("\n================================");
      log("👉 CÓDIGO DE 8 DÍGITOS (pégalos en WhatsApp):");
      log("   " + pretty);
      log("================================\n");

      // wait for accept (creds.update or connection.open)
      const accepted = await new Promise((resolve) => {
        let done = false;
        const timer = setTimeout(() => {
          if (!done) { done = true; resolve(false); }
        }, PAIR_WAIT_TIMEOUT);

        const onCreds = () => { if (!done) { done = true; clearTimeout(timer); resolve(true); } };
        const onConn = ({ connection }) => { if (!done && connection === "open") { done = true; clearTimeout(timer); resolve(true); } };
        sock.ev.on("creds.update", onCreds);
        sock.ev.on("connection.update", onConn);
      });

      if (accepted) {
        log("🎉 Pairing aceptado, sesión guardada en:", sessionDir);
        // keep socket running
        sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
          if (connection === "open") log("✅ Reconectado OK");
          if (connection === "close") {
            const code = lastDisconnect?.error?.output?.statusCode;
            log("❌ Conexión cerrada:", code);
            playSound("close");
            if (code === DisconnectReason.loggedOut) {
              warn("→ Sesión cerrada desde dispositivo. Eliminando:", sessionDir);
              try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch {}
            } else {
              log("🔄 Intentando reconectar...");
              setTimeout(() => mainMenu().catch(console.error), 2000);
            }
          }
        });
        playSound("connect");
        return;
      } else {
        lastErr = new Error("Pairing no aceptado (timeout)");
        log("⚠ Pairing no aceptado en este intento. Cerrando socket...");
      }
    } catch (e) {
      lastErr = e;
      warn("⚠ Error al solicitar pairing:", e?.message || e);
    } finally {
      try { sock.ws.close(); } catch {}
    }

    const waitMs = humanBackoff(attempt);
    log(`⏳ Esperando ${Math.round(waitMs)}ms antes del siguiente intento...`);
    await delay(waitMs);
  }

  err("⛔ Se agotaron los intentos para pairing.");
  if (lastErr) err("Último error:", lastErr.message || lastErr);
  log("Sugerencias:\n - Prueba con otro teléfono limpio o emulador.\n - Espera 30-60 minutos si has intentado muchas veces.\n - Verifica que no haya apps dual/clonadas interfiriendo.");
}

/* ------------------ SUB-BOTS ------------------ */
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
  // create minimal session folder
  const session = path.join(d, "session");
  if (!fs.existsSync(session)) fs.mkdirSync(session, { recursive: true });
  log("✔ SubBot creado:", id, "en", d);
}
function removeSubBot(id) {
  const d = path.join(subbotsDir(), id);
  if (fs.existsSync(d)) {
    fs.rmSync(d, { recursive: true, force: true });
    log("✔ SubBot eliminado:", id);
  } else warn("No existe subbot:", id);
}

/* ------------------ MAIN MENU ------------------ */
async function mainMenu() {
  console.clear();
  log("======================================");
  log(" TOKITO-MD — Menu Principal");
  log("======================================");
  log("[1] Escanear Código QR (guardar png & abrir)");
  log("[2] Código de 8 dígitos (Pairing)");
  log("[3] SubBots (crear/iniciar/listar/eliminar)");
  log("[4] Toggle TMP dumper (spammer de /tmp/tokito-php)");
  log("[0] Apagar bot (salir)");
  log("======================================");
  const op = (await ask("Elige opción: ")).trim();

  if (op === "0") {
    log("Apagando..."); process.exit(0);
  }

  if (op === "1") {
    // QR mode, one default session
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
        // save QR as png and attempt to open
        saveAndOpenQR(qr);
      }
      if (connection === "open") {
        log("✔ Conectado!");
        playSound("connect");
      }
      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        log("❌ CERRADO. code:", code);
        playSound("close");
      }
    });

    // return to menu automatically after some time or keep running? We'll return user to menu while socket runs.
    log("Socket iniciado en modo QR (se guarda qr.png cuando esté listo). Volviendo al menú...");
    await delay(1200);
    return mainMenu();
  }

  if (op === "2") {
    const phone = (await ask("Número del bot (ej: 573001112233) — escribe 0 para cancelar: ")).trim();
    if (phone === "0") { log("Cancelado"); return mainMenu(); }
    await pairingFlow(phone);
    log("Volviendo al menú...");
    await delay(600);
    return mainMenu();
  }

  if (op === "3") {
    // SubBots menu
    while (true) {
      console.clear();
      log("===== SUB-BOTS =====");
      const list = listSubBots();
      log("Existentes:", list.length ? list.join(", ") : "— ninguno —");
      log("[1] Crear SubBot");
      log("[2] Iniciar SubBot (no implementado auto-run, abre su carpeta)");
      log("[3] Eliminar SubBot");
      log("[4] Volver");
      const sopt = (await ask("Elige: ")).trim();
      if (sopt === "4") break;
      if (sopt === "1") {
        const id = (await ask("ID para SubBot (ej: sub1): ")).trim();
        if (id) createSubBot(id);
        await delay(400);
      } else if (sopt === "2") {
        const id = (await ask("ID a iniciar: ")).trim();
        const d = path.join(subbotsDir(), id);
        if (!fs.existsSync(d)) { warn("No existe:", id); await delay(600); continue; }
        log("Abrir carpeta del subbot en el gestor de archivos (si on Android se intenta abrir).", d);
        // try to open folder
        try {
          const which = child.spawnSync("which", ["termux-open"]);
          if (which.status === 0) child.spawn("termux-open", [d], { detached: true }).unref();
        } catch (e) {}
        await delay(600);
      } else if (sopt === "3") {
        const id = (await ask("ID a eliminar: ")).trim();
        if (id) removeSubBot(id);
        await delay(400);
      }
    }
    return mainMenu();
  }

  if (op === "4") {
    // Toggle dumper
    if (dumperInterval) {
      stopDumper();
      log("Dumper detenido.");
    } else {
      startDumper();
      log("Dumper iniciado. Escribiendo archivos en:", TMP_ROOT);
    }
    await delay(600);
    return mainMenu();
  }

  log("Opción inválida.");
  await delay(600);
  return mainMenu();
}

/* ------------------ START ------------------ */
mainMenu().catch(e => {
  err("Error crítico:", e && (e.stack || e));
  process.exit(1);
});