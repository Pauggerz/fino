// One-off: apply supabase/add_debt_direction.sql to the Supabase Postgres DB
// and reload the PostgREST schema cache (fixes PGRST204 "Could not find the
// 'direction' column" sync errors). Idempotent — safe to re-run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env.local parser (avoids adding a dotenv dep).
const env = {};
for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}

const conn = env.SUPABASE_DB_URL;
if (!conn) {
  console.error('SUPABASE_DB_URL not found in .env.local');
  process.exit(1);
}

const sql = fs.readFileSync(path.join(root, 'supabase', 'add_debt_direction.sql'), 'utf8');

const masked = conn.replace(/\/\/[^@]*@/, '//****:****@');
console.log('Connecting to:', masked);

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(sql);
  // PGRST204 is a stale PostgREST schema cache — force a reload.
  await client.query("NOTIFY pgrst, 'reload schema';");

  const { rows } = await client.query(
    `select column_name, data_type, column_default
       from information_schema.columns
      where table_name = 'debts' and column_name = 'direction';`,
  );
  if (rows.length) {
    console.log('OK — debts.direction:', JSON.stringify(rows[0]));
  } else {
    console.error('FAILED — direction column still not present');
    process.exit(2);
  }
} catch (e) {
  console.error('ERROR:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
