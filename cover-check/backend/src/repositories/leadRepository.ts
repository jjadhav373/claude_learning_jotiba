import type { Language, LeadState, Priority } from '@cover-check/shared';
import type { Queryable } from '../db/pool.js';

export interface LeadRow {
  lead_id: string;
  mobile: string;
  mobile_confirmed: boolean;
  mobile_verified: boolean;
  first_name: string | null;
  pincode: string | null;
  city: string | null;
  state: string | null;
  language: Language | null;
  lead_state: LeadState;
  priority: Priority | null;
  do_not_contact: boolean;
}

export const leadRepository = (db: Queryable) => ({
  /** One row per mobile: repeat visits merge on the unique mobile. */
  async upsertByMobile(mobile: string): Promise<LeadRow> {
    const { rows } = await db.query<LeadRow>(
      `INSERT INTO lead (mobile) VALUES ($1)
       ON CONFLICT (mobile) DO UPDATE SET last_seen_ts = now()
       RETURNING *`, [mobile]);
    return rows[0]!;
  },

  async get(leadId: string): Promise<LeadRow | null> {
    const { rows } = await db.query<LeadRow>('SELECT * FROM lead WHERE lead_id = $1', [leadId]);
    return rows[0] ?? null;
  },

  async saveCapture(leadId: string, c: { firstName: string; pincode: string; city: string | null; state: string | null;
    language: Language | null; mobile?: string }): Promise<void> {
    await db.query(
      `UPDATE lead SET first_name = $2, pincode = $3, city = $4, state = $5,
              language = COALESCE($6::language_t, language), mobile_confirmed = true,
              mobile = COALESCE($7, mobile),
              mobile_verified = CASE WHEN $7::text IS NOT NULL AND $7 <> mobile THEN false ELSE mobile_verified END
       WHERE lead_id = $1`,
      [leadId, c.firstName, c.pincode, c.city, c.state, c.language, c.mobile ?? null]);
  },

  async markVerified(leadId: string): Promise<void> {
    await db.query('UPDATE lead SET mobile_verified = true, mobile_verified_ts = now() WHERE lead_id = $1', [leadId]);
  },

  async setLanguage(leadId: string, language: Language): Promise<void> {
    await db.query('UPDATE lead SET language = $2 WHERE lead_id = $1', [leadId, language]);
  },

  async setStateAndPriority(leadId: string, state: LeadState, priority: Priority | null): Promise<void> {
    await db.query('UPDATE lead SET lead_state = $2, priority = $3 WHERE lead_id = $1', [leadId, state, priority]);
  },

  async setDoNotContact(leadId: string): Promise<void> {
    await db.query('UPDATE lead SET do_not_contact = true WHERE lead_id = $1', [leadId]);
  },

  async findByMobile(mobile: string): Promise<LeadRow | null> {
    const { rows } = await db.query<LeadRow>('SELECT * FROM lead WHERE mobile = $1', [mobile]);
    return rows[0] ?? null;
  },
});
export type LeadRepository = ReturnType<typeof leadRepository>;
