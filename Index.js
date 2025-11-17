const { Boom } = require("@hapi/boom");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    DisconnectReason
} = require("@whiskeysockets/baileys");

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const allfake = require("./lib/allfake.js");
const plugins = require("./lib/loader.js");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// ==============================
// MENÚ DE AUTENTICACIÓN
// ==============================
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

// ==============================
// PREGUNTAR NÚMERO
// ==============================
async function pedirNumero() {
    return new Promise(resolve => {
        rl.question("\n🔢 Ingresa el número del bot (ej: 573001112233): ", res => {
            resolve(res.trim());
        });
    });
}

// ==============================
// INICIAR BOT
// ==============================
async function iniciarBot() {

    const metodo = await menuAutenticacion();
    const numero = await pedirNumero();

    const sessionPath = path.join(__dirname, "sessions", numero);
    fs.mkdirSync(sessionPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    console.log("\n🔄 Iniciando conexión con Baileys...\n");

    const sock = makeWASocket({
        version,
        browser: ["Chrome (Linux)", "Desktop", "10.0"],
        printQRInTerminal: metodo === "1",
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys),
        }
    });

    // ==============================
    // GENERAR PAIRING CODE SOLO CUANDO ESTÉ LISTO
    // ==============================
    if (metodo === "2") {
        sock.ev.once("connection.update", async ({ connection }) => {
            if (connection === "open") {
                const code = await sock.requestPairingCode(numero);
                console.log("\n🔐 TU CÓDIGO DE 8 DÍGITOS:");
                console.log("👉", code);
                console.log("\nEscribe ese código en WhatsApp para enlazar tu bot.");
            }
        });
    }

    // Guardar credenciales
    sock.ev.on("creds.update", saveCreds);

    // ==============================
    // EVENTO DE MENSAJES
    // ==============================
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const texto = msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            "";

        const from = msg.key.remoteJid;

        console.log(`
==========================
📩 MENSAJE RECIBIDO
🧑 De:      ${from}
💬 Mensaje: ${texto}
==========================
`);

        if (!texto.startsWith(".")) return;

        const comando = texto.slice(1).trim().toLowerCase();

        if (plugins[comando]) {
            plugins[comando](sock, msg);
        } else {
            allfake(sock, msg, comando);
        }
    });

    // ==============================
    // CONTROL DE CONEXIÓN
    // ==============================
    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {

        if (connection === "open") {
            console.log("\n✅ Bot conectado correctamente.\n");
        }

        if (connection === "close") {

            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

            if (shouldReconnect) {
                console.log("⚠️ Conexión perdida. Reconectando...");
                setTimeout(() => iniciarBot(), 2000);
            } else {
                console.log("❌ Sesión cerrada desde el dispositivo.");
                fs.rmSync(sessionPath, { recursive: true, force: true });
                iniciarBot();
            }
        }
    });

}

iniciarBot();