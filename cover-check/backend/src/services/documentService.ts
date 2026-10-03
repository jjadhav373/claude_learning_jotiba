/**
 * Rung 2: U1 consent → U2 OTP → U3 files → U4 reading → U5 confirm → U6/U7 summary.
 * Passwords are used once, in memory, and never stored or logged.
 */
import { createHash, randomUUID } from 'node:crypto';
import { buildCoverSummary, KEY_FACTS, type CoverSummary, type DocumentStatusView, type Language, type PolicyFactKey } from '@cover-check/shared';
import { AppError } from './errors.js';
import type { Deps, LeadCtx } from './deps.js';
import { MIN_CONFIDENCE } from '../integrations/extractor.js';
import { recomputeLeadState } from './leadStateService.js';

export const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic'] as const;
const MAX_PASSWORD_TRIES = 3;

export interface IncomingFile { originalName: string; mime: string; data: Buffer }

export const documentService = (d: Deps) => {
  const toView = async (docId: string, leadId: string): Promise<DocumentStatusView> => {
    const doc = await d.repos.documents.get(docId, leadId);
    if (!doc) throw new AppError('NOT_FOUND', 'File not found');
    const facts = await d.repos.documents.facts(docId);
    // Low-confidence facts are shown empty ("Please enter it"), never as a guess.
    const shown = facts.map((f) => (f.confidence !== null && f.confidence < MIN_CONFIDENCE && !f.userValue ? { ...f, value: null } : f));
    return { docId, status: doc.processing_status, failureReason: doc.failure_reason ?? undefined,
      needsPassword: doc.password_protected && doc.processing_status === 'queued', facts: shown };
  };

  const process = async (docId: string, leadId: string, password?: string) => {
    const doc = await d.repos.documents.get(docId, leadId);
    if (!doc) throw new AppError('NOT_FOUND', 'File not found');
    await d.repos.documents.setStatus(docId, 'reading');
    await d.repos.documents.logAccess(docId, 'system:extractor', 'read_file');
    const res = await d.extractor.extract({ data: await d.store.get(doc.file_ref), mime: doc.mime, password });
    if (!res.ok) {
      if (res.reason === 'password_required') return d.repos.documents.setStatus(docId, 'queued', { passwordProtected: true, extractorVersion: res.extractorVersion });
      if (res.reason === 'wrong_password') {
        const tries = await d.repos.documents.bumpPasswordAttempts(docId);
        const status = tries >= MAX_PASSWORD_TRIES ? 'failed' : 'queued';
        return d.repos.documents.setStatus(docId, status, { failure: status === 'failed' ? 'wrong_password' : undefined, passwordProtected: true });
      }
      return d.repos.documents.setStatus(docId, 'failed', { failure: res.reason, failedPage: res.failedPage, extractorVersion: res.extractorVersion });
    }
    const last4 = res.facts.find((f) => f.key === 'policy_number_last4')?.value as string | undefined;
    await d.tx(async (r) => {
      await r.documents.saveFacts(docId, res.facts);
      const needsReview = KEY_FACTS.some((k) => { const f = res.facts.find((x) => x.key === k); return !f || f.value === null || (f.confidence ?? 0) < MIN_CONFIDENCE; });
      await r.documents.setStatus(docId, needsReview ? 'needs_review' : 'ready', { extractorVersion: res.extractorVersion, pages: res.pages, last4 });
      const fresh = await r.documents.get(docId, leadId);
      if (fresh) await r.documents.supersedeDuplicates(fresh);
      await r.events.log({ name: 'extraction_ready', leadId, props: { docId, needsReview } });
    });
  };

  return {
    /** U1: separate, unticked consent for reading the document. */
    async consent(ctx: LeadCtx, language: Language) {
      const id = await d.repos.consents.grant({ leadId: ctx.leadId, purpose: 'read_document', noticeVersion: d.config.noticeVersion,
        noticeLanguage: language, method: 'tick', ip: ctx.ip, userAgent: ctx.userAgent });
      return { consentId: id };
    },

    /** U3: up to 3 files, 15 MB each. Bad files are rejected one by one; good ones are kept. */
    async upload(ctx: LeadCtx, files: IncomingFile[]) {
      const lead = await d.repos.leads.get(ctx.leadId);
      if (!lead?.mobile_verified) throw new AppError('OTP_REQUIRED', 'Verify your number first.');
      const consent = await d.repos.consents.isGranted(ctx.leadId, 'read_document');
      if (!consent) throw new AppError('CONSENT_REQUIRED', 'Allow us to read the document first.');
      if (!files.length) throw new AppError('FILE_REJECTED', 'Choose a file to upload.');
      if (files.length > d.config.maxFiles) throw new AppError('FILE_REJECTED', `Up to ${d.config.maxFiles} files at a time.`);
      await d.repos.events.log({ name: 'upload_started', leadId: ctx.leadId, props: { files: files.length } });

      const accepted: string[] = [];
      const rejected: { name: string; reason: string }[] = [];
      for (const f of files) {
        if (!ALLOWED_MIME.includes(f.mime as never)) { rejected.push({ name: f.originalName, reason: 'Only PDF, JPG, PNG or HEIC files.' }); continue; }
        if (f.data.length > d.config.maxFileMb * 1024 * 1024) { rejected.push({ name: f.originalName, reason: `Over ${d.config.maxFileMb} MB.` }); continue; }
        const fileRef = await d.store.put(`${ctx.leadId}/${randomUUID()}`, f.data);
        const doc = await d.repos.documents.insert({ leadId: ctx.leadId, consentId: consent.consent_id, fileRef, originalName: f.originalName.slice(0, 200),
          mime: f.mime, sizeBytes: f.data.length, contentSha256: createHash('sha256').update(f.data).digest('hex'), retentionDays: d.config.docRetentionDays });
        accepted.push(doc.doc_id);
        // Fire and forget: the UI polls; if it takes > 90 s the person is released and WhatsApp'd later.
        void process(doc.doc_id, ctx.leadId).catch((e) => d.repos.documents.setStatus(doc.doc_id, 'failed', { failure: 'other' }).finally(() => console.error(e)));
      }
      await d.repos.events.log({ name: 'upload_completed', leadId: ctx.leadId, props: { accepted: accepted.length, rejected: rejected.length } });
      return { accepted, rejected };
    },

    async submitPassword(ctx: LeadCtx, docId: string, password: string) {
      const doc = await d.repos.documents.get(docId, ctx.leadId);
      if (!doc) throw new AppError('NOT_FOUND', 'File not found');
      if (doc.password_attempts >= MAX_PASSWORD_TRIES) throw new AppError('PASSWORD_LOCKED', 'Too many tries. Upload an unlocked copy or talk to an advisor.');
      await process(docId, ctx.leadId, password); // password lives only for this call
      return toView(docId, ctx.leadId);
    },

    status: (ctx: LeadCtx, docId: string) => toView(docId, ctx.leadId),

    /** U5: "Looks right", with any edits. Both values are kept. */
    async confirm(ctx: LeadCtx, docId: string, edits: { key: PolicyFactKey; userValue: string | null }[]) {
      const doc = await d.repos.documents.get(docId, ctx.leadId);
      if (!doc) throw new AppError('NOT_FOUND', 'File not found');
      if (!['ready', 'needs_review'].includes(doc.processing_status)) throw new AppError('CONFLICT', 'We are still reading this file.');
      return d.tx(async (r) => {
        await r.documents.confirmFacts(docId, edits);
        await r.documents.setStatus(docId, 'ready');
        const summary = buildCoverSummary(docId, await r.documents.facts(docId), d.now());
        await r.findings.recordShown(ctx.leadId, { docId }, summary.points);
        await r.events.log({ name: 'facts_confirmed', leadId: ctx.leadId, props: { docId, edits: edits.length } });
        await recomputeLeadState(r, ctx.leadId);
        return summary;
      });
    },

    async summary(ctx: LeadCtx, docId: string): Promise<CoverSummary> {
      const doc = await d.repos.documents.get(docId, ctx.leadId);
      if (!doc) throw new AppError('NOT_FOUND', 'File not found');
      await d.repos.documents.logAccess(docId, 'lead', 'read_facts');
      await d.repos.events.log({ name: 'summary_viewed', leadId: ctx.leadId, props: { docId } });
      return buildCoverSummary(docId, await d.repos.documents.facts(docId), d.now());
    },
  };
};
export type DocumentService = ReturnType<typeof documentService>;
