const { performance } = require('node:perf_hooks');
const logger = require('../logger');

const observations = new Map();
const slowThresholdMs = Number(process.env.KIRYU_SLOW_OPERATION_MS) || 750;
const boundaries = [50, 100, 250, 500, 1000, 2000];

function record(kind, name, durationMs) {
  const key = kind + ':' + String(name || 'unknown').slice(0, 80);
  const current = observations.get(key) || { count: 0, total: 0, max: 0, buckets: Array(boundaries.length + 1).fill(0) };
  current.count += 1;
  current.total += durationMs;
  current.max = Math.max(current.max, durationMs);
  const bucket = boundaries.findIndex((boundary) => durationMs <= boundary);
  current.buckets[bucket < 0 ? boundaries.length : bucket] += 1;
  observations.set(key, current);
  if (durationMs >= slowThresholdMs) logger.warn('Kiryu lenta · ' + key + ' · ' + durationMs.toFixed(0) + ' ms.');
}

function snapshot({ reset = false } = {}) {
  const result = Object.fromEntries([...observations.entries()].map(([key, value]) => [key, {
    ...value,
    averageMs: Number((value.total / Math.max(1, value.count)).toFixed(1)),
    bucketsMs: Object.fromEntries(boundaries.map((boundary, index) => ['≤' + boundary, value.buckets[index]]).concat([['>' + boundaries.at(-1), value.buckets.at(-1)]])),
  }]));
  if (reset) observations.clear();
  return result;
}

function flush() {
  const values = snapshot({ reset: true });
  for (const [key, value] of Object.entries(values)) {
    logger.info('Kiryu métrica · ' + key + ' · n=' + value.count + ' · média=' + value.averageMs + ' ms · pico=' + value.max.toFixed(0) + ' ms · buckets=' + JSON.stringify(value.bucketsMs));
  }
}

const timer = setInterval(flush, 60_000);
timer.unref?.();

module.exports = { record, snapshot, flush, boundaries, slowThresholdMs, performance };
