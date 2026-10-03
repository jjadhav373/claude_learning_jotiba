import type { Disposition, HandoffInput, Priority, Queue } from '@cover-check/shared';
import type { Queryable } from '../db/pool.js';

export interface HandoffRow {
  handoff_id: string; lead_id: string; requested_action: HandoffInput['requestedAction']; slot_start: string | null;
  slot_end: string | null; call_language: string | null; topic: string | null; note: string | null;
  contact_consent_id: string | null; priority: Priority | null; queue: Queue | null; sla_due_ts: string | null;
}

export const handoffRepository = (db: Queryable) => ({
  async insert(leadId: string, h: HandoffInput, x: { contactConsentId: string | null; priority: Priority | null; queue: Queue | null; slaDue: Date | null }): Promise<HandoffRow> {
    // A newer request replaces any open one for the same lead.
    await db.query('UPDATE handoff SET closed_ts = now() WHERE lead_id = $1 AND closed_ts IS NULL', [leadId]);
    const { rows } = await db.query<HandoffRow>(
      `INSERT INTO handoff (lead_id, requested_action, slot_start, slot_end, call_language, topic, note,
                            contact_consent_id, priority, queue, sla_due_ts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [leadId, h.requestedAction, h.slotStart ?? null, h.slotEnd ?? null, h.callLanguage ?? null, h.topic ?? null,
        h.note ?? null, x.contactConsentId, x.priority, x.queue, x.slaDue]);
    return rows[0]!;
  },

  async enqueue(handoffId: string, priority: Priority, queue: Queue, slaDue: Date): Promise<void> {
    // The CHECK constraint rejects this if contact_consent_id is missing.
    await db.query('UPDATE handoff SET priority = $2, queue = $3, sla_due_ts = $4 WHERE handoff_id = $1', [handoffId, priority, queue, slaDue]);
  },

  async latest(leadId: string): Promise<HandoffRow | null> {
    const { rows } = await db.query<HandoffRow>('SELECT * FROM handoff WHERE lead_id = $1 ORDER BY created_ts DESC LIMIT 1', [leadId]);
    return rows[0] ?? null;
  },

  async closeOpen(leadId: string): Promise<void> {
    await db.query('UPDATE handoff SET closed_ts = now() WHERE lead_id = $1 AND closed_ts IS NULL', [leadId]);
  },

  /** Telecaller queue — reads the gated view, never the raw table. */
  async queue(queue: Queue | null, limit = 50) {
    const { rows } = await db.query(
      `SELECT * FROM agent_queue WHERE ($1::queue_t IS NULL OR queue = $1) LIMIT $2`, [queue, limit]);
    return rows;
  },

  /** Rows for the telecaller sheet. Built on agent_queue, so only consented, non-DND, open hand-offs. */
  async exportable(onlyNew: boolean): Promise<{ handoff_id: string; lead_id: string; mobile: string; priority: Priority; queue: Queue;
    slot_start: string | null; slot_end: string | null; sla_due_ts: string | null; exported_ts: string | null }[]> {
    const { rows } = await db.query(
      `SELECT q.handoff_id, q.lead_id, l.mobile, q.priority, q.queue, q.slot_start, q.slot_end, q.sla_due_ts, h.exported_ts
       FROM agent_queue q
       JOIN lead l USING (lead_id)
       JOIN handoff h ON h.handoff_id = q.handoff_id
       WHERE ($1::boolean = false OR h.exported_ts IS NULL)
       ORDER BY q.priority, COALESCE(q.slot_start, q.sla_due_ts)`, [onlyNew]);
    return rows;
  },

  async markExported(handoffIds: string[], batch: string): Promise<void> {
    if (!handoffIds.length) return;
    await db.query('UPDATE handoff SET exported_ts = now(), export_batch = $2 WHERE handoff_id = ANY($1::uuid[])', [handoffIds, batch]);
  },

  async isOpenFor(handoffId: string, leadId: string): Promise<boolean> {
    const { rows } = await db.query('SELECT 1 FROM handoff WHERE handoff_id = $1 AND lead_id = $2 AND closed_ts IS NULL', [handoffId, leadId]);
    return rows.length > 0;
  },

  async lastOutcome(handoffId: string): Promise<{ disposition: Disposition; agent_notes: string | null; enquiry_id: string | null } | null> {
    const { rows } = await db.query('SELECT disposition, agent_notes, enquiry_id FROM call_outcome WHERE handoff_id = $1 ORDER BY attempt_no DESC LIMIT 1', [handoffId]);
    return rows[0] ?? null;
  },

  async assign(handoffId: string, agentId: string): Promise<boolean> {
    const { rowCount } = await db.query(
      `UPDATE handoff SET assigned_agent_id = $2 WHERE handoff_id = $1 AND closed_ts IS NULL
         AND (assigned_agent_id IS NULL OR assigned_agent_id = $2)`, [handoffId, agentId]);
    return (rowCount ?? 0) > 0;
  },

  async recordOutcome(o: { handoffId: string; leadId: string; agentId: string; connected: boolean; durationSec?: number;
    disposition: Disposition; enquiryId?: string; quoteShared?: boolean; policySold?: boolean; notes?: string; followupTs?: string }) {
    const { rows } = await db.query<{ outcome_id: string; attempt_no: number }>(
      `INSERT INTO call_outcome (handoff_id, lead_id, agent_id, attempt_no, connected, duration_sec, disposition,
                                 enquiry_id, quote_shared, policy_sold, agent_notes, followup_ts)
       SELECT $1, $2, $3, COALESCE(max(attempt_no), 0) + 1, $4, $5, $6, $7, $8, $9, $10, $11
       FROM call_outcome WHERE handoff_id = $1
       RETURNING outcome_id, attempt_no`,
      [o.handoffId, o.leadId, o.agentId, o.connected, o.durationSec ?? null, o.disposition, o.enquiryId ?? null,
        o.quoteShared ?? false, o.policySold ?? false, o.notes ?? null, o.followupTs ?? null]);
    if (o.disposition !== 'callback_later') await db.query('UPDATE handoff SET closed_ts = now() WHERE handoff_id = $1', [o.handoffId]);
    return rows[0]!;
  },
});
export type HandoffRepository = ReturnType<typeof handoffRepository>;
