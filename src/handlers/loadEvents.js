const fs = require('node:fs');
const path = require('node:path');

function loadEvents(client, root = path.join(__dirname, '..', 'events')) {
  if (!fs.existsSync(root)) return;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const event = require(path.join(root, entry.name));
    const listener = (...args) => event.execute(...args, client);
    if (event.once) client.once(event.name, listener);
    else client.on(event.name, listener);
  }
}

module.exports = { loadEvents };
