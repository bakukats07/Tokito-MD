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
    console.log("🔌 Preparando conexión...");

    const sock = makeWASocket({
        version,
        browser: ["Chrome (Linux)", "Desktop", "10.0"],
        syncFull: false,
        markOnlineOnConnect: false,
        connectTimeoutMs: 60_000,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys),
        }
    });

    // ==============================
    // GENERAR PAIRING CODE
    // ==============================
    if (metodo === "2") {
        sock.ev.on("connection.update", async ({ connection }) => {
            if (connection === "open") {
                try {
                    const code = await sock.requestPairingCode(numero);
                    console.log("\n🔐 TU CÓDIGO DE 8 DÍGITOS:");
                    console.log("👉", code);
                    console.log("\n◾ Ingresa ese código en WhatsApp para vincular el bot.");
                } catch (err) {
                    console.log("❌ Error generando Pairing Code:", err.message);
                }
            }
        });
    }

    // Guardar credenciales
    sock.ev.on("creds.update", saveCreds);

    // EVENTO MENSAJES
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const texto =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            "";

        if (!texto.startsWith(".")) return;

        const comando = texto.slice(1).trim().toLowerCase();

        if (plugins[comando]) {
            plugins[comando](sock, msg);
        } else {
            allfake(sock, msg, comando);
        }
    });

    // MANEJO DE DESCONEXIÓN
    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
        if (connection === "open") {
            console.log("\n✅ Bot conectado correctamente.\n");
        }

        if (connection === "close") {
            const reason = lastDisconnect?.error?.output?.statusCode;

            if (reason === DisconnectReason.loggedOut) {
                console.log("❌ Sesión cerrada. Eliminando carpeta...");
                fs.rmSync(sessionPath, { recursive: true, force: true });
                iniciarBot();
            } else {
                console.log("⚠️ Reconectando...");
                iniciarBot();
            }
        }
    });
}

iniciarBot();