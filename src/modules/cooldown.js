function createCooldownTracker() {
  const lastAwardByUser = new Map();

  return {
    canAward(userId, cooldownMs, now = Date.now()) {
      const previous = lastAwardByUser.get(userId);
      if (previous != null && now - previous < cooldownMs) return false;
      lastAwardByUser.set(userId, now);
      return true;
    },
    clear(userId) {
      lastAwardByUser.delete(userId);
    },
    clearAll() {
      lastAwardByUser.clear();
    },
  };
}

module.exports = { createCooldownTracker };
