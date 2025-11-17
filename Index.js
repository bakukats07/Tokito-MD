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

const ask = q => new Promise(res => rl.question(q, res));

async function iniciar() {
  console.clear();
  console.log(`
=====================================================
 🔐 SISTEMA UNIVERSAL TOKITO-MD – BAILEYS LOGIN
    MODO FORZADO: ANDROID TABLET COMPANION
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

  // ====================================================
  // 🔥 FORZAR MODO ANDROID TABLET (ESTE ES EL TRUCO)
  // ====================================================
  const forcedBrowser = [
    "WhatsApp",
    "Android Tablet",
    "2.23.18"
  ];

  // ====================================================
  // CASO 1: PAIRING CODE
  // ====================================================
  if (metodo === "2" && !state.creds.registered) {
    console.log("\n🔌 Generando pairing code...\n");

    const sock = makeWASocket({
      version,
      printQRInTerminal: false,
      browser: forcedBrowser,    // ← FUERZA MODO TABLET
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys)
      },
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false
    });

    await delay(700); // necesario para evitar cierre instantáneo

    try {
      const code = await sock.requestPairingCode(numero);
      console.log("\n👉 TU CÓDIGO DE 8 DÍGITOS:");
      console.log(code);
      console.log("\n❗ Inserta el código en WhatsApp NORMAL o BUSINESS.\n");
      console.log("Si antes te salía error → AHORA DEBE FUNCIONAR.");
    } catch (err) {
      console.log("❌ Error generando code:", err.message);
    }

    sock.ev.on("creds.update", saveCreds);
    return;
  }

  // ====================================================
  // CASO 2: QR NORMAL
  // ====================================================
  const sock = makeWASocket({
    version,
    printQRInTerminal: metodo === "1",
    browser: forcedBrowser,  // modo tablet aquí también
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys)
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection }) => {
    if (connection === "open") {
      console.log("✅ Conectado correctamente!");
    }
    if (connection === "close") {
      console.log("❌ Conexión cerrada.");
    }
  });
}

iniciar();