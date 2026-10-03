/**
 * S9 "What next" and the telecaller side. The handoff row is the only thing that can put a lead
 * in front of a telecaller, and it cannot be queued without a contact_call consent.
 */
import {
  buildLeadCard, isInsideCallWindow, queueFor, slaDue, type Disposition, type HandoffInput, type LeadCard, type Queue,
  type QuizAnswers, type Finding,
} from '@cover-check/shared';
import { AppError } from './errors.js';
import type { Deps, LeadCtx } from './deps.js';
import { recomputeLeadState } from './leadStateService.js';

const CALL_ACTIONS = new Set(['advisor_call', 'callback']);

export const handoffService = (d: Deps) => ({
  async request(ctx: LeadCtx, h: HandoffInput, language: 'en' | 'hi' | 'mr') {
    const wantsCall = CALL_ACTIONS.has(h.requestedAction);
    if (wantsCall) {
      if (!h.contactConsent) throw new AppError('CONSENT_REQUIRED', 'Tick the box so we are allowed to call you.');
      if (!h.slotStart || !h.slotEnd || !h.callLanguage) throw new AppError('VALIDATION', 'Pick a time and a language for the call.');
      if (!isInsideCallWindow(h.slotStart, h.slotEnd) || new Date(h.slotStart) <= d.now())
        throw new AppError('OUTSIDE_CALL_HOURS', 'Pick a time inside calling hours.');
    }
    if (h.note && h.note.length > 140) throw new AppError('VALIDATION', 'Keep the note under 140 characters.');

    return d.tx(async (r) => {
      const lead = await r.leads.get(ctx.leadId);
      if (!lead) throw new AppError('NOT_FOUND', 'Not found');
      if (wantsCall && !lead.mobile_verified) throw new AppError('OTP_REQUIRED', 'Verify your number first.');

      let contactConsentId: string | null = null;
      if (h.contactConsent) {
        contactConsentId = await r.consents.grant({ leadId: ctx.leadId, purpose: 'contact_call', noticeVersion: d.config.noticeVersion,
          noticeLanguage: language, method: 'tick', ip: ctx.ip, userAgent: ctx.userAgent });
      } else {
        contactConsentId = (await r.consents.isGranted(ctx.leadId, 'contact_call'))?.consent_id ?? null;
      }

      // Store the request, derive state from it, then queue it only if state + consent allow.
      const row = await r.handoffs.insert(ctx.leadId, h, { contactConsentId, priority: null, queue: null, slaDue: null });
      const { state, priority } = await recomputeLeadState(r, ctx.leadId);
      const queue: Queue | null = contactConsentId && !lead.do_not_contact ? queueFor(state) : null;
      if (queue && priority)
        await r.handoffs.enqueue(row.handoff_id, priority, queue, slaDue(priority, d.now(), h.slotStart ? new Date(h.slotStart) : undefined));
      await r.events.log({ name: 'next_action_selected', leadId: ctx.leadId, screenId: 'S9', props: { action: h.requestedAction } });
      if (wantsCall) await r.events.log({ name: 'call_requested', leadId: ctx.leadId, props: { priority } });
      if (h.requestedAction === 'see_plans') await r.events.log({ name: 'plans_viewed', leadId: ctx.leadId });
      return { handoffId: row.handoff_id, leadState: state, priority, queued: !!queue };
    });
  },

  // ---------------------------------------------------------------- telecaller

  queue: (queue: Queue | null) => d.repos.handoffs.queue(queue),

  async card(leadId: string, agentName?: string): Promise<LeadCard> {
    const src = await d.repos.leadCards.get(leadId);
    if (!src) throw new AppError('NOT_FOUND', 'Lead not found');
    const answers: QuizAnswers = {};
    for (const k of ['situation', 'members', 'eldest_age', 'children_count', 'parents_age_band', 'sum_insured_band', 'family_in_group_cover',
      'health_condition', 'policy_age_band', 'job_exit_cover', 'room_rent_limit', 'room_rent_note', 'top_concern', 'renewal_window',
      'personal_policy_besides_group', 'start_timing'] as const) if (src[k] !== null && src[k] !== undefined) (answers as any)[k] = src[k];
    const findings: Finding[] = await d.repos.findings.forLead(leadId);
    const uploadStatus = !src.doc_id ? 'none' : src.doc_status === 'ready' ? 'ready' : src.doc_status === 'failed' ? 'failed' : 'processing';
    return buildLeadCard({
      leadId, firstName: src.first_name, pincode: src.pincode, city: src.city, state: src.state, mobileVerified: src.mobile_verified,
      leadState: src.lead_state, priority: src.priority, answers, findings,
      handoff: src.requested_action ? { action: src.requested_action, slotStart: src.slot_start?.toISOString?.() ?? src.slot_start,
        slotEnd: src.slot_end?.toISOString?.() ?? src.slot_end, callLanguage: src.call_language, topic: src.topic, note: src.note } : null,
      upload: { status: uploadStatus, insurer: src.insurer_name, product: src.product_name },
      contactConsentTs: src.contact_granted ? (src.contact_consent_ts?.toISOString?.() ?? src.contact_consent_ts) : null,
      noticeVersion: src.contact_notice_version, agentName,
    });
  },

  async outcome(agentId: string, handoffId: string, leadId: string, o: { connected: boolean; durationSec?: number; disposition: Disposition;
    enquiryId?: string; quoteShared?: boolean; policySold?: boolean; notes?: string; followupTs?: string }) {
    return d.tx(async (r) => {
      const res = await r.handoffs.recordOutcome({ handoffId, leadId, agentId, ...o });
      if (o.disposition === 'do_not_call') {
        await r.consents.withdraw(leadId, ['contact_call'], 'advisor', d.config.noticeVersion);
        await r.leads.setDoNotContact(leadId);
        await recomputeLeadState(r, leadId);
      }
      return res;
    });
  },
});
export type HandoffService = ReturnType<typeof handoffService>;
