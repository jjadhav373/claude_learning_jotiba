import pg from 'pg';
import { env } from '../config/env.js';

/** Anything that can run a query: the pool or a client inside a transaction. */
export interface Queryable {
  query<R = any>(text: string, values?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }>;
}

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  // every connection works inside the cover_check schema
  options: '-c search_path=cover_check,public',
});

/** Run `fn` in one transaction; commits on success, rolls back on any throw. */
export async function withTransaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client as unknown as Queryable);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
