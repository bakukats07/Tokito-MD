const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const qrcode = require("qrcode");
const fs = require("fs");
const { exec } = require("child_process");

console.clear();

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
        browser: ["Safari", "Android", "13"],
        version,
        printQRInTerminal: false
    });

    let alreadySaved = false; // evita múltiples QR

    conn.ev.on("connection.update", async (update) => {
        let { qr, connection } = update;

        // SOLO modo QR
        if (qr && option === "1" && !alreadySaved) {
            try {
                // Si el QR llega como array → convertir a texto plano
                if (Array.isArray(qr)) {
                    qr = qr.join("");
                }

                const folder = "/sdcard/Pictures/Tokito";
                if (!fs.existsSync(folder)) {
                    fs.mkdirSync(folder, { recursive: true });
                }

                const filePath = `${folder}/qr.png`;

                const img = await qrcode.toBuffer(qr, {
                    width: 320,
                    margin: 1
                });

                fs.writeFileSync(filePath, img);
                alreadySaved = true;

                console.log("\n=======================");
                console.log("        QR LISTO");
                console.log("=======================\n");
                console.log("✔ Guardado en:");
                console.log(filePath);
                console.log("📱 Abriendo imagen…\n");

                exec(`termux-open '${filePath}'`);

            } catch (err) {
                console.log("❌ Error al generar QR:", err);
            }
        }

        if (connection === "open") {
            console.log("✔ Conectado a WhatsApp!");
        }

        if (option === "2" && connection === "connecting") {
            console.log("🔢 Esperando el código de 8 dígitos…");
        }
    });

    conn.ev.on("creds.update", saveCreds);
});