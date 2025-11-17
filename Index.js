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
const settings = require("./settings.js");
const allfake = require("./lib/allfake.js");
const plugins = require("./lib/loader.js");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// ==============================
// Selección de método de login
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
// Preguntar número
// ==============================
async function pedirNumero() {
    return new Promise(resolve => {
        rl.question("\n🔢 Ingresa el número del bot (ej: 573001112233): ", res => {
            resolve(res.trim());
        });
    });
}

// ==============================
// Función principal
// ==============================
async function iniciarBot() {
    const metodo = await menuAutenticacion();
    const numero = await pedirNumero();

    // Crear carpeta de sesión
    const sessionPath = path.join(__dirname, "sessions", numero);
    fs.mkdirSync(sessionPath, { recursive: true });

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
        mobile: metodo === "2", // NECESARIO PARA EL CÓDIGO DE 8 DÍGITOS
        browser: ["Ubuntu", "Chrome", "20.0"],
    });

    // Código de emparejamiento (8 dígitos)
    if (metodo === "2") {
        const code = await sock.requestPairingCode(numero);
        console.log("\n🔐 TU CÓDIGO DE 8 DÍGITOS:");
        console.log("👉", code);
        console.log("\nEscribe ese código en WhatsApp para enlazar tu bot.");
    }

    // Guardar credenciales
    sock.ev.on("creds.update", saveCreds);

    // EVENTO MENSAJE
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

    // EVENTO CONEXIÓN
    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
        if (connection === "open") {
            console.log("\n✅ Bot conectado correctamente.\n");
        }

        if (connection === "close") {
            const reason = new Boom(lastDisconnect?.error).output.statusCode;

            switch (reason) {
                case DisconnectReason.loggedOut:
                    console.log("❌ Sesión cerrada. Eliminando carpeta y reiniciando login.");
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                    iniciarBot();
                    break;

                case DisconnectReason.restartRequired:
                    console.log("♻️ Se requiere reinicio del socket.");
                    iniciarBot();
                    break;

                default:
                    console.log("❌ Conexión perdida. Reconectando...");
                    iniciarBot();
                    break;
            }
        }
    });
}

// Iniciar
iniciarBot();