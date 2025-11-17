const {
  default: makeWASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  delay
} = require("@whiskeysockets/baileys");

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
const ask = (q) => new Promise((res) => rl.question(q, res));

async function iniciar() {
  console.clear();
  console.log(`
=====================================================
 🔐 SISTEMA UNIVERSAL TOKITO-MD – LOGIN ESTABLE
   COMPATIBLE CON WHATSAPP BUSINESS Y DUAL
=====================================================
[1] Escanear Código QR
[2] Código de 8 dígitos (Pairing)
=====================================================
  `);

  const metodo = await ask("Elige 1 o 2: ");
  const numero = (await ask("Número del bot: ")).trim();

  const sessionDir = path.join(__dirname, "sessions", numero);
  fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  // ====================================================
  // 🟢 MODO TABLET REAL (FUNCIONA EN TODA CLASE DE WhatsApp)
  // ====================================================
  const forcedBrowser = ["WhatsApp", "Android", "13.4.1"];

  // ====================================================
  // ⭐ 1 — CONECTAR CON CÓDIGO DE 8 DÍGITOS
  // ====================================================
  if (metodo === "2" && !state.creds.registered) {
    console.log("\n🔌 Preparando conexión segura...\n");

    const sock = makeWASocket({
      version,
      printQRInTerminal: false,
      browser: forcedBrowser,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys)
      },
      syncFullHistory: false,
      markOnlineOnConnect: false
    });

    await delay(800); // IMPORTANTE

    try {
      // ⚡ Este método sí funciona aunque el normal falle
      const code = await sock.requestPairingCode(numero);

      console.log("\n=============================");
      console.log("👉 TU CÓDIGO DE 8 DÍGITOS:");
      console.log("   " + code);
      console.log("=============================\n");
      console.log("✔ Funciona en WhatsApp NORMAL y BUSINESS");
      console.log("✔ Funciona en modo dual / clonado\n");

    } catch (err) {
      console.log("❌ Error generado el código:");
      console.log(err);
    }

    sock.ev.on("creds.update", saveCreds);
    return;
  }

  // ====================================================
  // ⭐ 2 — MODO QR CLÁSICO
  // ====================================================
  const sock = makeWASocket({
    version,
    printQRInTerminal: metodo === "1",
    browser: forcedBrowser,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys)
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      console.log("✅ Conectado correctamente!");
    }
    if (connection === "close") {
      console.log("❌ Conexión cerrada.", lastDisconnect?.error);
    }
  });
}

iniciar();