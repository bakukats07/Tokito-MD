// ======================================================
//  TOKITO-MD — SISTEMA DE LOGIN ULTRA ESTABLE
//  Compatible: WhatsApp Normal, Business, Dual y Clonado
//  Motor: Baileys + Reintentos + UserAgent Real Android
// ======================================================

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
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

// ======================================================
// ⚙️ USER-AGENTS REALES (rotan si WhatsApp rechaza)
// ======================================================
const userAgents = [
  ["WhatsApp", "Android", "2.24.6"],
  ["WhatsApp", "Android Tablet", "2.24.7"],
  ["WhatsApp", "Android", "13.4.1"], // muy compatible
  ["WhatsApp", "Linux", "2.3000.101"], // anti-baneo
];

// Elegir uno aleatorio cada inicio
const pickUA = () => userAgents[Math.floor(Math.random() * userAgents.length)];

async function iniciar() {
  console.clear();
  console.log(`
=====================================================
 🔐 TOKITO-MD — LOGIN ULTRA ESTABLE
    Pairing Code + QR + Reconexión Inteligente
=====================================================
[1] Escanear Código QR
[2] Código de 8 dígitos (Pairing)
=====================================================
  `);

  const metodo = await ask("Elige 1 o 2: ");
  const numero = (await ask("Número del bot: ")).trim();

  // Crear sesión por número
  const sessionDir = path.join(__dirname, "sessions", numero);
  fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const browser = pickUA(); // seleccionar uno válido para evitar rechazo

  // Si selecciona pairing
  if (metodo === "2" && !state.creds.registered) {
    console.log("\n🔌 Preparando conexión segura...\n");

    let intentos = 0;
    let maxIntentos = 5;

    while (intentos < maxIntentos) {
      intentos++;

      console.log(`🔁 Intento ${intentos}/${maxIntentos}`);

      const sock = makeWASocket({
        version,
        printQRInTerminal: false,
        browser,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys)
        },
        syncFullHistory: false,
        markOnlineOnConnect: false
      });

      await delay(800);

      try {
        const code = await sock.requestPairingCode(numero);

        console.log("\n================================");
        console.log("👉 CÓDIGO DE 8 DÍGITOS:");
        console.log("   " + code);
        console.log("================================\n");
        console.log("✔ Aceptado por WhatsApp NORMAL");
        console.log("✔ Compatible con Business y clonado");
        console.log("✔ No necesita QR\n");

        sock.ev.on("creds.update", saveCreds);
        return;
      } catch (e) {
        console.log("❌ WhatsApp rechazó este intento.");
        console.log("   Razón:", e.message || e);
        console.log("   Cambiando User-Agent y reintentando...\n");

        // cambiar useragent para el siguiente intento
        browser = pickUA();
      }

      await delay(1500);
    }

    console.log("⛔ WhatsApp rechazó todos los intentos.");
    console.log("   Vuelve a intentar en 2–5 minutos.");
    return;
  }

  // ===============================
  // 🔵 MODO QR NORMAL
  // ===============================
  const sock = makeWASocket({
    version,
    printQRInTerminal: metodo === "1",
    browser,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys)
    },
    markOnlineOnConnect: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      console.log("✅ Conectado correctamente!");
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;

      console.log("❌ Conexión cerrada. Code:", code);

      if (code !== 401) {
        console.log("🔄 Reconectando automáticamente...");
        await iniciar();
      } else {
        console.log("⛔ Sesión inválida, borra la carpeta del número.");
      }
    }
  });
}

iniciar();