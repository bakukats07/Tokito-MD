const fs = require("fs");
const path = require("path");

const plugins = {};
const dir = path.join(__dirname, "..", "plugins");

const files = fs.readdirSync(dir).filter(f => f.endsWith(".js"));

for (const archivo of files) {
    const nombre = archivo.replace(".js", "").replace("main-", "");
    plugins[nombre] = require(path.join(dir, archivo));
}

module.exports = plugins;