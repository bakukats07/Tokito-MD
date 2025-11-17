const fs = require("fs");
const path = require("path");

function loadPlugins() {
    const plugins = {};
    const folder = path.join(__dirname, "..", "plugins");

    const files = fs.readdirSync(folder);

    for (const file of files) {
        if (!file.endsWith(".js")) continue;
        const name = file.replace(".js", "");
        plugins[name] = require(path.join(folder, file));
    }

    return plugins;
}

module.exports = loadPlugins();