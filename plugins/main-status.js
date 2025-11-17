const settings = require("../settings.js");

module.exports = async function status(sock, message) {
    return sock.sendMessage(message.key.remoteJid, {
        text: `🤖 *Estado del bot*\nNombre: ${settings.name}\nVersión: ${settings.version}`
    });
};