/**
 * Rung 1: link open (S0), quiz (S1–S6), readout (S7), capture (S8), withdrawal (S10).
 */
import {
  buildReadout, isFirstName, isIndianMobile, isPincode, maskMobile, pathOf, pruneAnswers, screensForAnswers, screenErrors,
  unsureCount, PINCODE_PREFIX_DEMO, type AnswerField, type Bootstrap, type CaptureInput, type Language, type QuizAnswers,
  type Readout, type ScreenId,
} from '@cover-check/shared';
import { AppError } from './errors.js';
import type { Deps, LeadCtx } from './deps.js';
import { recomputeLeadState } from './leadStateService.js';

export const journeyService = (d: Deps) => {
  const lookupPincode = async (pin: string): Promise<{ city: string | null; state: string | null }> => {
    if (!isPincode(pin)) throw new AppError('VALIDATION', 'Enter a 6 digit pincode');
    const row = await d.repos.reference.pincode(pin);
    if (row) return row;
    const demo = PINCODE_PREFIX_DEMO[pin.slice(0, 3)];
    return demo ? { city: demo[0], state: demo[1] } : { city: null, state: null };
  };

  return {
    /** S0: resolve the token, merge the lead by mobile, log the source. Nothing is asked here. */
    async openLink(token: string, device: { type?: string; os?: string; browser?: string }, utm?: Record<string, string>): Promise<Bootstrap & { sourceId: string }> {
      const p = d.tokens.verify(token, d.now().getTime());
      return d.tx(async (r) => {
        const lead = await r.leads.upsertByMobile(p.m);
        const sourceId = await r.sources.insert({ leadId: lead.lead_id, linkTokenHash: d.tokens.hash(token), door: p.d,
          waTemplateId: p.t, waMessageId: p.w, campaignId: p.c, creativeId: p.cr, device,
          utm: { source: utm?.utm_source, medium: utm?.utm_medium, campaign: utm?.utm_campaign } });
        await r.events.log({ name: 'link_clicked', leadId: lead.lead_id, props: { door: p.d } });
        const open = await r.quiz.openSession(lead.lead_id);
        return {
          sourceId, leadId: lead.lead_id, sessionId: open?.session_id ?? null, door: p.d, maskedMobile: maskMobile(lead.mobile),
          mobileVerified: lead.mobile_verified, language: lead.language ?? 'en', firstName: lead.first_name ?? undefined,
          answers: open ? await r.quiz.getAnswers(open.session_id) : {}, noticeVersion: d.config.noticeVersion,
        };
      });
    },

    async logEvent(ctx: LeadCtx, name: Parameters<Deps['repos']['events']['log']>[0]['name'], screenId?: ScreenId, props?: Record<string, unknown>, sessionId?: string) {
      await d.repos.events.log({ name, leadId: ctx.leadId, screenId, props, sessionId });
    },

    /** First tap on S1 starts the session and records save_answers consent (S0 notice + tap). */
    async startQuiz(ctx: LeadCtx, language: Language): Promise<{ sessionId: string }> {
      return d.tx(async (r) => {
        const open = await r.quiz.openSession(ctx.leadId);
        if (open) return { sessionId: open.session_id };
        await r.consents.grant({ leadId: ctx.leadId, purpose: 'save_answers', noticeVersion: d.config.noticeVersion,
          noticeLanguage: language, method: 'button', ip: ctx.ip, userAgent: ctx.userAgent });
        const prior = await r.quiz.latestSession(ctx.leadId);
        const s = await r.quiz.startSession(ctx.leadId, ctx.sourceId, !!prior);
        await r.events.log({ name: 'quiz_started', leadId: ctx.leadId, sessionId: s.session_id, screenId: 'S1' });
        return { sessionId: s.session_id };
      });
    },

    /** Save one screen. The server re-validates with the same config the UI renders. */
    async saveScreen(ctx: LeadCtx, sessionId: string, screenId: ScreenId, patch: QuizAnswers, timeOnScreenMs: number | null) {
      return d.tx(async (r) => {
        const s = await r.quiz.getSession(sessionId);
        if (!s || s.lead_id !== ctx.leadId) throw new AppError('NOT_FOUND', 'Session not found');
        if (s.completed_ts) throw new AppError('CONFLICT', 'This quiz is already finished');
        const merged = pruneAnswers({ ...(await r.quiz.getAnswers(sessionId)), ...patch });
        const screens = screensForAnswers(merged);
        const idx = screens.findIndex((x) => x.id === screenId);
        if (idx < 0) throw new AppError('VALIDATION', 'Unknown screen for this path');
        const errors = screenErrors(screens[idx]!, merged);
        if (Object.keys(errors).length) throw new AppError('VALIDATION', 'Some answers are missing', errors);
        if (merged.condition_tags?.length && merged.health_condition !== 'yes') delete merged.condition_tags;

        await r.quiz.replaceAnswers(sessionId, merged);
        await r.quiz.recordAnswerMeta(sessionId, screenId, Object.keys(patch) as AnswerField[], timeOnScreenMs);
        await r.quiz.updateProgress(sessionId, { path: merged.situation ?? null, lastScreenId: screenId, screensCompleted: idx + 1, unsureCount: unsureCount(merged) });
        await r.events.log({ name: 'answer_submitted', leadId: ctx.leadId, sessionId, screenId, props: { timeOnScreenMs } });
        return { answers: merged, next: screens[idx + 1]?.id ?? 'S7' };
      });
    },

    /** S6 done → S7 readout. Records exactly which rule lines were shown. */
    async completeQuiz(ctx: LeadCtx, sessionId: string): Promise<Readout> {
      return d.tx(async (r) => {
        const s = await r.quiz.getSession(sessionId);
        if (!s || s.lead_id !== ctx.leadId) throw new AppError('NOT_FOUND', 'Session not found');
        const a = await r.quiz.getAnswers(sessionId);
        const screens = screensForAnswers(a);
        const missing = screens.find((x) => Object.keys(screenErrors(x, a)).length);
        if (missing) throw new AppError('VALIDATION', `Please finish ${missing.id}`, { screen: missing.id });
        await r.quiz.complete(sessionId);
        const readout = buildReadout(a);
        await r.findings.recordShown(ctx.leadId, { sessionId }, readout.check);
        await r.events.log({ name: 'quiz_completed', leadId: ctx.leadId, sessionId, props: { path: pathOf(a.situation!), unsure: unsureCount(a) } });
        await r.events.log({ name: 'readout_viewed', leadId: ctx.leadId, sessionId, screenId: 'S7', props: { rules: readout.check.map((f) => f.ruleId) } });
        return readout;
      });
    },

    async readoutDwell(ctx: LeadCtx, sessionId: string, dwellMs: number) {
      const s = await d.repos.quiz.getSession(sessionId);
      if (!s || s.lead_id !== ctx.leadId) throw new AppError('NOT_FOUND', 'Session not found');
      await d.repos.findings.setDwell(sessionId, Math.max(0, Math.min(dwellMs, 3_600_000)));
    },

    lookupPincode,

    /** S8: the least that makes a lead usable. Sends the WhatsApp summary. Never creates a call. */
    async capture(ctx: LeadCtx, input: CaptureInput) {
      const errors: Record<string, string> = {};
      if (!isFirstName(input.firstName)) errors.firstName = 'Enter your first name (2 to 40 letters)';
      if (!isPincode(input.pincode)) errors.pincode = 'Enter a 6 digit pincode';
      if (!input.mobileConfirmed && !input.newMobile) errors.mobile = 'Confirm your WhatsApp number';
      if (input.newMobile && !isIndianMobile(input.newMobile)) errors.mobile = 'Enter a valid 10 digit mobile number';
      if (Object.keys(errors).length) throw new AppError('VALIDATION', 'Please check the highlighted fields', errors);
      const place = await lookupPincode(input.pincode);
      const language = input.language ?? 'en';

      const result = await d.tx(async (r) => {
        if (input.newMobile) {
          const other = await r.leads.findByMobile(input.newMobile);
          if (other && other.lead_id !== ctx.leadId) throw new AppError('CONFLICT', 'This number already has a Cover Check. Use the link sent to it.');
        }
        await r.leads.saveCapture(ctx.leadId, { firstName: input.firstName.trim(), pincode: input.pincode, city: place.city, state: place.state,
          language, mobile: input.newMobile });
        await r.consents.grant({ leadId: ctx.leadId, purpose: 'whatsapp_summary', noticeVersion: d.config.noticeVersion, noticeLanguage: language,
          method: 'button', ip: ctx.ip, userAgent: ctx.userAgent });
        await r.events.log({ name: 'capture_submitted', leadId: ctx.leadId, screenId: 'S8' });
        await recomputeLeadState(r, ctx.leadId);
        return { lead: (await r.leads.get(ctx.leadId))!, session: await r.quiz.latestSession(ctx.leadId) };
      });

      // Outside the transaction: a WhatsApp failure must not lose the person's answers.
      const answers = result.session ? await d.repos.quiz.getAnswers(result.session.session_id) : {};
      const readout = buildReadout(answers);
      const sent = await d.whatsapp.sendTemplate(result.lead.mobile, d.config.waSummaryTemplateId, [
        result.lead.first_name ?? '', readout.know.slice(0, 3).join(' '), readout.check.map((c) => `• ${c.text}`).join('\n') || 'Nothing to check right now.',
      ]);
      await d.repos.whatsapp.record({ waMessageId: sent.messageId, leadId: ctx.leadId, templateId: d.config.waSummaryTemplateId, kind: 'summary' });
      await d.repos.events.log({ name: 'summary_sent', leadId: ctx.leadId, props: { waMessageId: sent.messageId } });
      return { city: place.city, state: place.state, maskedMobile: maskMobile(result.lead.mobile), summarySentAt: d.now().toISOString(), waMessageId: sent.messageId };
    },

    /** S10 "Withdraw" button, or a STOP reply on WhatsApp. Removes the lead from every call queue at once. */
    async withdraw(leadId: string, via: 'page' | 'stop_reply' | 'advisor') {
      return d.tx(async (r) => {
        const n = await r.consents.withdraw(leadId, ['contact_call', 'whatsapp_summary'], via, d.config.noticeVersion);
        await r.leads.setDoNotContact(leadId);
        await r.handoffs.closeOpen(leadId);
        await r.events.log({ name: 'consent_withdrawn', leadId, props: { via, rows: n } });
        await recomputeLeadState(r, leadId);
        return { withdrawn: n };
      });
    },
  };
};
export type JourneyService = ReturnType<typeof journeyService>;
