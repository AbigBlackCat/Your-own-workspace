import { chmodSync, writeFileSync } from 'node:fs';

const outputPath = process.argv[2];
if (!outputPath) throw new Error('Usage: curl .../api/state | node scripts/capture-api-state.mjs <output.json>');
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const response = JSON.parse(Buffer.concat(chunks).toString('utf8'));
if (!response?.data || response?.error) throw new Error(response?.error?.message ?? 'API state response is invalid');
writeFileSync(outputPath, `${JSON.stringify(response.data)}\n`, { mode: 0o600 });
chmodSync(outputPath, 0o600);
const counts = Object.fromEntries(Object.entries(response.data).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.length]));
process.stdout.write(`${JSON.stringify({ bytes: Buffer.byteLength(JSON.stringify(response.data)), counts })}\n`);
