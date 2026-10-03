/** Applies data/migrations/*.sql then data/seeds/*.sql in order, once each. */
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { env } from '../config/env.js';

const root = resolve(import.meta.dirname, '../../../data');

async function main() {
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  await client.query('CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY, applied_ts timestamptz DEFAULT now())');
  for (const dir of ['migrations', 'seeds']) {
    for (const f of (await readdir(join(root, dir))).filter((x) => x.endsWith('.sql')).sort()) {
      const name = `${dir}/${f}`;
      const done = await client.query('SELECT 1 FROM public.schema_migrations WHERE name = $1', [name]);
      if (done.rowCount) continue;
      console.info('applying', name);
      await client.query(await readFile(join(root, dir, f), 'utf8'));
      await client.query('INSERT INTO public.schema_migrations (name) VALUES ($1)', [name]);
    }
  }
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
