/** Test wiring: real Postgres (TEST_DATABASE_URL), in-memory integrations, controllable clock. */
import pg from 'pg';
import { createRepos } from '../src/repositories/index.js';
import { linkTokenService } from '../src/services/linkTokenService.js';
import { demoExtractor } from '../src/integrations/extractor.js';
import type { ObjectStore } from '../src/integrations/storage.js';
import type { Deps } from '../src/services/deps.js';
import type { Queryable } from '../src/db/pool.js';

export function testDeps(now: () => Date) {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5432/cover_check_test',
    options: '-c search_path=cover_check,public' });
  const files = new Map<string, Buffer>();
  const store: ObjectStore = {
    put: async (k, b) => { files.set(k, b); return k; },
    get: async (k) => files.get(k)!,
    remove: async (k) => { files.delete(k); },
  };
  // Unique per run, so message ids never collide with rows a previous run left in the test database.
  const runId = Date.now().toString(36);
  const sent: { to: string; templateId: string; params: string[] }[] = [];
  const otps: string[] = [];
  const deps: Deps = {
    repos: createRepos(pool as unknown as Queryable),
    tx: async (fn) => {
      const c = await pool.connect();
      try { await c.query('BEGIN'); const out = await fn(createRepos(c as unknown as Queryable)); await c.query('COMMIT'); return out; }
      catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    },
    tokens: linkTokenService('test-secret-test-secret-test-secret-1234', 14),
    whatsapp: { sendTemplate: async (to, templateId, params) => { sent.push({ to, templateId, params }); return { messageId: `wamid.${runId}.${sent.length}` }; } },
    store,
    extractor: demoExtractor(),
    sendOtpSms: async (_m, code) => { otps.push(code); },
    now,
    config: { noticeVersion: 'v1', docRetentionDays: 90, maxFiles: 3, maxFileMb: 15, waSummaryTemplateId: 'cover_check_summary_v1' },
  };
  return { deps, pool, sent, otps };
}

export const waitFor = async (fn: () => Promise<boolean>, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return; await new Promise((r) => setTimeout(r, 25)); }
  throw new Error('timeout');
};
