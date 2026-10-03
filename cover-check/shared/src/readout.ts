/**
 * S7 readout. Fixed rule set R1–R8 (draft copy — compliance to approve).
 * No score, no insurer ranking, no advice to replace a policy, no claim prediction.
 */
import type { AnswerField, Finding, QuizAnswers, Readout } from './types';
import type { FindingCategory, Severity } from './enums';
import { UNSURE_FIELDS } from './quiz';

export const RULE_VERSION = 'v1-2026-10-03';

export interface ReadoutRule {
  id: string;
  category: FindingCategory;
  severity: Severity;
  text: string;
  short: string; // label used on the telecaller card
  when: (a: QuizAnswers) => boolean;
}

const parentsOver60 = (a: QuizAnswers) =>
  (a.members ?? []).includes('parents') && (a.parents_age_band === '60_70' || a.parents_age_band === '70p');

export const READOUT_RULES: ReadoutRule[] = [
  { id: 'R1', category: 'room_rent', severity: 'review', short: 'room rent',
    when: (a) => a.room_rent_limit === 'limit' || a.room_rent_limit === 'unsure',
    text: 'Some policies limit room rent, and that can reduce what is paid on the whole bill, not only the room. Check the room rent line in your policy.' },
  { id: 'R2', category: 'renewal', severity: 'review', short: 'renewal close',
    when: (a) => a.renewal_window === 'lt1m',
    text: 'Your renewal is close. It is a good time to read what changed since last year.' },
  { id: 'R3', category: 'waiting', severity: 'ask', short: 'waiting period',
    when: (a) => a.health_condition === 'yes',
    text: 'Existing conditions usually have a waiting period before they are covered. Check yours.' },
  { id: 'R4', category: 'other', severity: 'review', short: 'cover ends with job',
    when: (a) => a.situation === 'group' && a.personal_policy_besides_group === 'no',
    text: 'Company cover usually ends when the job does. Check what you would have after that.' },
  { id: 'R5', category: 'family', severity: 'ask', short: 'family not in group cover',
    when: (a) => a.situation === 'group' && a.family_in_group_cover === 'only_me',
    text: 'Your family may not be covered under your company policy. Check who is.' },
  { id: 'R6', category: 'waiting', severity: 'ask', short: 'parents over 60',
    when: parentsOver60,
    text: 'Cover for parents above 60 can have different waiting periods and limits. Check these.' },
  { id: 'R7', category: 'sum_insured', severity: 'ask', short: 'not sure on amount',
    when: (a) => a.sum_insured_band === 'unsure',
    text: 'Not knowing your cover amount is common. It is printed on your policy schedule.' },
];

/** Fields R1/R7 already explain; every other "Not sure" becomes an R8 line. */
const COVERED_BY_RULE: AnswerField[] = ['room_rent_limit', 'sum_insured_band'];

export const FIELD_PLAIN_NAME: Partial<Record<AnswerField, string>> = {
  family_in_group_cover: 'whether your family is in your company cover',
  policy_age_band: 'how long you have had your policy',
  job_exit_cover: 'what cover you would have after leaving your job',
  renewal_window: 'when your policy renews',
};

export function evaluateRules(a: QuizAnswers): Finding[] {
  const out: Finding[] = READOUT_RULES.filter((r) => r.when(a)).map((r) => ({
    ruleId: r.id, ruleVersion: RULE_VERSION, category: r.category, severity: r.severity, text: r.text,
  }));
  for (const f of UNSURE_FIELDS) {
    if (COVERED_BY_RULE.includes(f) || a[f] !== 'unsure') continue;
    out.push({
      ruleId: 'R8', ruleVersion: RULE_VERSION, category: f === 'renewal_window' ? 'renewal' : f === 'family_in_group_cover' ? 'family' : 'other',
      severity: 'ask', field: f,
      text: `You marked ${FIELD_PLAIN_NAME[f] ?? 'this'} as not sure. It is worth finding out.`,
    });
  }
  return out;
}

