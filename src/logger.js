const winston = require('winston');
const chalk = require('chalk');

const colors = {
  error: chalk.red,
  warn: chalk.yellow,
  info: chalk.cyan,
  debug: chalk.gray,
};

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      const color = colors[level] || ((value) => value);
      return chalk.gray(timestamp) + ' ' + color(level.toUpperCase()) + ' ' + String(message);
    }),
  ),
  transports: [new winston.transports.Console()],
});

module.exports = logger;
