const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const qrcode = require("qrcode");
const fs = require("fs");
const path = require("path");

console.clear();

// Carpeta donde se guardará el QR:
const QR_FOLDER = "/sdcard/Tokito-QR";
const QR_PATH = path.join(QR_FOLDER, "qr.png");

// Crear carpeta si no existe
if (!fs.existsSync(QR_FOLDER)) {
    fs.mkdirSync(QR_FOLDER, { recursive: true });
}

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

    const { state, saveCreds } = await useMultiFileAuthState("./session");
    const { version } = await fetchLatestBaileysVersion();

    const conn = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ["Safari", "Android", "13"],
        version
    });

    conn.ev.on("connection.update", async (update) => {
        const { qr, connection } = update;

        // === MODO QR ===
        if (qr && option === "1") {
            try {
                const img = await qrcode.toBuffer(qr, {
                    type: "png",
                    width: 512,    // tamaño óptimo
                    margin: 2      // evita que se corte
                });

                fs.writeFileSync(QR_PATH, img);

                console.log("\n=======================");
                console.log("        QR LISTO");
                console.log("=======================\n");
                console.log("✔ Guardado en:", QR_PATH);
                console.log("📱 Se verá en tu galería como 'qr.png'.\n");

            } catch (err) {
                console.log("❌ Error al crear qr.png:", err);
            }
        }

        // === MODO PAIRING ===
        if (connection === "connecting" && option === "2") {
            console.log("🔢 Esperando el código de 8 dígitos...");
        }

        if (connection === "open") {
            console.log("✔ Conectado a WhatsApp!");
        }
    });

    conn.ev.on("creds.update", saveCreds);
});