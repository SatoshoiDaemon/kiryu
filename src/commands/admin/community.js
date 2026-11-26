const { commandData, makeCommand } = require('../../modules/adminCommands');

module.exports = { commands: Object.keys(commandData).map(makeCommand) };
