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
  // CASO 1 → PAIRING CODE
  // ============================
  if (metodo === "2" && !state.creds.registered) {
    console.log("\n🔌 Generando pairing code...\n");

    // ⚠ Crear socket en modo HEADLESS especial
    const sock = makeWASocket({
      version,
      printQRInTerminal: false,
      browser: ["Tokito-MD", "Dual", "1.0"],
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys)
      }
    });

    // ⚠ Esperar a que esté listo antes de pedir el código
    await delay(500);

    try {
      const code = await sock.requestPairingCode(numero);
      console.log("👉 TU CÓDIGO DE 8 DÍGITOS:", code);
      console.log("\nInsértalo en WhatsApp Business / Normal / Dual.\n");

    } catch (err) {
      console.log("❌ Error generando código:", err.message);
    }

    sock.ev.on("creds.update", saveCreds);

    return;
  }

  // ============================
  // CASO 2 → QR NORMAL
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

  sock.ev.on("connection.update", ({ connection }) => {
    if (connection === "open") console.log("✅ Conectado!");
    if (connection === "close") console.log("❌ Conexión cerrada.");
  });
}

iniciar();