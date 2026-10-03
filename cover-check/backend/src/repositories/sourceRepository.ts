import type { Door } from '@cover-check/shared';
import type { Queryable } from '../db/pool.js';

export interface NewSource {
  leadId: string;
  linkTokenHash: string;
  door: Door;
  waTemplateId?: string;
  waMessageId?: string;
  campaignId?: string;
  creativeId?: string;
  utm?: { source?: string; medium?: string; campaign?: string };
  device?: { type?: string; os?: string; browser?: string };
}

export const sourceRepository = (db: Queryable) => ({
  async insert(s: NewSource): Promise<string> {
    const { rows } = await db.query<{ source_id: string }>(
      `INSERT INTO source (lead_id, link_token_hash, door, wa_template_id, wa_message_id, campaign_id, creative_id,
                           utm_source, utm_medium, utm_campaign, device_type, os, browser)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING source_id`,
      [s.leadId, s.linkTokenHash, s.door, s.waTemplateId ?? null, s.waMessageId ?? null, s.campaignId ?? null,
        s.creativeId ?? null, s.utm?.source ?? null, s.utm?.medium ?? null, s.utm?.campaign ?? null,
        s.device?.type ?? null, s.device?.os ?? null, s.device?.browser ?? null]);
    return rows[0]!.source_id;
  },

  /** Resolve a link token (by hash) to its lead, even if the mobile was changed on S8. */
  async leadForToken(tokenHash: string): Promise<{ lead_id: string; source_id: string } | null> {
    const { rows } = await db.query<{ lead_id: string; source_id: string }>(
      'SELECT lead_id, source_id FROM source WHERE link_token_hash = $1 ORDER BY first_click_ts DESC LIMIT 1', [tokenHash]);
    return rows[0] ?? null;
  },

  async firstDoor(leadId: string): Promise<Door | null> {
    const { rows } = await db.query<{ door: Door }>(
      'SELECT door FROM source WHERE lead_id = $1 ORDER BY first_click_ts LIMIT 1', [leadId]);
    return rows[0]?.door ?? null;
  },
});
export type SourceRepository = ReturnType<typeof sourceRepository>;
