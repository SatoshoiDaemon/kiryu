function parseOptions(input) {
  if (typeof input !== 'string') return [];
  return input.split(',').map((option) => option.trim()).filter(Boolean);
}

function chooseOption(input, random = Math.random) {
  const options = Array.isArray(input) ? input.map((option) => String(option).trim()).filter(Boolean) : parseOptions(input);
  if (options.length < 2) throw new RangeError('Informe pelo menos duas opções separadas por vírgula.');
  const index = Math.min(options.length - 1, Math.floor(random() * options.length));
  return { choice: options[index], options };
}

module.exports = { parseOptions, chooseOption };
