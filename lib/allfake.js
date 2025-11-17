const fs = require("fs");
const path = require("path");
const database = require('../db.json');

module.exports = async function allfake(message, comando, plugins) {
    const chatID = message.key.remoteJid;

    if (!database.chats[chatID]) {
        database.chats[chatID] = { adminMode: false, banned: false };
        fs.writeFileSync(path.join(__dirname, "../db/database.json"), JSON.stringify(database, null, 2));
    }

    const conf = database.chats[chatID];

    if (conf.banned) return;

    const comandosExistentes = Object.keys(plugins);
    const similares = comandosExistentes.filter(c => c.includes(comando));

    let texto = "❌ *Comando no encontrado*";

    if (similares.length) {
        texto += "\n\n¿Quisiste decir?\n";
        similares.forEach(s => texto += `• ${s}\n`);
    }

    await message.reply(texto);
};