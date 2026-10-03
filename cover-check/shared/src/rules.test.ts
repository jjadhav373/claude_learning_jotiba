import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReadout, callSlots, computePriority, deriveLeadState, isInsideCallWindow, isQuizCoreComplete, maskMobile,
  pruneAnswers, quizScreens, screenErrors, buildLeadCard, type QuizAnswers,
} from './index';

const priya: QuizAnswers = {
  situation: 'own', members: ['self', 'spouse', 'children'], children_count: 2, eldest_age: 36, sum_insured_band: 'unsure',
  policy_age_band: '3_5', health_condition: 'prefer_not', room_rent_limit: 'unsure', renewal_window: '1_3m',
};

describe('quiz config', () => {
  it('routes wording by path', () => {
    assert.equal(quizScreens('A')[1]!.title, 'Who do you want to cover?');
    assert.equal(quizScreens('B')[1]!.title, 'Who is covered today?');
    assert.deepEqual(quizScreens('C')[2]!.questions.map((q) => q.field), ['sum_insured_band', 'family_in_group_cover']);
  });
  it('requires eldest age and conditional children count', () => {
    const s2 = quizScreens('B')[1]!;
    assert.ok('eldest_age' in screenErrors(s2, { situation: 'own', members: ['children'] }));
    assert.ok('children_count' in screenErrors(s2, { situation: 'own', members: ['children'], eldest_age: 40 }));
    assert.deepEqual(screenErrors(s2, { situation: 'own', members: ['self'], eldest_age: 40 }), {});
    assert.ok('eldest_age' in screenErrors(s2, { situation: 'own', members: ['self'], eldest_age: 17 }));
  });
  it('treats Not sure as an answer and condition chips as optional', () => {
    const s4 = quizScreens('A')[3]!;
    assert.deepEqual(screenErrors(s4, { situation: 'none', health_condition: 'yes' }), {});
  });
  it('prunes answers from another path', () => {
    const a = pruneAnswers({ ...priya, situation: 'none', start_timing: 'this_month' });
    assert.equal(a.renewal_window, undefined);
    assert.equal(a.start_timing, 'this_month');
  });
  it('core completeness = S1–S3', () => {
    assert.equal(isQuizCoreComplete(priya), true);
    assert.equal(isQuizCoreComplete({ situation: 'own', members: ['self'] }), false);
  });
});

describe('readout rules', () => {
  it('fires R1 and R7 for the spec example', () => {
    assert.deepEqual(buildReadout(priya).check.map((f) => f.ruleId), ['R1', 'R7']);
  });
  it('R4 + R5 for company cover without family or personal policy, R8 for other not sure', () => {
    const ids = buildReadout({ situation: 'group', members: ['self'], eldest_age: 30, sum_insured_band: '3_5',
      family_in_group_cover: 'only_me', job_exit_cover: 'unsure', room_rent_limit: 'no_limit', personal_policy_besides_group: 'no' })
      .check.map((f) => f.ruleId);
    assert.deepEqual(ids, ['R4', 'R5', 'R8']);
  });
  it('R6 for parents over 60', () => {
    assert.equal(buildReadout({ situation: 'none', members: ['parents'], parents_age_band: '70p', eldest_age: 72 }).check[0]!.ruleId, 'R6');
  });
  it('never says anything about unknown answers in What you know', () => {
    assert.doesNotMatch(buildReadout(priya).know.join(' '), /not sure/i);
  });
});

describe('hand-off', () => {
  it('derives the four lead states', () => {
    assert.equal(deriveLeadState({ completed: false, requestedAction: null, contactConsent: false }), 'incomplete');
    assert.equal(deriveLeadState({ completed: true, requestedAction: 'summary_only', contactConsent: false }), 'data_only');
    assert.equal(deriveLeadState({ completed: true, requestedAction: 'summary_only', contactConsent: true }), 'consented_warm');
    assert.equal(deriveLeadState({ completed: true, requestedAction: 'advisor_call', contactConsent: true }), 'hand_raised');
    assert.equal(deriveLeadState({ completed: true, requestedAction: 'advisor_call', contactConsent: false }), 'data_only');
  });
  it('prioritises P1–P4', () => {
    assert.equal(computePriority({ leadState: 'hand_raised', answers: { renewal_window: 'lt1m' }, reviewPoints: 0 }), 'P1');
    assert.equal(computePriority({ leadState: 'hand_raised', answers: { situation: 'none', start_timing: 'this_month' }, reviewPoints: 0 }), 'P1');
    assert.equal(computePriority({ leadState: 'hand_raised', answers: priya, reviewPoints: 0 }), 'P2');
    assert.equal(computePriority({ leadState: 'consented_warm', answers: priya, reviewPoints: 0 }), 'P3');
    assert.equal(computePriority({ leadState: 'consented_warm', answers: { situation: 'own' }, reviewPoints: 1 }), 'P4');
    assert.equal(computePriority({ leadState: 'data_only', answers: priya, reviewPoints: 5 }), null);
  });
  it('offers only future slots inside 9am–9pm IST', () => {
    const now = new Date('2026-10-03T06:22:00Z'); // 11:52 IST
    const slots = callSlots(now);
    assert.equal(slots[0]!.label, '1 pm – 3 pm');
    assert.equal(slots.filter((s) => s.day === 'tomorrow').length, 6);
    for (const s of slots) assert.equal(isInsideCallWindow(s.start, s.end), true);
    assert.equal(isInsideCallWindow('2026-10-03T16:30:00Z', '2026-10-03T18:30:00Z'), false); // 10pm IST
  });
});

describe('util + card', () => {
  it('masks mobile in spec format', () => assert.equal(maskMobile('+919812345214'), '+91 98••• ••214'));
  it('builds a card that only restates answers', () => {
    const c = buildLeadCard({ leadId: 'x', firstName: 'Priya', pincode: '411001', city: 'Pune', state: 'Maharashtra', mobileVerified: true,
      leadState: 'hand_raised', priority: 'P2', answers: priya, findings: buildReadout(priya).check, handoff: null,
      upload: { status: 'none' }, contactConsentTs: '2026-10-03T06:22:00Z', noticeVersion: 'v1' });
    assert.ok(c.situationLine.includes('Has own policy'));
    assert.deepEqual(c.toldThem.map((t) => t.ruleId), ['R1', 'R7']);
    assert.ok(c.consentLine.includes('3 Oct'));
    assert.ok(c.openingScript.includes('Priya'));
  });
});