const MEMBER_LABEL: Record<string, string> = {
  self: 'you', spouse: 'your spouse', children: 'children', parents: 'your parents', parents_in_law: 'your parents-in-law',
};
export const SUM_LABEL: Record<string, string> = {
  lt3: 'under ₹3 L', '3_5': '₹3–5 L', '5_10': '₹5–10 L', '10_25': '₹10–25 L', '25p': '₹25 L or more', unsure: 'not sure',
};
const POLICY_AGE_LABEL: Record<string, string> = { lt1: 'under a year', '1_3': '1 to 3 years', '3_5': '3 to 5 years', '5p': 'more than 5 years' };
const RENEWAL_LABEL: Record<string, string> = { lt1m: 'within a month', '1_3m': 'in 1 to 3 months', '3_12m': 'in 3 to 12 months' };
const CONCERN_LABEL: Record<string, string> = {
  bills: 'hospital bills', parents: "your parents' health", serious_illness: 'a serious illness', savings: 'savings running out', other: 'something else',
};
const START_LABEL: Record<string, string> = { this_month: 'this month', '1_3m': 'in 1 to 3 months', exploring: 'no fixed date — you are exploring' };

const MEMBER_LABEL_3P: Record<string, string> = { self: 'self', spouse: 'spouse', children: 'children', parents: 'parents', parents_in_law: 'parents-in-law' };

/** voice "you" for the person's readout, "card" for the telecaller's third-person card. */
export function listMembers(a: QuizAnswers, voice: 'you' | 'card' = 'you'): string {
  const labels = voice === 'you' ? MEMBER_LABEL : MEMBER_LABEL_3P;
  const parts = (a.members ?? []).map((m) =>
    m === 'children' && a.children_count ? `${a.children_count} ${a.children_count === 1 ? 'child' : 'children'}` : labels[m] ?? m);
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** "What you know" column — only answers that are known, restated plainly. */
export function knowLines(a: QuizAnswers): string[] {
  const out: string[] = [];
  const A = a.situation === 'none', C = a.situation === 'group';
  if (a.members?.length) out.push(`${A ? 'You want to cover' : 'Covered today:'} ${listMembers(a)}${a.eldest_age ? `. Eldest is ${a.eldest_age}.` : '.'}`);
  if (a.sum_insured_band && a.sum_insured_band !== 'unsure')
    out.push(A ? `You would like cover of ${SUM_LABEL[a.sum_insured_band]}.` : `${C ? 'Your company covers' : 'Your cover is'} ${SUM_LABEL[a.sum_insured_band]}.`);
  if (a.family_in_group_cover === 'yes') out.push('Your family is included in your company cover.');
  if (a.policy_age_band && a.policy_age_band !== 'unsure') out.push(`You have had this policy for ${POLICY_AGE_LABEL[a.policy_age_band]}.`);
  if (a.job_exit_cover === 'own_policy') out.push('You have your own policy if you leave your job.');
  if (a.room_rent_limit === 'no_limit') out.push('Your policy has no room rent limit.');
  if (a.renewal_window && a.renewal_window !== 'unsure') out.push(`Your policy renews ${RENEWAL_LABEL[a.renewal_window]}.`);
  if (a.personal_policy_besides_group === 'yes') out.push('You have a personal policy besides your company cover.');
  if (a.top_concern) out.push(`What worries you most: ${CONCERN_LABEL[a.top_concern]}.`);
  if (a.start_timing) out.push(`You want cover to start ${START_LABEL[a.start_timing]}.`);
  return out;
}

export function buildReadout(a: QuizAnswers): Readout {
  return { know: knowLines(a), check: evaluateRules(a) };
}

export const ruleShortLabel = (ruleId: string, field?: AnswerField) =>
  ruleId === 'R8' ? `not sure: ${field ? FIELD_PLAIN_NAME[field]?.replace(/^(whether |how long |what |when )/, '') ?? field : 'other'}`
    : READOUT_RULES.find((r) => r.id === ruleId)?.short ?? ruleId;

export { RENEWAL_LABEL, POLICY_AGE_LABEL };
