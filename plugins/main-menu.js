module.exports = async function menu(sock, message) {
    return sock.sendMessage(message.key.remoteJid, {
        text:
`📌 *MENÚ DEL BOT*

• .ping
• .status
• .menu

⚙️ Configuración
• .toggleadmin
• .banchat
• .unbanchat`
    });
};