const { Boom } = require("@hapi/boom");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const settings = require("./settings.js");
const allfake = require("./lib/allfake.js");
const plugins = require("./lib/loader.js");

// ==========================
// CONSOLA interactiva
// ==========================
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// ==========================
// PREGUNTAR AUTENTICACIÓN
// ==========================
async function menuAutenticacion() {
    return new Promise(resolve => {
        console.log(`
=====================================================
        SISTEMA DE AUTENTICACIÓN – BAILEYS BOT       
=====================================================

Elige un método de inicio:

[1] Código QR  
[2] Código de 8 dígitos (Pairing Code)

=====================================================
        `);
        rl.question("Escribe 1 o 2: ", res => resolve(res.trim()));
    });
}

// ==========================
// PREGUNTAR NÚMERO para sesión
// ==========================
async function pedirNumero() {
    return new Promise(resolve => {
        rl.question("\n🔢 Ingresa el número del bot (ej: 573001112233): ", res => {
            resolve(res.trim());
        });
    });
}

// ==========================
// INICIO PRINCIPAL
// ==========================
async function iniciar() {
    const metodo = await menuAutenticacion();
    const numero = await pedirNumero();

    const sessionPath = path.join(__dirname, "sessions", numero);

    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    console.log("\n🔄 Iniciando conexión con Baileys...\n");

    const sock = makeWASocket({
        version,
        printQRInTerminal: metodo === "1",
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys),
        },
        mobile: false
    });

    // ==========================
    // PAIRING CODE (8 dígitos)
    // ==========================
    if (metodo === "2") {
        const code = await sock.requestPairingCode(numero);
        console.log("\n🔐 TU CÓDIGO DE 8 DÍGITOS:");
        console.log("👉", code);
        console.log("\nEscribe ese código en WhatsApp para enlazar tu bot.");
    }

    // ==========================
    // EVENTO: CREDENCIALES
    // ==========================
    sock.ev.on("creds.update", saveCreds);

    // ==========================
    // EVENTO: RECIBIR MENSAJE
    // ==========================
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const texto = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const from = msg.key.remoteJid;

        console.log(`
==========================
📩 MENSAJE RECIBIDO
🧑 De:      ${from}
💬 Mensaje: ${texto}
==========================
        `);

        if (!texto.startsWith(".")) {
            return;
        }

        const comando = texto.slice(1).trim().toLowerCase();
        const encontrado = plugins[comando];

        if (encontrado) {
            return encontrado(sock, msg);
        } else {
            return allfake(sock, msg, comando);
        }
    });

    sock.ev.on("connection.update", ({ connection }) => {
        if (connection === "open") {
            console.log("\n✅ Bot conectado correctamente.");
        }
        if (connection === "close") {
            console.log("\n❌ Conexión cerrada. Intentando reconectar...");
            iniciar();
        }
    });

}

iniciar();