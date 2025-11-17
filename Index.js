const { Client, LocalAuth } = require('whatsapp-web.js');
const client = new Client({
    authStrategy: new LocalAuth()
});

const path = require('path');
const fs = require('fs');

const plugins = require(path.join(__dirname, 'lib', 'loader.js'));
const db = require('./lib/db.json');

const prefijos = ['.', '/', '^', '#'];

client.on('ready', () => {
    console.log('El bot está listo y conectado');
});

client.on('message', async (message) => {
    const prefijoUsado = prefijos.find(p => message.body.startsWith(p));

    if (prefijoUsado) {
        const comando = message.body.slice(prefijoUsado.length).trim().toLowerCase();

        // Verificar si el comando existe en la base de datos
        for (let categoria in db) {
            if (db[categoria].includes(comando)) {
                const plugin = plugins[comando];
                if (plugin) {
                    await plugin(client, message);
                } else {
                    message.reply('Comando no implementado aún.');
                }
                return;
            }
        }

        message.reply('Comando desconocido.');
    }
});

client.initialize();