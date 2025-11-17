const { Client, LocalAuth } = require('whatsapp-web.js');
const client = new Client({
    authStrategy: new LocalAuth()
});
const prefijos = ['.', '/', '^', '#'];
client.on('ready', () => {
    console.log('El bot está listo y conectado');
});
client.on('message', async (message) => {
    const prefijoUsado = prefijos.find(p => message.body.startsWith(p));
    
    if (prefijoUsado) {
        const comando = message.body.slice(prefijoUsado.length).trim().toLowerCase();
        if (comando === 'menú') {
            message.reply('¡Este es el menú del bot! Aquí van los comandos disponibles...');
        }
    }
});
client.initialize();
