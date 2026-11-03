function normalizeTriggerText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

function findTrigger(triggers, message) {
  const normalized = normalizeTriggerText(message);
  if (!normalized) return null;
  return triggers.find((trigger) => trigger.enabled !== false
    && normalizeTriggerText(trigger.text) === normalized
    && Array.isArray(trigger.responses)
    && trigger.responses.length > 0) || null;
}

function chooseResponse(trigger, random = Math.random) {
  if (!trigger || !Array.isArray(trigger.responses) || trigger.responses.length === 0) return null;
  const index = Math.min(trigger.responses.length - 1, Math.floor(random() * trigger.responses.length));
  return trigger.responses[index];
}

module.exports = { normalizeTriggerText, findTrigger, chooseResponse };
