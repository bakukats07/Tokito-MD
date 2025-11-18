const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const qrcode = require("qrcode");
const fs = require("fs");
const { exec } = require("child_process");

console.clear();

// ================= MENU =================
console.log("======================================");
console.log("         TOKITO-MD — LOGIN            ");
console.log("     (Safari Android User-Agent)      ");
console.log("======================================");
console.log("[1] Escanear Código QR");
console.log("[2] Código de 8 dígitos (Pairing)");
console.log("======================================");
process.stdout.write("Opción: ");

// =========================================
//             OPCIÓN USUARIO
// =========================================
process.stdin.once("data", async (data) => {
    const option = data.toString().trim();

    if (!["1", "2"].includes(option)) {
        console.log("❌ Opción inválida.");
        process.exit();
    }

    // AUTH
    const { state, saveCreds } = await useMultiFileAuthState("./session");

    // VERSION WHATSAPP
    const { version } = await fetchLatestBaileysVersion();

    const conn = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ["Safari", "Android", "13"],
        version
    });

    let qrGuardado = false;  // ← evita repetición del QR

    conn.ev.on("connection.update", async (update) => {
        const { qr, connection } = update;

        // ================= QR MODE =================
        if (qr && option === "1" && !qrGuardado) {
            qrGuardado = true;

            try {
                // Ruta compatible 100% con galería
                const folder = "/sdcard/Pictures/Tokito-QR";
                const QR_PATH = `${folder}/qr.png`;

                if (!fs.existsSync(folder)) {
                    fs.mkdirSync(folder, { recursive: true });
                }

                const img = await qrcode.toBuffer(qr, { width: 600 });
                fs.writeFileSync(QR_PATH, img);

                // Forzar que Android actualice la galería
                exec(`am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file://${QR_PATH}`);

                console.log("\n=======================");
                console.log("        QR LISTO");
                console.log("=======================\n");
                console.log("✔ Guardado en:", QR_PATH);
                console.log("📱 Ya debería aparecer en tu galería.\n");

            } catch (err) {
                console.log("❌ Error al crear el QR:", err);
            }
        }

        // =============== PAIRING MODE =================
        if (connection === "connecting" && option === "2") {
            console.log("🔢 Esperando el código de 8 dígitos...");
        }

        // ================= OPEN =================
        if (connection === "open") {
            console.log("✔ Conectado a WhatsApp!");
        }
    });

    conn.ev.on("creds.update", saveCreds);
});