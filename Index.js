const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const fs = require("fs");
const path = require("path");
const qrcode = require("qrcode-terminal");

const settings = require("./settings.js");
const db = require("./db.json");
const allfake = require("./lib/allfake.js");
const plugins = require("./lib/loader.js");

const database = require("./db/database.json");

// LIMPIEZA /tmp
setInterval(() => {
    const tmp = path.join(__dirname, "tmp");
    if (!fs.existsSync(tmp)) return;
    fs.readdirSync(tmp).forEach(f => fs.unlinkSync(path.join(tmp, f)));
}, 15000);

// MENÚ
console.clear();
console.log(`
===============================
   BAILEYS BOT — INICIO
===============================

1) Conexión con Código QR
2) Conexión con Código de 8 Dígitos

Escribe 1 o 2:
`);

process.stdin.once("data", async data => {
    const opcion = data.toString().trim();

    console.clear();

    if (opcion !== "1" && opcion !== "2") {
        console.log("❌ Opción inválida.");
        process.exit();
    }

    console.log("Escribe el número del bot (Ej: 573001234567)");
    process.stdin.once("data", async num => {

        const numero = num.toString().trim();
        const sessionDir = path.join(__dirname, "sessions", numero);

        fs.mkdirSync(sessionDir, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: opcion === "1"
        });

        // Código 8 dígitos
        if (opcion === "2") {
            sock.on("connection.update", ({ qr }) => {
                if (qr) {
                    console.log("🔢 CÓDIGO 8 DÍGITOS:");
                    qrcode.generate(qr, { small: true });
                }
            });
        }

        // Mensajes
        sock.ev.on("messages.upsert", async m => {
            const msg = m.messages[0];
            if (!msg.message) return;

            const jid = msg.key.remoteJid;
            const text = msg.message.conversation || "";

            if (settings.logs) {
                console.log("\n📩 NUEVO MENSAJE");
                console.log("Tipo:", jid.includes("@g") ? "Grupo" : "Privado");
                console.log("Chat:", jid);
                console.log("Mensaje:", text);
            }

            const prefix = settings.prefix.find(p => text.startsWith(p));
            if (!prefix) return;

            const comando = text.slice(prefix.length).trim().toLowerCase();

            if (plugins[comando]) {
                return plugins[comando](sock, msg);
            }

            return allfake(msg, comando, plugins);
        });

        sock.ev.on("creds.update", saveCreds);
    });
});