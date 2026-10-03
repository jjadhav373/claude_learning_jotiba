/**
 * End-to-end service test against Postgres: the "Priya" example from the spec.
 * Prereq: createdb cover_check_test && DATABASE_URL=… npm run db:migrate (pointing at the test DB).
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { callSlots } from '@cover-check/shared';
import { journeyService } from '../src/services/journeyService.js';
import { otpService } from '../src/services/otpService.js';
import { handoffService } from '../src/services/handoffService.js';
import { documentService } from '../src/services/documentService.js';
import { AppError } from '../src/services/errors.js';
import { parseCsv, telecallerSheetService } from '../src/services/telecallerSheetService.js';
import { testDeps, waitFor } from './helpers.js';

let clock = new Date('2026-10-03T06:22:00Z'); // 11:52 IST, as in the spec's consent example
const { deps, pool, sent, otps } = testDeps(() => clock);
const journey = journeyService(deps), otp = otpService(deps), handoff = handoffService(deps), docs = documentService(deps);
const mobile = `+9198${String(Date.now()).slice(-8)}`;

describe('Cover Check — Priya end to end', () => {
  let ctx: { leadId: string; sourceId: string | null };
  let sessionId = '';

  before(async () => {
    const token = deps.tokens.issue({ m: mobile, d: 'check', c: 'coverfest', t: 'cover_fest_utility_v1' }, clock.getTime());
    const boot = await journey.openLink(token, { type: 'mobile', os: 'android' });
    assert.equal(boot.door, 'check');
    assert.match(boot.maskedMobile, /^\+91 98••• ••\d{3}$/);
    assert.equal(boot.sessionId, null);
    ctx = { leadId: boot.leadId, sourceId: boot.sourceId };
  });
  after(() => pool.end());

  it('rejects a tampered link', () => {
    const t = deps.tokens.issue({ m: mobile, d: 'check' });
    assert.throws(() => deps.tokens.verify(t.slice(0, -2) + 'xx'), AppError);
  });

  it('runs the quiz on path B and validates on the server', async () => {
    sessionId = (await journey.startQuiz(ctx, 'en')).sessionId;
    await journey.saveScreen(ctx, sessionId, 'S1', { situation: 'own' }, 3000);
    await assert.rejects(journey.saveScreen(ctx, sessionId, 'S2', { members: ['self', 'spouse', 'children'] }, 9000), /missing/);
    await journey.saveScreen(ctx, sessionId, 'S2', { members: ['self', 'spouse', 'children'], eldest_age: 36, children_count: 2 }, 11000);
    await journey.saveScreen(ctx, sessionId, 'S3', { sum_insured_band: 'unsure' }, 5000);
    await journey.saveScreen(ctx, sessionId, 'S4', { policy_age_band: '3_5', health_condition: 'prefer_not' }, 7000);
    await journey.saveScreen(ctx, sessionId, 'S5', { room_rent_limit: 'unsure' }, 5000);
    const last = await journey.saveScreen(ctx, sessionId, 'S6', { renewal_window: '1_3m' }, 4000);
    assert.equal(last.next, 'S7');
  });

  it('shows the readout R1 + R7 and records what was shown', async () => {
    const r = await journey.completeQuiz(ctx, sessionId);
    assert.deepEqual(r.check.map((c) => c.ruleId), ['R1', 'R7']);
    const f = await deps.repos.findings.forLead(ctx.leadId);
    assert.equal(f.length, 2);
  });

  it('capture saves, sends the WhatsApp summary, and never queues a call', async () => {
    const res = await journey.capture(ctx, { firstName: 'Priya', pincode: '411001', mobileConfirmed: true, language: 'en' });
    assert.equal(res.city, 'Pune');
    assert.equal(sent.length, 1);
    const lead = await deps.repos.leads.get(ctx.leadId);
    assert.equal(lead!.lead_state, 'data_only');
    assert.equal((await handoff.queue(null)).filter((q: any) => q.lead_id === ctx.leadId).length, 0);
  });

  it('a call needs consent, then OTP', async () => {
    clock = new Date('2026-10-03T06:23:00Z');
    const slot = callSlots(clock).find((s) => s.label === '5 pm – 7 pm' && s.day === 'today')!;
    const req = { requestedAction: 'advisor_call' as const, slotStart: slot.start, slotEnd: slot.end, callLanguage: 'hi' as const,
      topic: 'renewal' as const, note: 'Premium badh gaya hai.' };
    await assert.rejects(handoff.request(ctx, { ...req, contactConsent: false }, 'en'), (e: AppError) => e.code === 'CONSENT_REQUIRED');
    await assert.rejects(handoff.request(ctx, { ...req, contactConsent: true }, 'en'), (e: AppError) => e.code === 'OTP_REQUIRED');

    await otp.send(ctx, 'call');
    await assert.rejects(otp.verify(ctx, '000000'.replace(/./g, (_c, i) => String((Number(otps[0]![i]) + 1) % 10))), (e: AppError) => e.code === 'OTP_INVALID');
    await otp.verify(ctx, otps[0]!);

    const out = await handoff.request(ctx, { ...req, contactConsent: true }, 'en');
    assert.equal(out.leadState, 'hand_raised');
    assert.equal(out.priority, 'P2');
    assert.equal(out.queued, true);
  });

  it('the telecaller card restates only what Priya told us', async () => {
    const card = await handoff.card(ctx.leadId, 'Rohan');
    assert.equal(card.firstName, 'Priya');
    assert.equal(card.priority, 'P2');
    assert.match(card.situationLine, /Has own policy/);
    assert.match(card.quizLine, /Room rent limit: not sure/);
    assert.deepEqual(card.toldThem.map((t) => t.ruleId), ['R1', 'R7']);
    assert.match(card.consentLine, /3 Oct/);
    assert.match(card.openingScript, /Rohan from Turtlemint/);
  });

  it('policy upload: consent, read, confirm, summary', async () => {
    await assert.rejects(docs.upload(ctx, [{ originalName: 'p.pdf', mime: 'application/pdf', data: Buffer.from('%PDF health') }]),
      (e: AppError) => e.code === 'CONSENT_REQUIRED');
    await docs.consent(ctx, 'en');
    const up = await docs.upload(ctx, [
      { originalName: 'schedule.pdf', mime: 'application/pdf', data: Buffer.from('%PDF-1.7 health policy schedule') },
      { originalName: 'notes.docx', mime: 'application/msword', data: Buffer.from('x') },
    ]);
    assert.equal(up.accepted.length, 1);
    assert.equal(up.rejected.length, 1);
    const docId = up.accepted[0]!;
    await waitFor(async () => ['ready', 'needs_review'].includes((await docs.status(ctx, docId)).status));
    const view = await docs.status(ctx, docId);
    assert.equal(view.facts.find((f) => f.key === 'no_claim_bonus')!.value, null, 'low confidence is shown empty');
    const summary = await docs.confirm(ctx, docId, [{ key: 'no_claim_bonus', userValue: '10% a year' }]);
    assert.ok(summary.points.some((p) => p.ruleId === 'D1'));
    assert.ok(summary.sections.find((s) => s.id === 'covered')!.lines.some((l) => !l.found), 'restoration not found is said plainly');
  });

  it('telecaller sheet: exports only callable leads, once, and reads outcomes back', async () => {
    const sheet = telecallerSheetService(deps);
    const first = await sheet.exportCsv();
    const rows = parseCsv(first.csv);
    const mine = rows.filter((r) => r.includes(ctx.leadId));
    assert.equal(mine.length, 1, 'Priya is in the sheet once');
    const head = rows[0]!;
    const row = mine[0]!;
    assert.equal(row[head.indexOf('Name')], 'Priya');
    assert.match(row[head.indexOf('Mobile')]!, /^\+91 \d{5} \d{5}$/);
    assert.equal(row[head.indexOf('Priority')], 'P2');
    assert.match(row[head.indexOf('Their note')]!, /Premium badh gaya hai/);

    const again = await sheet.exportCsv();
    assert.equal(parseCsv(again.csv).filter((r) => r.includes(ctx.leadId)).length, 0, 'not handed out twice');

    // telecaller fills the outcome columns
    row[head.indexOf('Connected (Y/N)')] = 'Y';
    row[head.indexOf('Call minutes')] = '4';
    row[head.indexOf('Disposition')] = 'Call back later';
    row[head.indexOf('Agent notes')] = 'Wants to compare after renewal notice, "call Monday"';
    row[head.indexOf('Agent name')] = 'Rohan';
    const filled = [head, row].map((r) => r.map((c) => (/[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\r\n');
    const res = await sheet.importCsv(filled);
    assert.equal(res.recorded, 1);
    const twice = await sheet.importCsv(filled);
    assert.equal(twice.recorded, 0, 'same file twice does not double-record');
    const bad = await sheet.importCsv(filled.replace('Call back later', 'maybe'));
    assert.match(bad.skipped[0]!.reason, /Disposition/);
  });

  it('withdrawal removes the lead from the queue at once', async () => {
    await journey.withdraw(ctx.leadId, 'page');
    assert.equal((await handoff.queue(null)).filter((q: any) => q.lead_id === ctx.leadId).length, 0);
    const lead = await deps.repos.leads.get(ctx.leadId);
    assert.equal(lead!.do_not_contact, true);
  });
});
