// Keep database diagnostics in server logs without exposing connection credentials.
function errorDetails(error) {
  let details = [error?.name, error?.code, error?.codeName, error?.message,
    error?.cause?.message].filter((value) => value !== undefined && value !== null).join(' | ');
  for (const [key, value] of Object.entries(process.env)) {
    if (/TOKEN|PASSWORD|SECRET|URI|PRIVATE_KEY/i.test(key) && value) {
      details = details.split(value).join('[redacted]');
    }
  }
  return details.replace(/mongodb(?:\+srv)?:\/\/[^\s"']+/gi, '[MongoDB URI redacted]')
    .replace(/[\r\n]+/g, ' ').slice(0, 2000) || 'erro desconhecido';
}

module.exports = { errorDetails };
