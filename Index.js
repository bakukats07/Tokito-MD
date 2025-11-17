const {
  default: makeWASocket,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");
const fs = require("fs");
const path = require("path");
const rl = require("readline").createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = q => new Promise(r => rl.question(q, r));

async function iniciar() {
  console.clear();
  console.log(`
===============================
   SISTEMA TOKITO-MD
   LOGIN UNIVERSAL WHATSAPP
===============================
[1] Código QR
[2] Código de 8 dígitos
`);

  const metodo = await ask("Elige 1 o 2: ");
  const numero = await ask("Número del bot: ");

  const sessionPath = path.join(__dirname, "sessions", numero);
  fs.mkdirSync(sessionPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  // 👇 PRIMERO CREAMOS SOCKET PERO **SIN** LOGIN REAL
  const sock = makeWASocket({
    version,
    printQRInTerminal: metodo === "1",
    browser: ["Chrome", "Windows", "10.0"],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys)
    },
    // 🔥 IMPORTANTÍSIMO: NO AUTOCONECTAR
    connectTimeoutMs: 0
  });

  // ======================================================
  //      AQUI SE PIDE EL PAIRING CODE *ANTES* DE LOGIN
  // ======================================================
  if (metodo === "2" && !state.creds.registered) {
    try {
      const code = await sock.requestPairingCode(numero);
      console.log("\n🔐 TU CÓDIGO:");
      console.log("👉", code, "\n");
      console.log("Insértalo en WhatsApp Business / Normal / Dual.\n");
    } catch (e) {
      console.log("Error generando code:", e.message);
    }
  }

  // --------------------------------------------------
  //  AHORA sí conectamos (DESPUÉS del pairing code)
  // --------------------------------------------------
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection }) => {
    if (connection === "open")
      console.log("✅ Sesión conectada!");
  });
}

iniciar();