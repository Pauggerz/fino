/**
 * Drift guard for the two notification-copy modules:
 *   • src/services/notificationCopy.ts          (client / React Native)
 *   • supabase/functions/_shared/copy.ts        (Deno / Edge Functions)
 *
 * Every user-facing notification string is duplicated across these files so the
 * local-schedule rail and the server-push rail phrase things identically. The
 * files legitimately differ in their header comment and a few `export` keywords,
 * so this compares the *meaningful* bodies — the `fmtPeso`, `amountSuffix`, and
 * `copy` definitions — after stripping comments and normalising whitespace.
 *
 * Run from the repo root:
 *   npx tsx scripts/check-copy-sync.ts      (or: npm run check:copy-sync)
 *
 * No Jest, no runtime imports — reads the two files as text. Exit code 1 on
 * drift so it can gate the Husky pre-commit.
 */

/* eslint-disable no-console */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const CLIENT = join(ROOT, 'src/services/notificationCopy.ts');
const SERVER = join(ROOT, 'supabase/functions/_shared/copy.ts');

/**
 * Strip comments, the `export ` keyword (client exports, server doesn't), and
 * the type-only `interface … {}` blocks (erased at runtime — they carry no
 * user-facing string and the two files order them differently). Then collapse
 * whitespace. What remains is the runtime substance: `fmtPeso`, `amountSuffix`,
 * and the `copy` object — i.e. every notification string. To stay robust to
 * harmless top-level reordering, the result is split on `;`/`}` boundaries into
 * a sorted set of statements and compared order-independently.
 */
function statements(src: string): string[] {
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/\/\/[^\n]*/g, '') // line comments
    .replace(/\bexport\s+/g, '') // export keyword
    .replace(/interface\s+\w+\s*\{[^}]*\}/g, '') // type-only blocks
    .replace(/\s+/g, ' ')
    .trim();
  // The `copy` object spans nested braces, so don't naively split on every `}`.
  // Pull the whole `const copy = { … };` out as one unit, then split the rest.
  const copyMatch = stripped.match(/const copy = \{[\s\S]*\};?/);
  const copyUnit = copyMatch ? copyMatch[0].replace(/;$/, '') : '';
  const rest = copyMatch ? stripped.replace(copyMatch[0], '') : stripped;
  const units = rest
    .split(/(?<=\})|;/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (copyUnit) units.push(copyUnit.trim());
  return units.sort();
}

const client = statements(readFileSync(CLIENT, 'utf8'));
const server = statements(readFileSync(SERVER, 'utf8'));

const clientKey = client.join('\n');
const serverKey = server.join('\n');

if (clientKey === serverKey) {
  console.log('✓ notification copy is in sync (client === server)');
  process.exit(0);
}

const onlyClient = client.filter((s) => !server.includes(s));
const onlyServer = server.filter((s) => !client.includes(s));

console.error('✗ notification copy DRIFT detected.');
console.error('  client: src/services/notificationCopy.ts');
console.error('  server: supabase/functions/_shared/copy.ts');
if (onlyClient.length) {
  console.error('\n  Only in client:');
  for (const s of onlyClient) console.error(`    ${s}`);
}
if (onlyServer.length) {
  console.error('\n  Only in server:');
  for (const s of onlyServer) console.error(`    ${s}`);
}
console.error(
  '\n  Update BOTH files so their fmtPeso/amountSuffix/copy bodies match.'
);
process.exit(1);
