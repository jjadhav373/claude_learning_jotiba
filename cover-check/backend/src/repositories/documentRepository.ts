import type { DocFailure, DocStatus, PolicyFactKey, PolicyFactView } from '@cover-check/shared';
import { FACT_LABEL } from '@cover-check/shared';
import type { Queryable } from '../db/pool.js';

export interface DocumentRow {
  doc_id: string; lead_id: string; file_ref: string; original_name: string; mime: string; size_bytes: number;
  password_protected: boolean; password_attempts: number; processing_status: DocStatus; failure_reason: DocFailure | null;
  failed_page: number | null; content_sha256: string; policy_number_last4: string | null; uploaded_ts: string;
}

export interface ExtractedFact { key: PolicyFactKey; value: unknown | null; sourcePage: number | null; confidence: number | null }

export const documentRepository = (db: Queryable) => ({
  async insert(d: { leadId: string; consentId: string; fileRef: string; originalName: string; mime: string; sizeBytes: number;
    contentSha256: string; retentionDays: number }): Promise<DocumentRow> {
    const { rows } = await db.query<DocumentRow>(
      `INSERT INTO policy_document (lead_id, consent_id, file_ref, original_name, mime, size_bytes, content_sha256, retention_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now() + make_interval(days => $8)) RETURNING *`,
      [d.leadId, d.consentId, d.fileRef, d.originalName, d.mime, d.sizeBytes, d.contentSha256, d.retentionDays]);
    return rows[0]!;
  },

  async get(docId: string, leadId: string): Promise<DocumentRow | null> {
    const { rows } = await db.query<DocumentRow>(
      'SELECT * FROM policy_document WHERE doc_id = $1 AND lead_id = $2 AND deleted_ts IS NULL', [docId, leadId]);
    return rows[0] ?? null;
  },

  async setStatus(docId: string, status: DocStatus, x: { failure?: DocFailure; failedPage?: number; passwordProtected?: boolean;
    extractorVersion?: string; pages?: number; last4?: string } = {}): Promise<void> {
    await db.query(
      `UPDATE policy_document SET processing_status = $2, failure_reason = $3, failed_page = $4,
              password_protected = COALESCE($5, password_protected), extractor_version = COALESCE($6, extractor_version),
              pages = COALESCE($7, pages), policy_number_last4 = COALESCE($8, policy_number_last4),
              ready_ts = CASE WHEN $2 IN ('ready','needs_review') THEN now() ELSE ready_ts END
       WHERE doc_id = $1`,
      [docId, status, x.failure ?? null, x.failedPage ?? null, x.passwordProtected ?? null, x.extractorVersion ?? null,
        x.pages ?? null, x.last4 ?? null]);
  },

  async bumpPasswordAttempts(docId: string): Promise<number> {
    const { rows } = await db.query<{ password_attempts: number }>(
      'UPDATE policy_document SET password_attempts = password_attempts + 1 WHERE doc_id = $1 RETURNING password_attempts', [docId]);
    return rows[0]?.password_attempts ?? 0;
  },

  /** Exception state "same policy uploaded twice": keep the latest. */
  async supersedeDuplicates(doc: DocumentRow): Promise<void> {
    if (!doc.policy_number_last4) return;
    await db.query(
      `UPDATE policy_document SET superseded_by = $1
       WHERE lead_id = $2 AND doc_id <> $1 AND policy_number_last4 = $3 AND superseded_by IS NULL AND deleted_ts IS NULL`,
      [doc.doc_id, doc.lead_id, doc.policy_number_last4]);
  },

  async saveFacts(docId: string, facts: ExtractedFact[]): Promise<void> {
    for (const f of facts) {
      await db.query(
        `INSERT INTO policy_fact (doc_id, fact_key, value, source_page, confidence) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (doc_id, fact_key) DO UPDATE SET value = EXCLUDED.value, source_page = EXCLUDED.source_page,
           confidence = EXCLUDED.confidence`,
        [docId, f.key, f.value === null ? null : JSON.stringify(f.value), f.sourcePage, f.confidence]);
    }
  },

  async facts(docId: string): Promise<PolicyFactView[]> {
    const { rows } = await db.query<{ fact_key: PolicyFactKey; value: unknown; source_page: number | null; confidence: string | null;
      user_confirmed: boolean; user_value: unknown }>(
      'SELECT fact_key, value, source_page, confidence, user_confirmed, user_value FROM policy_fact WHERE doc_id = $1', [docId]);
    const str = (v: unknown) => (v === null || v === undefined ? null : typeof v === 'string' ? v : JSON.stringify(v));
    return rows.map((r) => ({ key: r.fact_key, label: FACT_LABEL[r.fact_key], value: str(r.value), sourcePage: r.source_page,
      confidence: r.confidence === null ? null : Number(r.confidence), userConfirmed: r.user_confirmed, userValue: str(r.user_value) }));
  },

  /** U5: person confirms or edits. Edited values are kept beside the extracted value. */
  async confirmFacts(docId: string, edits: { key: PolicyFactKey; userValue: string | null }[]): Promise<void> {
    await db.query('UPDATE policy_fact SET user_confirmed = true, confirmed_ts = now() WHERE doc_id = $1', [docId]);
    for (const e of edits) {
      await db.query(
        `INSERT INTO policy_fact (doc_id, fact_key, value, user_confirmed, user_value, confirmed_ts)
         VALUES ($1, $2, NULL, true, $3, now())
         ON CONFLICT (doc_id, fact_key) DO UPDATE SET user_value = EXCLUDED.user_value, user_confirmed = true, confirmed_ts = now()`,
        [docId, e.key, e.userValue === null ? null : JSON.stringify(e.userValue)]);
    }
  },

  async logAccess(docId: string, actor: string, action: string): Promise<void> {
    await db.query('INSERT INTO document_access_log (doc_id, actor, action) VALUES ($1,$2,$3)', [docId, actor, action]);
  },

  async latestForLead(leadId: string): Promise<DocumentRow | null> {
    const { rows } = await db.query<DocumentRow>(
      `SELECT * FROM policy_document WHERE lead_id = $1 AND deleted_ts IS NULL AND superseded_by IS NULL
       ORDER BY uploaded_ts DESC LIMIT 1`, [leadId]);
    return rows[0] ?? null;
  },

  async purgeExpired(): Promise<number> {
    const { rows } = await db.query<{ n: number }>('SELECT purge_expired_documents() AS n');
    return rows[0]?.n ?? 0;
  },
});
export type DocumentRepository = ReturnType<typeof documentRepository>;
