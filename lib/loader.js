const fs = require('fs');
const path = require('path');

const pluginsPath = path.join(__dirname, '../plugins');
const plugins = {};

fs.readdirSync(pluginsPath).forEach(file => {
  if (file.endsWith('.js')) {
    const pluginName = path.basename(file, '.js');
    plugins[pluginName] = require(path.join(pluginsPath, file));
  }
});

module.exports = plugins;