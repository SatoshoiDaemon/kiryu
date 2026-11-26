const { commandData, makeCommand } = require('../../modules/communityCommands');

module.exports = { commands: Object.keys(commandData).map(makeCommand) };
