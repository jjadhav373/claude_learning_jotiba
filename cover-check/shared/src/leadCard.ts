/**
 * Telecaller context card. Pure function over stored data so the backend (from Postgres)
 * and the prototype (from memory) render the exact same card.
 * Rule: open with what they told us and nothing they did not.
 */
import type { Language, LeadState, Priority, RequestedAction, Topic } from './enums';
import type { Finding, LeadCard, QuizAnswers } from './types';
import { listMembers, POLICY_AGE_LABEL, RENEWAL_LABEL, ruleShortLabel, SUM_LABEL } from './readout';

export interface LeadCardInput {
  leadId: string;
  firstName: string | null;
  pincode: string | null;
  city: string | null;
  state: string | null;
  mobileVerified: boolean;
  leadState: LeadState;
  priority: Priority | null;
  answers: QuizAnswers;
  findings: Finding[];
  handoff: {
    action: RequestedAction | null; slotStart: string | null; slotEnd: string | null;
    callLanguage: Language | null; topic: Topic | null; note: string | null;
  } | null;
  upload: { status: 'none' | 'processing' | 'ready' | 'failed'; insurer?: string | null; product?: string | null };
  contactConsentTs: string | null;
  noticeVersion: string | null;
  agentName?: string;
}

const SITUATION_LINE = { none: 'No cover yet', own: 'Has own policy', group: 'Company cover' } as const;
const LANG_NAME: Record<string, string> = { en: 'English', hi: 'Hindi', mr: 'Marathi' };
const TOPIC_NAME: Record<string, string> = { renewal: 'renewal', parents: "parents' cover", compare: 'comparing plans', claim: 'a claim question', other: 'something else' };
const ACTION_NAME: Record<string, string> = { advisor_call: 'Advisor call', callback: 'Callback', see_plans: 'See plans', summary_only: 'Summary only', upload_policy: 'Policy upload' };

const fmtIst = (iso: string, withDay = true) =>
  new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', ...(withDay ? { day: 'numeric', month: 'short' } : {}), hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(/\s?([ap])\.?m\.?/i, (_m, p) => ` ${String(p).toLowerCase()}m`);

export function buildLeadCard(i: LeadCardInput): LeadCard {
  const a = i.answers;
  const situationParts = [
    a.situation ? SITUATION_LINE[a.situation] : '—',
    a.members?.length ? listMembers(a, 'card') : null,
    a.eldest_age ? `eldest ${a.eldest_age}` : null,
    a.sum_insured_band ? (a.sum_insured_band === 'unsure' ? 'amount: not sure' : SUM_LABEL[a.sum_insured_band]) : null,
    a.family_in_group_cover ? `family in group cover: ${a.family_in_group_cover.replace('_', ' ')}` : null,
  ].filter(Boolean);

  const quizParts = [
    a.room_rent_limit ? `Room rent limit: ${a.room_rent_limit === 'unsure' ? 'not sure' : a.room_rent_limit === 'limit' ? `yes${a.room_rent_note ? ` (${a.room_rent_note})` : ''}` : 'none'}` : null,
    a.policy_age_band ? `policy ${a.policy_age_band === 'unsure' ? 'age not sure' : POLICY_AGE_LABEL[a.policy_age_band]}` : null,
    a.renewal_window ? `renews ${a.renewal_window === 'unsure' ? 'not sure' : RENEWAL_LABEL[a.renewal_window]}` : null,
    a.health_condition ? `condition: ${a.health_condition === 'prefer_not' ? 'prefer not to say' : a.health_condition}` : null,
    a.job_exit_cover ? `cover after job: ${a.job_exit_cover.replace('_', ' ')}` : null,
    a.personal_policy_besides_group ? `personal policy: ${a.personal_policy_besides_group}` : null,
    a.top_concern ? `worry: ${a.top_concern.replace('_', ' ')}` : null,
    a.start_timing ? `wants cover: ${a.start_timing.replace('_', ' ').replace('1 3m', '1–3 months')}` : null,
  ].filter(Boolean);

  const h = i.handoff;
  const name = i.firstName ?? 'there';
  const agent = i.agentName ?? '<your name>';
  const recap: string[] = [];
  if (a.renewal_window && a.renewal_window !== 'unsure') recap.push(`your policy renews ${RENEWAL_LABEL[a.renewal_window]}`);
  if (a.room_rent_limit === 'unsure') recap.push("you weren't sure about the room rent limit");
  if (a.sum_insured_band === 'unsure') recap.push("you weren't sure of your cover amount");
  if (a.situation === 'group' && a.personal_policy_besides_group === 'no') recap.push('you rely on company cover today');
  if (a.situation === 'none' && a.start_timing === 'this_month') recap.push('you want cover to start this month');
  const recapText = recap.length ? ` You mentioned ${recap.slice(0, 2).join(' and ')}.` : '';
  const why = h?.action === 'advisor_call' || h?.action === 'callback'
    ? 'You did a Cover Check just now and asked for a call.'
    : 'You did a Cover Check and said we could contact you.';

  return {
    leadId: i.leadId,
    firstName: i.firstName,
    leadState: i.leadState,
    priority: i.priority,
    where: { pincode: i.pincode, city: i.city, state: i.state, mobileVerified: i.mobileVerified },
    askedFor: {
      action: h?.action ?? null, slotStart: h?.slotStart ?? null, slotEnd: h?.slotEnd ?? null,
      callLanguage: h?.callLanguage ?? null, topic: h?.topic ?? null, note: h?.note ?? null,
    },
    situationLine: situationParts.join(' · '),
    quizLine: quizParts.join(' · ') || '—',
    toldThem: i.findings.map((f) => ({ ruleId: f.ruleId, label: ruleShortLabel(f.ruleId, f.field) })),
    policyUpload: i.upload.status === 'none' ? 'Not done. Offer it on the call.'
      : i.upload.status === 'ready' ? `Done${i.upload.insurer ? ` · ${i.upload.insurer}${i.upload.product ? ` ${i.upload.product}` : ''}` : ''} · facts confirmed`
      : i.upload.status === 'processing' ? 'Uploaded, still reading.' : 'Tried, failed. Offer help with an unlocked copy.',
    consentLine: i.contactConsentTs ? `Call consent given ${fmtIst(i.contactConsentTs)} · notice ${i.noticeVersion ?? '—'}` : 'No call consent. Do not call.',
    openingScript: `Hello ${name}, this is ${agent} from Turtlemint. ${why}${recapText} Can I take two minutes to explain what that means for you?`,
  };
}

export const describeAskedFor = (c: LeadCard): string => {
  const f = c.askedFor;
  if (!f.action) return '—';
  const parts = [ACTION_NAME[f.action] ?? f.action];
  if (f.slotStart && f.slotEnd) parts.push(`${fmtIst(f.slotStart)} – ${fmtIst(f.slotEnd, false)}`);
  if (f.callLanguage) parts.push(LANG_NAME[f.callLanguage] ?? f.callLanguage);
  if (f.topic) parts.push(`Topic: ${TOPIC_NAME[f.topic]}`);
  return parts.join(', ') + (f.note ? `. Note: "${f.note}"` : '');
};
