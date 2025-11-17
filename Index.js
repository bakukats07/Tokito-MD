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

  // 🔥 El socket NORMAL (Baileys ya hace auto-conexión)
  const sock = makeWASocket({
    version,
    printQRInTerminal: metodo === "1",
    browser: ["Tokito-MD", "Dual", "1.0"],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys)
    },
  });

  // ======================================================
  //    P A I R I N G    C O D E
  // ======================================================
  if (metodo === "2" && !state.creds.registered) {
    try {
      // Esperar a que Baileys esté listo para pedir pairing
      sock.ev.once("connection.update", async ({ connection }) => {
        if (connection === "open") {
          const code = await sock.requestPairingCode(numero);
          console.log("\n🔐 TU CÓDIGO:");
          console.log("👉", code, "\n");
          console.log("Insértalo en WhatsApp Business / Normal / Dual.\n");
        }
      });
    } catch (e) {
      console.log("❌ Error generando código:", e.message);
    }
  }

  // Guardar credenciales
  sock.ev.on("creds.update", saveCreds);

  // Estado de conexión
  sock.ev.on("connection.update", ({ connection }) => {
    if (connection === "open") {
      console.log("✅ Sesión conectada correctamente!");
    }

    if (connection === "close") {
      console.log("❌ Conexión cerrada. Reinicia el bot.");
    }
  });

}

iniciar();