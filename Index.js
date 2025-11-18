import makeWASocket, {
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import qrcode from "qrcode";
import fs from "fs";

console.clear();

// INTERFAZ MENU
console.log("======================================");
console.log("         TOKITO-MD — LOGIN             ");
console.log("     (Safari Android User-Agent)       ");
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

    // AUTH MULTI FILE
    const { state, saveCreds } = await useMultiFileAuthState("./session");

    // WHATSAPP VERSION
    const { version } = await fetchLatestBaileysVersion();

    // SOCKET
    const conn = makeWASocket({
        auth: state,
        printQRInTerminal: false, // IMPORTANTE: NO IMPRIMIR QR
        browser: ["Safari", "Android", "13"],
        version
    });

    // LISTENER DEL QR
    conn.ev.on("connection.update", async (update) => {
        const { qr, connection } = update;

        // SI GENERA QR → GUARDARLO COMO PNG
        if (qr && option === "1") {
            try {
                const qrBuffer = await qrcode.toBuffer(qr, { width: 256 });
                fs.writeFileSync("qr.png", qrBuffer);

                console.log("\n=======================");
                console.log("   📸 QR GENERADO");
                console.log("=======================\n");
                console.log("✔ Se guardó en: qr.png");
                console.log("➡ Ábrelo desde tu galería o archivos para escanearlo.\n");

            } catch (err) {
                console.log("❌ Error al generar la imagen QR:", err);
            }
        }

        // SI PIDE PAIRING CODE (8 DÍGITOS)
        if (connection === "close" && option === "2") {
            console.log("🔢 Esperando el código de vinculación...");
        }

        // CUANDO YA CONECTA
        if (connection === "open") {
            console.log("✔ Conectado correctamente a WhatsApp!");
        }
    });

    conn.ev.on("creds.update", saveCreds);
});