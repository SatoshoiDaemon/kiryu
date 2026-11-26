const { cancelRequest } = require('../modules/aiGateway');

module.exports = {
  name: 'messageDelete',
  execute(message) {
    if (message?.id) cancelRequest(message.id);
  },
};
