import { createHash } from 'node:crypto';
import type { Finding } from '@cover-check/shared';
import type { Queryable } from '../db/pool.js';

const textVersion = (t: string) => createHash('sha256').update(t).digest('hex').slice(0, 16);

export const findingRepository = (db: Queryable) => ({
  /** Records exactly what was shown, once per session/doc and rule. */
  async recordShown(leadId: string, origin: { sessionId?: string; docId?: string }, findings: Finding[]): Promise<void> {
    for (const f of findings) {
      await db.query(
        `INSERT INTO finding (lead_id, session_id, doc_id, origin, rule_id, rule_version, category, severity, field, text_version_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT DO NOTHING`,
        [leadId, origin.sessionId ?? null, origin.docId ?? null, origin.sessionId ? 'quiz' : 'document',
          f.ruleId, f.ruleVersion, f.category, f.severity, f.field ?? null, textVersion(f.text)]);
    }
  },

  async setDwell(sessionId: string, dwellMs: number): Promise<void> {
    await db.query('UPDATE finding SET dwell_ms = $2 WHERE session_id = $1', [sessionId, dwellMs]);
  },

  async markTapped(leadId: string, ruleId: string): Promise<void> {
    await db.query('UPDATE finding SET tapped = true WHERE lead_id = $1 AND rule_id = $2', [leadId, ruleId]);
  },

  async forLead(leadId: string): Promise<(Finding & { origin: string })[]> {
    const { rows } = await db.query<{ rule_id: string; rule_version: string; category: Finding['category']; severity: Finding['severity'];
      field: Finding['field'] | null; origin: string; body: string | null }>(
      `SELECT f.rule_id, f.rule_version, f.category, f.severity, f.field, f.origin, r.body
       FROM finding f LEFT JOIN readout_rule r USING (rule_id, rule_version)
       WHERE f.lead_id = $1 ORDER BY f.shown_ts, f.rule_id`, [leadId]);
    return rows.map((r) => ({ ruleId: r.rule_id, ruleVersion: r.rule_version, category: r.category, severity: r.severity,
      field: r.field ?? undefined, origin: r.origin, text: r.body ?? '' }));
  },
});
export type FindingRepository = ReturnType<typeof findingRepository>;
