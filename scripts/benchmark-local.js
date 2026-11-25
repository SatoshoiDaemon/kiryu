const fs = require('node:fs/promises');
const path = require('node:path');
const { createCanvas } = require('@napi-rs/canvas');
const { performance } = require('node:perf_hooks');
const { renderMemberCard, renderedCards } = require('../src/modules/memberProfiles');
const { loadCommands } = require('../src/handlers/loadCommands');

function percentile(values, fraction) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)];
}

async function timeMany(count, callback) {
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    const started = performance.now();
    await callback(index);
    samples.push(performance.now() - started);
  }
  return {
    count,
    averageMs: Number((samples.reduce((total, value) => total + value, 0) / count).toFixed(3)),
    p50Ms: Number(percentile(samples, 0.5).toFixed(3)),
    p95Ms: Number(percentile(samples, 0.95).toFixed(3)),
    maxMs: Number(Math.max(...samples).toFixed(3)),
  };
}

async function main() {
  const canvas = createCanvas(256, 256);
  const context = canvas.getContext('2d');
  context.fillStyle = '#7c3aed';
  context.fillRect(0, 0, 256, 256);
  const avatarUrl = 'data:image/png;base64,' + canvas.toBuffer('image/png').toString('base64');
  const baseUser = { username: 'Benchmark', globalName: 'Kiryu Benchmark', displayAvatarURL: () => avatarUrl };
  const customization = { accent: 'rose', background: 'dusk', frame: 'classic', badges: ['star'], title: 'Benchmark', bio: 'Local render fixture' };
  const xp = { level: 42, xp: 734 };

  renderedCards.clear();
  const coldRender = await timeMany(20, (index) => renderMemberCard({ ...baseUser, id: 'cold-' + index }, xp, customization, 7));
  const warmUser = { ...baseUser, id: 'warm-cache' };
  await renderMemberCard(warmUser, xp, customization, 7);
  const warmCache = await timeMany(100, () => renderMemberCard(warmUser, xp, customization, 7));
  const commands = [...loadCommands().values()];
  const serialization = await timeMany(100, () => commands.forEach((command) => command.data.toJSON()));

  const report = {
    measuredAt: new Date().toISOString(),
    node: process.version,
    scope: 'Local CPU-only microbenchmark. No Discord gateway, network avatar, or MongoDB calls.',
    profilePngColdRender: coldRender,
    profilePngWarmCache: warmCache,
    slashSerialization: { commandsPerIteration: commands.length, ...serialization },
  };
  const outputPath = path.join(__dirname, '..', 'artifacts', 'visual-previews', 'performance-local.json');
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
