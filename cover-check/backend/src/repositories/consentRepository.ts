import type { ConsentMethod, ConsentPurpose, Language, WithdrawnVia } from '@cover-check/shared';
import type { Queryable } from '../db/pool.js';

export interface ConsentRecord {
  leadId: string;
  purpose: ConsentPurpose;
  noticeVersion: string;
  noticeLanguage: Language;
  method: ConsentMethod;
  ip?: string;
  userAgent?: string;
}

export interface CurrentConsent { purpose: ConsentPurpose; consent_id: string; granted: boolean; granted_ts: string; notice_version: string }

/** Append-only ledger: this repository never issues UPDATE or DELETE (the DB forbids it too). */
export const consentRepository = (db: Queryable) => ({
  async grant(c: ConsentRecord): Promise<string> {
    const { rows } = await db.query<{ consent_id: string }>(
      `INSERT INTO consent (lead_id, purpose, notice_version, notice_language, notice_sha256, granted, method, ip, user_agent)
       SELECT $1, $2, $3, $4, nv.body_sha256, true, $5, $6::inet, $7
       FROM notice_version nv
       WHERE nv.notice_version = $3 AND nv.notice_language = $4 AND nv.purpose = $2
       RETURNING consent_id`,
      [c.leadId, c.purpose, c.noticeVersion, c.noticeLanguage, c.method, c.ip ?? null, c.userAgent ?? null]);
    if (!rows[0]) throw new Error(`No notice text for ${c.purpose} ${c.noticeVersion}/${c.noticeLanguage}`);
    return rows[0].consent_id;
  },

  async withdraw(leadId: string, purposes: ConsentPurpose[], via: WithdrawnVia, noticeVersion: string): Promise<number> {
    const { rowCount } = await db.query(
      `INSERT INTO consent (lead_id, purpose, notice_version, notice_language, notice_sha256, granted, method, withdrawn_ts, withdrawn_via)
       SELECT cc.lead_id, cc.purpose, $3, 'en', 'withdrawal', false, 'button', now(), $4
       FROM consent_current cc
       WHERE cc.lead_id = $1 AND cc.purpose = ANY($2::consent_purpose_t[]) AND cc.granted`,
      [leadId, purposes, noticeVersion, via]);
    return rowCount ?? 0;
  },

  async current(leadId: string): Promise<CurrentConsent[]> {
    const { rows } = await db.query<CurrentConsent>(
      'SELECT purpose, consent_id, granted, granted_ts, notice_version FROM consent_current WHERE lead_id = $1', [leadId]);
    return rows;
  },

  async isGranted(leadId: string, purpose: ConsentPurpose): Promise<CurrentConsent | null> {
    const { rows } = await db.query<CurrentConsent>(
      'SELECT purpose, consent_id, granted, granted_ts, notice_version FROM consent_current WHERE lead_id = $1 AND purpose = $2 AND granted',
      [leadId, purpose]);
    return rows[0] ?? null;
  },
});
export type ConsentRepository = ReturnType<typeof consentRepository>;
