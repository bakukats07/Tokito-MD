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

const MENSAJES_MAX_POR_MINUTO = 15; 
let mensajesEnMinuto = 0;
setInterval(() => mensajesEnMinuto = 0, 60 * 1000);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function preguntar(texto) {
    return new Promise(res => rl.question(texto, ans => res(ans.trim())));
}

async function menuAutenticacion() {
    console.clear();
    console.log(`
=====================================================
 🔐 SISTEMA UNIVERSAL DE CONEXIÓN – TOKITO-MD BOT 
 Compatible con:
 ✔ WhatsApp normal
 ✔ WhatsApp Business
 ✔ WhatsApp Dual / Clonado
 ✔ WhatsApp Business Dual
=====================================================

Elige tu método de conexión:

[1] Escanear Código QR  
[2] Código de 8 dígitos (Pairing Code)

=====================================================
`);
    return await preguntar("Escribe 1 o 2: ");
}

async function iniciarBot() {

    const metodo = await menuAutenticacion();
    const numero = await preguntar("\n🔢 Ingresa el número del bot (Ej: 573001112233): ");

    const sessionPath = path.join(__dirname, "sessions", numero);
    fs.mkdirSync(sessionPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    console.log("\n🔌 Preparando conexión segura...\n");

    // CONFIG COMPATIBLE CON WHATSAPP BUSINESS / DUAL
    const sock = makeWASocket({
        version,
        printQRInTerminal: metodo === "1",
        // UserAgent oficial y permitido POR WhatsApp Business
        browser: ["Chrome", "Windows", "10.0"],
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys)
        },
        syncFullHistory: false,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false
    });

    // ==========================================================
    //   PAIRING CODE — ARREGLADO Y FUNCIONAL
    // ==========================================================
    if (metodo === "2" && !state.creds.registered) {
        try {
            const code = await sock.requestPairingCode(numero.replace(/\D/g, ""));
            console.log("\n🔐 TU CÓDIGO DE 8 DÍGITOS:");
            console.log("👉", code, "\n");
            console.log("Ingresa este código en WhatsApp (normal, Business o Dual).\n");
        } catch (e) {
            console.log("❌ Error generando código:", e.message);
        }
    }

    sock.ev.on("creds.update", saveCreds);

    // ==========================================================
    //  LECTOR DE MENSAJES
    // ==========================================================
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        if (mensajesEnMinuto >= MENSAJES_MAX_POR_MINUTO) {
            console.log("⚠️ Anti-ban: límite de mensajes alcanzado.");
            return;
        }
        mensajesEnMinuto++;

        const texto =
            msg.message.conversation ||
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

    // ==========================================================
    //  CONTROL DE CONEXIÓN
    // ==========================================================
    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {

        if (connection === "open") {
            console.log("\n✅ Bot conectado correctamente.");
            console.log("🟢 Compatible con todo tipo de WhatsApp.\n");
        }

        if (connection === "close") {
            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

            if (shouldReconnect) {
                console.log("⚠️ Conexión perdida. Reconectando...");
                setTimeout(() => iniciarBot(), 2500);
            } else {
                console.log("❌ Sesión cerrada desde el dispositivo.");
                fs.rmSync(sessionPath, { recursive: true, force: true });
                iniciarBot();
            }
        }
    });

}

iniciarBot();