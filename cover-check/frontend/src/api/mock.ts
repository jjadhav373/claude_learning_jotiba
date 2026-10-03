/**
 * In-browser stand-in for the backend, used by the prototype build. It runs the same shared rules
 * (quiz validation, readout, priority, lead card, cover summary) so the prototype behaves like the real flow.
 * Nothing leaves the browser.
 */
import {
  buildCoverSummary, buildLeadCard, buildReadout, callSlots, computePriority, deriveLeadState, isFirstName, isInsideCallWindow,
  isPincode, isQuizCoreComplete, maskMobile, pruneAnswers, screenErrors, screensForAnswers, FACT_LABEL, KEY_FACTS,
  PINCODE_PREFIX_DEMO, type CoverSummary, type Door, type DocumentStatusView, type EventName, type Finding, type HandoffInput,
  type Language, type LeadCard, type PolicyFactView, type QuizAnswers, type ScreenId,
} from '@cover-check/shared';
import type { AgentApi, ApiError, CoverCheckApi } from './types';

export class MockError extends Error { constructor(readonly body: ApiError) { super(body.message); } }
const fail = (code: string, message: string, details?: unknown): never => { throw new MockError({ code, message, details }); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const DEMO_OTP = '123456';

interface Doc { id: string; name: string; status: DocumentStatusView['status']; failure?: DocumentStatusView['failureReason']; locked: boolean; tries: number; facts: PolicyFactView[] }
export interface MockState {
  door: Door;
  mobile: string;
  mobileVerified: boolean;
  language: Language;
  sessionId: string | null;
  answers: QuizAnswers;
  findings: Finding[];
  firstName: string | null; pincode: string | null; city: string | null; state: string | null; captured: boolean;
  handoff: (HandoffInput & { at: string }) | null;
  consents: { purpose: string; granted: boolean; at: string }[];
  docs: Doc[];
  events: { name: EventName; screenId?: ScreenId; at: string }[];
  withdrawn: boolean;
}

const DEMO_FACTS: Omit<PolicyFactView, 'label' | 'userConfirmed' | 'userValue'>[] = [
  { key: 'insurer_name', value: 'Example General Insurance', sourcePage: 1, confidence: 0.98 },
  { key: 'product_name', value: 'Family Health Optima', sourcePage: 1, confidence: 0.95 },
  { key: 'policy_type', value: 'floater', sourcePage: 1, confidence: 0.93 },
  { key: 'sum_insured_inr', value: '500000', sourcePage: 1, confidence: 0.97 },
  { key: 'members', value: 'Self (36), Spouse (34), 2 children', sourcePage: 2, confidence: 0.9 },
  { key: 'start_date', value: '2025-11-20', sourcePage: 1, confidence: 0.96 },
  { key: 'end_date', value: '2026-11-19', sourcePage: 1, confidence: 0.96 },
  { key: 'room_rent_limit', value: '1% of sum insured per day', sourcePage: 3, confidence: 0.86 },
  { key: 'copay_percent', value: '0', sourcePage: 3, confidence: 0.82 },
  { key: 'ped_waiting_months', value: '36', sourcePage: 3, confidence: 0.91 },
  { key: 'specific_waiting_months', value: '24', sourcePage: 3, confidence: 0.88 },
  { key: 'initial_waiting_days', value: '30', sourcePage: 3, confidence: 0.92 },
  { key: 'restoration', value: null, sourcePage: null, confidence: null },
  { key: 'no_claim_bonus', value: '10% a year, up to 50%', sourcePage: 4, confidence: 0.7 },
];

export function createMockBackend(init: { door: Door; mobile?: string }) {
  const listeners = new Set<() => void>();
  const fresh = (): MockState => ({
    door: init.door, mobile: init.mobile ?? '+919812345214', mobileVerified: false, language: 'en', sessionId: null, answers: {},
    findings: [], firstName: null, pincode: null, city: null, state: null, captured: false, handoff: null, consents: [], docs: [],
    events: [], withdrawn: false,
  });
  let s = fresh();
  let lastOtpAt = 0, otpTries = 0;
  const emit = () => listeners.forEach((l) => l());
  const now = () => new Date();
  const log = (name: EventName, screenId?: ScreenId) => { s.events = [...s.events, { name, screenId, at: now().toISOString() }].slice(-40); emit(); };
  const consent = (purpose: string, granted = true) => { s.consents = [...s.consents, { purpose, granted, at: now().toISOString() }]; };
  const granted = (purpose: string) => { const last = [...s.consents].reverse().find((c) => c.purpose === purpose); return !!last?.granted; };

  const leadState = () => {
    const docConfirmed = s.docs.some((d) => d.facts.length && d.facts.every((f) => f.userConfirmed));
    const completed = (s.captured && isQuizCoreComplete(s.answers)) || docConfirmed;
    return deriveLeadState({ completed, requestedAction: s.handoff?.requestedAction ?? null, contactConsent: granted('contact_call') && !s.withdrawn });
  };
  const priority = () => computePriority({ leadState: leadState(), answers: s.answers, reviewPoints: s.findings.filter((f) => f.severity === 'review').length });

  const docView = (d: Doc): DocumentStatusView => ({
    docId: d.id, status: d.status, failureReason: d.failure, needsPassword: d.locked && d.status === 'queued',
    facts: d.facts.map((f) => (f.confidence !== null && f.confidence < 0.8 && !f.userValue ? { ...f, value: null } : f)),
  });
  const readDoc = async (d: Doc) => {
    d.status = 'reading'; emit();
    await wait(2600);
    const n = d.name.toLowerCase();
    if (/blur/.test(n)) { d.status = 'failed'; d.failure = 'unreadable'; emit(); return; }
    if (/motor|car|bike|life|travel/.test(n)) { d.status = 'failed'; d.failure = 'not_health'; emit(); return; }
    d.facts = DEMO_FACTS.map((f) => ({ ...f, label: FACT_LABEL[f.key], userConfirmed: false, userValue: null }));
    d.status = KEY_FACTS.every((k) => { const f = d.facts.find((x) => x.key === k); return f?.value && (f.confidence ?? 0) >= 0.8; }) ? 'ready' : 'needs_review';
    log('extraction_ready');
  };

  const api: CoverCheckApi = {
    async bootstrap() {
      await wait(150);
      log('link_clicked');
      return { leadId: 'demo-lead', sessionId: s.sessionId, door: s.door, maskedMobile: maskMobile(s.mobile), mobileVerified: s.mobileVerified,
        language: s.language, firstName: s.firstName ?? undefined, answers: s.answers, noticeVersion: 'v1', slots: callSlots(now()) };
    },
    event: (name, screenId) => log(name, screenId),
    async startQuiz(language) {
      if (!s.sessionId) { consent('save_answers'); s.sessionId = `sess-${Date.now()}`; s.language = language; log('quiz_started', 'S1'); }
      return { sessionId: s.sessionId };
    },
    async saveScreen(_id, screenId, patch) {
      await wait(120);
      const merged = pruneAnswers({ ...s.answers, ...patch });
      const screen = screensForAnswers(merged).find((x) => x.id === screenId);
      if (!screen) fail('VALIDATION', 'Unknown screen');
      const errors = screenErrors(screen!, merged);
      if (Object.keys(errors).length) fail('VALIDATION', 'Some answers are missing', errors);
      s.answers = merged; log('answer_submitted', screenId);
      const list = screensForAnswers(merged);
      return { answers: merged, next: list[list.findIndex((x) => x.id === screenId) + 1]?.id ?? 'S7' };
    },
    async completeQuiz() {
      await wait(300);
      const r = buildReadout(s.answers);
      s.findings = [...s.findings.filter((f) => !f.ruleId.startsWith('R')), ...r.check];
      log('quiz_completed'); log('readout_viewed', 'S7');
      return r;
    },
    readoutDwell: () => undefined,
    async pincode(pin) {
      if (!isPincode(pin)) fail('VALIDATION', 'Enter a 6 digit pincode');
      const hit = PINCODE_PREFIX_DEMO[pin.slice(0, 3)];
      return hit ? { city: hit[0], state: hit[1] } : { city: null, state: null };
    },
    async capture(input) {
      await wait(500);
      const errors: Record<string, string> = {};
      if (!isFirstName(input.firstName)) errors.firstName = 'Enter your first name (2 to 40 letters)';
      if (!isPincode(input.pincode)) errors.pincode = 'Enter a 6 digit pincode';
      if (Object.keys(errors).length) fail('VALIDATION', 'Please check the highlighted fields', errors);
      const place = await api.pincode(input.pincode);
      if (input.newMobile) { s.mobile = input.newMobile; s.mobileVerified = false; }
      Object.assign(s, { firstName: input.firstName.trim(), pincode: input.pincode, city: place.city, state: place.state, captured: true, language: input.language ?? s.language });
      consent('whatsapp_summary'); log('capture_submitted', 'S8'); log('summary_sent');
      return { ...place, maskedMobile: maskMobile(s.mobile), summarySentAt: now().toISOString() };
    },
    async sendOtp() {
      if (Date.now() - lastOtpAt < 30_000) fail('OTP_TOO_SOON', 'Please wait a few seconds before asking for a new code.');
      lastOtpAt = Date.now(); otpTries = 0; log('otp_sent');
      return { resendAfterSec: 30, attemptsLeft: 3 };
    },
    async verifyOtp(code) {
      await wait(400);
      if (otpTries >= 3) fail('OTP_LOCKED', 'Too many tries. Ask for a new code.');
      otpTries++;
      if (code !== DEMO_OTP) fail('OTP_INVALID', 'That code is not right.', { attemptsLeft: 3 - otpTries });
      s.mobileVerified = true; log('otp_verified');
      return { verified: true };
    },
    slots: async () => callSlots(now()),
    async handoff(h) {
      await wait(400);
      const call = h.requestedAction === 'advisor_call' || h.requestedAction === 'callback';
      if (call && !h.contactConsent) fail('CONSENT_REQUIRED', 'Tick the box so we are allowed to call you.');
      if (call && (!h.slotStart || !h.slotEnd || !isInsideCallWindow(h.slotStart, h.slotEnd))) fail('OUTSIDE_CALL_HOURS', 'Pick a time inside calling hours.');
      if (call && !s.mobileVerified) fail('OTP_REQUIRED', 'Verify your number first.');
      if (h.contactConsent) { consent('contact_call'); s.withdrawn = false; }
      s.handoff = { ...h, at: now().toISOString() };
      log('next_action_selected', 'S9'); if (call) log('call_requested');
      const st = leadState();
      return { leadState: st, priority: priority(), queued: st === 'hand_raised' || st === 'consented_warm' };
    },
    async withdraw() { consent('contact_call', false); consent('whatsapp_summary', false); s.withdrawn = true; log('consent_withdrawn'); },
    async docConsent() { consent('read_document'); emit(); },
    async uploadDocs(files) {
      if (!s.mobileVerified) fail('OTP_REQUIRED', 'Verify your number first.');
      if (!granted('read_document')) fail('CONSENT_REQUIRED', 'Allow us to read the document first.');
      log('upload_started');
      const accepted: string[] = [], rejected: { name: string; reason: string }[] = [];
      for (const f of files.slice(0, 3)) {
        const okType = /pdf|jpe?g|png|heic/i.test(f.type || f.name);
        if (!okType) { rejected.push({ name: f.name, reason: 'Only PDF, JPG, PNG or HEIC files.' }); continue; }
        if (f.size > 15 * 1024 * 1024) { rejected.push({ name: f.name, reason: 'Over 15 MB.' }); continue; }
        const d: Doc = { id: `doc-${Date.now()}-${accepted.length}`, name: f.name, status: 'queued', locked: /lock/i.test(f.name), tries: 0, facts: [] };
        s.docs = [...s.docs, d]; accepted.push(d.id);
        if (!d.locked) void readDoc(d);
      }
      log('upload_completed');
      return { accepted, rejected };
    },
    async docPassword(id, pw) {
      const d = s.docs.find((x) => x.id === id) ?? fail('NOT_FOUND', 'File not found');
      if (d.tries >= 3) fail('PASSWORD_LOCKED', 'Too many tries. Upload an unlocked copy or talk to an advisor.');
      d.tries++;
      if (pw.length < 4) { if (d.tries >= 3) { d.status = 'failed'; d.failure = 'wrong_password'; } emit(); return docView(d); }
      d.locked = false; void readDoc(d);
      return docView(d);
    },
    async docStatus(id) { return docView(s.docs.find((x) => x.id === id) ?? fail('NOT_FOUND', 'File not found')); },
    async confirmFacts(id, edits) {
      await wait(400);
      const d = s.docs.find((x) => x.id === id) ?? fail('NOT_FOUND', 'File not found');
      d.facts = d.facts.map((f) => ({ ...f, userConfirmed: true, userValue: edits.find((e) => e.key === f.key)?.userValue ?? f.userValue }));
      for (const e of edits) if (!d.facts.some((f) => f.key === e.key))
        d.facts.push({ key: e.key, label: FACT_LABEL[e.key], value: null, sourcePage: null, confidence: null, userConfirmed: true, userValue: e.userValue });
      d.status = 'ready';
      const summary = buildCoverSummary(id, d.facts, now());
      s.findings = [...s.findings.filter((f) => !f.ruleId.startsWith('D')), ...summary.points];
      log('facts_confirmed');
      return summary;
    },
    async docSummary(id): Promise<CoverSummary> {
      const d = s.docs.find((x) => x.id === id) ?? fail('NOT_FOUND', 'File not found');
      log('summary_viewed');
      return buildCoverSummary(id, d.facts, now());
    },
  };

  const card = (agentName = 'Rohan'): LeadCard => {
    const doc = s.docs[s.docs.length - 1];
    const lastContact = [...s.consents].reverse().find((c) => c.purpose === 'contact_call' && c.granted);
    return buildLeadCard({
      leadId: 'demo-lead', firstName: s.firstName, pincode: s.pincode, city: s.city, state: s.state, mobileVerified: s.mobileVerified,
      leadState: leadState(), priority: priority(), answers: s.answers, findings: s.findings,
      handoff: s.handoff ? { action: s.handoff.requestedAction, slotStart: s.handoff.slotStart ?? null, slotEnd: s.handoff.slotEnd ?? null,
        callLanguage: s.handoff.callLanguage ?? null, topic: s.handoff.topic ?? null, note: s.handoff.note ?? null } : null,
      upload: { status: !doc ? 'none' : doc.status === 'ready' && doc.facts.every((f) => f.userConfirmed) ? 'ready' : doc.status === 'failed' ? 'failed' : 'processing',
        insurer: doc?.facts.find((f) => f.key === 'insurer_name')?.value, product: doc?.facts.find((f) => f.key === 'product_name')?.value },
      contactConsentTs: granted('contact_call') && !s.withdrawn ? lastContact?.at ?? null : null, noticeVersion: 'v1', agentName,
    });
  };

  const agent: AgentApi = { card: async () => card() };

  return {
    api, agent, card,
    get state() { return s; },
    leadState, priority,
    subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); },
    reset(door: Door = s.door) { s = { ...fresh(), door }; lastOtpAt = 0; emit(); },
    /** Prototype jump helpers: fill the spec's example so any screen can be opened directly. */
    seedQuiz(answers: QuizAnswers) {
      if (!s.sessionId) { consent('save_answers'); s.sessionId = `sess-${Date.now()}`; }
      s.answers = answers; s.findings = buildReadout(answers).check; emit();
      return { sessionId: s.sessionId, readout: buildReadout(answers) };
    },
    seedCapture() { Object.assign(s, { firstName: 'Priya', pincode: '411001', city: 'Pune', state: 'Maharashtra', captured: true }); consent('whatsapp_summary'); emit(); },
    seedDoc(): string {
      s.mobileVerified = true; consent('read_document');
      const d: Doc = { id: `doc-${Date.now()}`, name: 'policy-schedule.pdf', status: 'ready', locked: false, tries: 0,
        facts: DEMO_FACTS.map((f) => ({ ...f, label: FACT_LABEL[f.key], userConfirmed: false, userValue: null })) };
      s.docs = [...s.docs, d]; emit();
      return d.id;
    },
    setDoor(door: Door) { s = { ...s, door }; emit(); },
  };
}
export type MockBackend = ReturnType<typeof createMockBackend>;
