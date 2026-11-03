const fs = require('node:fs');
const path = require('node:path');
const { Collection } = require('discord.js');

function loadCommands(root = path.join(__dirname, '..', 'commands')) {
  const commands = new Collection();
  function visit(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.js')) {
        const command = require(fullPath);
        if (command.data?.name && typeof command.execute === 'function') commands.set(command.data.name, command);
      }
    }
  }
  visit(root);
  return commands;
}

module.exports = { loadCommands };
