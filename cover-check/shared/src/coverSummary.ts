/**
 * Rung 2: turns confirmed policy facts into the plain-language summary (U6) and
 * points to review (U7). Facts that were not found are said to be not found — never guessed.
 */
import type { CoverSummary, CoverSummarySection, Finding, PolicyFactKey, PolicyFactView } from './types';
import { RULE_VERSION } from './readout';

export const FACT_LABEL: Record<PolicyFactKey, string> = {
  insurer_name: 'Insurer', product_name: 'Plan', policy_type: 'Policy type', policy_number_last4: 'Policy no. (last 4)',
  sum_insured_inr: 'Sum insured', premium_inr: 'Premium', members: 'Members covered', start_date: 'Start date',
  end_date: 'End date', renewal_date: 'Renewal date', room_rent_limit: 'Room rent limit', copay_percent: 'Co-pay',
  deductible_inr: 'Deductible', ped_waiting_months: 'Waiting period — existing conditions', specific_waiting_months: 'Waiting period — specific illnesses',
  initial_waiting_days: 'Initial waiting period', sublimits: 'Sub-limits', restoration: 'Restoration', no_claim_bonus: 'No claim bonus', riders: 'Add-ons',
};

/** Shown on U5 "Check what we read". */
export const KEY_FACTS: PolicyFactKey[] = ['insurer_name', 'product_name', 'policy_type', 'sum_insured_inr', 'members', 'start_date', 'end_date'];

const val = (facts: PolicyFactView[], k: PolicyFactKey) => {
  const f = facts.find((x) => x.key === k);
  return { v: f ? (f.userValue ?? f.value) : null, page: f?.sourcePage ?? null };
};
const line = (facts: PolicyFactView[], k: PolicyFactKey, render: (v: string) => string) => {
  const { v, page } = val(facts, k);
  return v ? { text: render(v), page, found: true } : { text: `${FACT_LABEL[k]}: Not found in your document.`, page: null, found: false };
};

export function buildCoverSummary(docId: string, facts: PolicyFactView[], today = new Date()): CoverSummary {
  const sections: CoverSummarySection[] = [
    { id: 'covered', title: 'What is covered', lines: [
      line(facts, 'sum_insured_inr', (v) => `Sum insured of ₹${Number(v).toLocaleString('en-IN')} a year${val(facts, 'policy_type').v === 'floater' ? ', shared by everyone on the policy' : ''}.`),
      line(facts, 'restoration', (v) => `Restoration: ${v}.`),
      line(facts, 'riders', (v) => `Add-ons: ${v}.`),
    ] },
    { id: 'who', title: 'Who is covered', lines: [line(facts, 'members', (v) => `${v}.`)] },
    { id: 'waiting', title: 'Conditions and waiting periods', lines: [
      line(facts, 'initial_waiting_days', (v) => `New illnesses are covered after ${v} days (accidents from day one, usually).`),
      line(facts, 'ped_waiting_months', (v) => `Conditions you had before buying are covered after ${v} months.`),
      line(facts, 'specific_waiting_months', (v) => `Some named illnesses and surgeries are covered after ${v} months.`),
    ] },
    { id: 'room_rent', title: 'Room rent and co-pay', lines: [
      line(facts, 'room_rent_limit', (v) => (/none|no limit/i.test(v) ? 'No room rent limit.' : `Room rent is limited to ${v}.`)),
      line(facts, 'copay_percent', (v) => (Number(v) === 0 ? 'No co-pay.' : `You pay ${v}% of each claim yourself (co-pay).`)),
    ] },
    { id: 'renewal', title: 'Renewal', lines: [
      line(facts, 'end_date', (v) => `Cover runs until ${v}. Renew before this date to keep waiting periods you have already served.`),
      line(facts, 'no_claim_bonus', (v) => `No claim bonus: ${v}.`),
    ] },
  ];

  const points: CoverSummary['points'] = [];
  const add = (f: Omit<Finding, 'ruleVersion'>, meaning: string, howWeHelp: string) =>
    points.push({ ...f, ruleVersion: RULE_VERSION, meaning, howWeHelp });

  const rr = val(facts, 'room_rent_limit');
  if (rr.v && !/none|no limit/i.test(rr.v))
    add({ ruleId: 'D1', category: 'room_rent', severity: 'review', text: `Room rent is limited to ${rr.v}.` },
      'If you choose a room above this limit, many policies reduce other parts of the bill in the same proportion.',
      'An expert can tell you which room category fits your limit in hospitals near you.');
  else if (!rr.v)
    add({ ruleId: 'D1', category: 'room_rent', severity: 'ask', text: 'We could not find a room rent line.' },
      'It may be in the policy wording rather than the schedule.', 'An expert can find it in the full wording with you.');

  const cp = val(facts, 'copay_percent');
  if (cp.v && Number(cp.v) > 0)
    add({ ruleId: 'D2', category: 'other', severity: 'review', text: `${cp.v}% co-pay on claims.` },
      `On a ₹1,00,000 bill you would pay about ₹${(Number(cp.v) * 1000).toLocaleString('en-IN')} yourself.`,
      'An expert can explain when the co-pay applies and when it does not.');

  const ped = val(facts, 'ped_waiting_months');
  if (ped.v && Number(ped.v) >= 36)
    add({ ruleId: 'D3', category: 'waiting', severity: 'ask', text: `Existing conditions wait ${ped.v} months.` },
      'Treatment for a condition you had before buying is not paid until this period is served.',
      'An expert can check how much of the waiting period you have already served.');

  const end = val(facts, 'end_date');
  if (end.v) {
    const days = Math.round((new Date(end.v).getTime() - today.getTime()) / 86_400_000);
    if (days >= 0 && days <= 45)
      add({ ruleId: 'D4', category: 'renewal', severity: 'review', text: `Renews in ${days} days.` },
        'Renewing on time keeps your waiting periods and no claim bonus.', 'An expert can walk you through what changes at renewal.');
  }

  const si = val(facts, 'sum_insured_inr');
  if (si.v && Number(si.v) >= 500_000)
    add({ ruleId: 'D5', category: 'sum_insured', severity: 'info', text: `Sum insured of ₹${Number(si.v).toLocaleString('en-IN')}.` },
      'This is the most the policy pays in a year across everyone covered.', 'An expert can help you judge it against hospital costs in your city.');

  return { docId, sections, points };
}
