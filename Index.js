const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const qrcode = require("qrcode");
const fs = require("fs");

console.clear();

// MENU
console.log("======================================");
console.log("         TOKITO-MD — LOGIN            ");
console.log("     (Safari Android User-Agent)      ");
console.log("======================================");
console.log("[1] Escanear Código QR");
console.log("[2] Código de 8 dígitos (Pairing)");
console.log("======================================");

process.stdout.write("Opción: ");

process.stdin.once("data", async (data) => {
    const option = data.toString().trim();

    if (option !== "1" && option !== "2") {
        console.log("❌ Opción inválida.");
        process.exit();
    }

    // AUTH
    const { state, saveCreds } = await useMultiFileAuthState("./session");

    // VERSION WHATSAPP
    const { version } = await fetchLatestBaileysVersion();

    // SOCKET
    const conn = makeWASocket({
        auth: state,
        printQRInTerminal: false, // NO imprimir en consola
        browser: ["Safari", "Android", "13"],
        version
    });

    // EVENTOS
    conn.ev.on("connection.update", async (update) => {
        const { qr, connection } = update;

        // === MODO QR ===
        if (qr && option === "1") {
            try {
                const img = await qrcode.toBuffer(qr, { width: 256 });

                fs.writeFileSync("qr.png", img);

                console.log("\n=======================");
                console.log("        QR LISTO");
                console.log("=======================\n");
                console.log("✔ Guardado en: qr.png");
                console.log("📱 Ábrelo desde tu galería y escanéalo.");
            } catch (err) {
                console.log("❌ Error al crear qr.png:", err);
            }
        }

        // === MODO PAIRING ===
        if (connection === "connecting" && option === "2") {
            console.log("🔢 Esperando el código de 8 dígitos...");
        }

        // YA CONECTADO
        if (connection === "open") {
            console.log("✔ Conectado a WhatsApp!");
        }
    });

    conn.ev.on("creds.update", saveCreds);
});