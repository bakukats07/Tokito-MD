module.exports = async function ping(sock, message) {
    return sock.sendMessage(message.key.remoteJid, { text: "🏓 Pong!" });
};