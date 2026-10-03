import type { AnswerField, QuizAnswers, Situation } from '@cover-check/shared';
import type { Queryable } from '../db/pool.js';

export interface SessionRow {
  session_id: string;
  lead_id: string;
  path: Situation | null;
  started_ts: string;
  completed_ts: string | null;
  last_screen_id: string;
  screens_completed: number;
  unsure_count: number;
}

/** Columns in quiz_answer — whitelist so no user key ever becomes SQL. */
const COLUMNS: AnswerField[] = [
  'situation', 'members', 'eldest_age', 'children_count', 'parents_age_band', 'sum_insured_band', 'family_in_group_cover',
  'health_condition', 'condition_tags', 'policy_age_band', 'job_exit_cover', 'room_rent_limit', 'room_rent_note',
  'top_concern', 'renewal_window', 'personal_policy_besides_group', 'start_timing',
];
const ARRAY_CAST: Partial<Record<AnswerField, string>> = { members: '::member_t[]', condition_tags: '::condition_tag_t[]' };

export const quizRepository = (db: Queryable) => ({
  async openSession(leadId: string): Promise<SessionRow | null> {
    const { rows } = await db.query<SessionRow>(
      `SELECT * FROM quiz_session WHERE lead_id = $1 AND completed_ts IS NULL ORDER BY started_ts DESC LIMIT 1`, [leadId]);
    return rows[0] ?? null;
  },

  async latestSession(leadId: string): Promise<SessionRow | null> {
    const { rows } = await db.query<SessionRow>(
      'SELECT * FROM quiz_session WHERE lead_id = $1 ORDER BY started_ts DESC LIMIT 1', [leadId]);
    return rows[0] ?? null;
  },

  async startSession(leadId: string, sourceId: string | null, resumed: boolean): Promise<SessionRow> {
    const { rows } = await db.query<SessionRow>(
      `INSERT INTO quiz_session (lead_id, source_id, resumed) VALUES ($1, $2, $3) RETURNING *`, [leadId, sourceId, resumed]);
    await db.query('INSERT INTO quiz_answer (session_id) VALUES ($1)', [rows[0]!.session_id]);
    return rows[0]!;
  },

  async getSession(sessionId: string): Promise<SessionRow | null> {
    const { rows } = await db.query<SessionRow>('SELECT * FROM quiz_session WHERE session_id = $1', [sessionId]);
    return rows[0] ?? null;
  },

  async getAnswers(sessionId: string): Promise<QuizAnswers> {
    // enum arrays are cast to text[] so the driver returns JS arrays, not '{a,b}' strings
    const select = COLUMNS.map((c) => (ARRAY_CAST[c] ? `${c}::text[] AS ${c}` : c)).join(', ');
    const { rows } = await db.query<Record<string, unknown>>(`SELECT ${select} FROM quiz_answer WHERE session_id = $1`, [sessionId]);
    const r = rows[0] ?? {};
    const out: Record<string, unknown> = {};
    for (const c of COLUMNS) if (r[c] !== null && r[c] !== undefined) out[c] = r[c];
    return out as QuizAnswers;
  },

  /** Replaces the full answer set (already pruned + validated by the service). */
  async replaceAnswers(sessionId: string, a: QuizAnswers): Promise<void> {
    const sets = COLUMNS.map((c, i) => `${c} = $${i + 2}${ARRAY_CAST[c] ?? ''}`);
    await db.query(`UPDATE quiz_answer SET ${sets.join(', ')} WHERE session_id = $1`,
      [sessionId, ...COLUMNS.map((c) => (a[c] === undefined ? null : a[c]))]);
  },

  async recordAnswerMeta(sessionId: string, screenId: string, fields: AnswerField[], timeOnScreenMs: number | null): Promise<void> {
    if (!fields.length) return;
    await db.query(
      `INSERT INTO quiz_answer_meta (session_id, field, screen_id, time_on_screen_ms)
       SELECT $1, f, $2, $3 FROM unnest($4::text[]) AS f
       ON CONFLICT (session_id, field) DO UPDATE
         SET answered_ts = now(), time_on_screen_ms = EXCLUDED.time_on_screen_ms,
             changed_count = quiz_answer_meta.changed_count + 1`,
      [sessionId, screenId, timeOnScreenMs, fields]);
  },

  async updateProgress(sessionId: string, p: { path: Situation | null; lastScreenId: string; screensCompleted: number; unsureCount: number }) {
    await db.query(
      `UPDATE quiz_session SET path = $2, last_screen_id = $3,
              screens_completed = GREATEST(screens_completed, $4), unsure_count = $5
       WHERE session_id = $1`, [sessionId, p.path, p.lastScreenId, p.screensCompleted, p.unsureCount]);
  },

  async complete(sessionId: string): Promise<void> {
    await db.query(
      `UPDATE quiz_session SET completed_ts = now(),
              total_time_sec = EXTRACT(EPOCH FROM now() - started_ts)::int
       WHERE session_id = $1 AND completed_ts IS NULL`, [sessionId]);
  },
});
export type QuizRepository = ReturnType<typeof quizRepository>;
