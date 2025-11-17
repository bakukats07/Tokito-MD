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

// Plugins
const allfake = require("./lib/allfake.js");
const plugins = require("./lib/loader.js");

// Control de mensajes (ANTI-BAN)
const MENSAJES_MAX_POR_MINUTO = 15; 
let mensajesEnMinuto = 0;
setInterval(() => mensajesEnMinuto = 0, 60 * 1000);

// CLI
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function preguntar(texto) {
    return new Promise(res => rl.question(texto, ans => res(ans.trim())));
}

// ==========================================================
//  MENÚ DE AUTENTICACIÓN
// ==========================================================
async function menuAutenticacion() {
    console.clear();
    console.log(`
=====================================================
 🔐 SISTEMA UNIVERSAL DE CONEXIÓN – TOKITO-MD BOT 
 Compatible con:
 ✔ WhatsApp normal
 ✔ WhatsApp Business
 ✔ WhatsApp Dual / Clonado (Samsung/Xiaomi)
 ✔ WhatsApp Business Dual
=====================================================

Elige tu método de conexión:

[1] Escanear Código QR  
[2] Código de 8 dígitos (Pairing Code)

=====================================================
`);
    return await preguntar("Escribe 1 o 2: ");
}

// ==========================================================
//  PROCESO PRINCIPAL
// ==========================================================
async function iniciarBot() {

    const metodo = await menuAutenticacion();
    const numero = await preguntar("\n🔢 Ingresa el número del bot (Ej: 573001112233): ");

    const sessionPath = path.join(__dirname, "sessions", numero);
    fs.mkdirSync(sessionPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    console.log("\n🔌 Preparando conexión segura...\n");

    // Config UNIVERSAL + COMPATIBLE CON BUSINESS/DUAL
    const sock = makeWASocket({
        version,
        printQRInTerminal: metodo === "1",
        browser: ["Tokito-MD", "Universal-Dual", "1.0"],
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys)
        },
        syncFullHistory: false,        // ANTI-BAN
        markOnlineOnConnect: false,    // ANTI-BAN
        generateHighQualityLinkPreview: false  // ANTI-BAN
    });

    // Pairing Code (seguro)
    if (metodo === "2") {
        sock.ev.on("connection.update", async ({ connection }) => {
            if (connection === "open") {
                try {
                    const code = await sock.requestPairingCode(numero);
                    console.log("\n🔐 TU CÓDIGO DE 8 DÍGITOS:");
                    console.log("👉", code);
                    console.log("\nIngresa este código en WhatsApp (normal, business o dual).\n");
                } catch (e) {
                    console.log("❌ Error generando código:", e.message);
                }
            }
        });
    }

    sock.ev.on("creds.update", saveCreds);

    // ==========================================================
    //  LECTOR DE MENSAJES (CON ANTI-BAN)
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
            console.log("🟢 Compatible con cualquier tipo de WhatsApp.\n");
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