/**
 * One-off — prints per-master keyword counts. Run via `npx tsx scripts/count-taxonomy.ts`.
 */
import { aiMappings } from '../src/services/aiCategoryMap';

const counts: Record<string, number> = {};
for (const v of Object.values(aiMappings)) {
  counts[v] = (counts[v] ?? 0) + 1;
}
console.log('Total unique keywords:', Object.keys(aiMappings).length);
console.log('Per-master:');
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(15)} ${v}`);
}
