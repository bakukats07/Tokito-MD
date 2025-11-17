const {
  default: makeWASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  DisconnectReason,
  delay
} = require("@whiskeysockets/baileys");

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = q => new Promise(res => rl.question(q, res));

async function startBot() {
  console.clear();
  console.log(`
=====================================================
 🔐 SISTEMA UNIVERSAL TOKITO-MD – BAILEYS LOGIN
=====================================================
[1] Escanear Código QR
[2] Código de 8 dígitos (Pairing)
=====================================================
  `);

  const metodo = await ask("Elige 1 o 2: ");
  const numero = await ask("Número del bot: ");

  const sessionDir = path.join(__dirname, "sessions", numero);
  fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  // ============================
  // CASO → CÓDIGO DE 8 DÍGITOS
  // ============================
  if (metodo === "2" && !state.creds.registered) {
    console.log("\n🔌 Generando pairing code...\n");

    const sock = makeWASocket({
      version,
      printQRInTerminal: false,
      browser: ["Tokito-MD", "Dual", "1.0"],
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys)
      }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", update => {
      const { connection } = update;

      if (connection === "open") {
        console.log("✅ Conexión establecida, esperando registro...");
      }

      if (connection === "close") {
        console.log("❌ Conexión cerrada.");
        const shouldReconnect =
          update.lastDisconnect?.error?.output?.statusCode !==
          DisconnectReason.loggedOut;

        if (shouldReconnect) {
          console.log("🔄 Reintentando conexión...");
          startBot();
        } else {
          console.log("⚠ Sesión inválida. Borrando archivos…");
          fs.rmSync(sessionDir, { recursive: true, force: true });
        }
      }
    });

    // ==== 🔥 GENERAR CÓDIGO DE EMPAREJAMIENTO ====
    await delay(800);
    try {
      const code = await sock.requestPairingCode(numero);
      console.log("\n👉 TU CÓDIGO DE 8 DÍGITOS:", code);
      console.log("Insértalo en WhatsApp Business / Normal / Dual.\n");
    } catch (e) {
      console.log("❌ Error generando código:", e.message);
    }

    return;
  }

  // ============================
  // CASO → QR
  // ============================
  const sock = makeWASocket({
    version,
    printQRInTerminal: metodo === "1",
    browser: ["Tokito-MD", "Dual", "1.0"],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys)
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", update => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log("✅ Conectado correctamente!");
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log("❌ Conexión cerrada. Razón:", reason);

      if (reason !== DisconnectReason.loggedOut) {
        console.log("🔄 Reconectando...");
        startBot();
      } else {
        console.log("⚠ Sesión inválida. Eliminando carpeta...");
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    }
  });
}

startBot();