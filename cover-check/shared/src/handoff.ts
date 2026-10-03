/**
 * Who gets a call, and how soon. "A call has to be earned": only hand-raised or
 * consented-warm leads ever reach a telecaller queue.
 */
import type { LeadState, Priority, Queue, RequestedAction } from './enums';
import type { QuizAnswers } from './types';
import { unsureCount } from './quiz';

export interface LeadStateInput {
  /** Finished the quiz capture (S8) or confirmed upload facts (U5). */
  completed: boolean;
  requestedAction: RequestedAction | null;
  /** Latest contact_call consent is granted and not withdrawn. */
  contactConsent: boolean;
}

export function deriveLeadState({ completed, requestedAction, contactConsent }: LeadStateInput): LeadState {
  const asked = requestedAction === 'advisor_call' || requestedAction === 'callback';
  if (asked && contactConsent) return 'hand_raised';
  if (!completed) return 'incomplete';
  return contactConsent ? 'consented_warm' : 'data_only';
}

export interface PriorityInput {
  leadState: LeadState;
  answers: QuizAnswers;
  reviewPoints: number; // findings with severity "review" (quiz or document)
}

/** Thresholds are VALIDATION REQUIRED. */
export function computePriority({ leadState, answers: a, reviewPoints }: PriorityInput): Priority | null {
  if (leadState === 'hand_raised') {
    const urgent = a.renewal_window === 'lt1m' || (a.situation === 'none' && a.start_timing === 'this_month');
    return urgent ? 'P1' : 'P2';
  }
  if (leadState === 'consented_warm') return unsureCount(a) >= 2 || reviewPoints >= 2 ? 'P3' : 'P4';
  return null; // data_only / incomplete: nobody calls
}

export const queueFor = (s: LeadState): Queue | null =>
  s === 'hand_raised' ? 'hand_raised' : s === 'consented_warm' ? 'warm' : null;

/** SLA from hand-off to first attempt. VALIDATION REQUIRED. */
export function slaDue(priority: Priority, now: Date, slotStart?: Date): Date {
  if (slotStart) return slotStart; // hand raised: call inside their slot
  const mins = { P1: 60, P2: 120, P3: 24 * 60, P4: 48 * 60 }[priority];
  return new Date(now.getTime() + mins * 60_000);
}

// ---------------------------------------------------------------- calling slots

/** Permitted calling hours, local IST. VALIDATION REQUIRED with compliance (TRAI / DND). */
export const CALL_WINDOW = { startHour: 9, endHour: 21, slotHours: 2, minLeadMinutes: 30 } as const;
const IST_OFFSET_MIN = 330;

export interface Slot { day: 'today' | 'tomorrow'; start: string; end: string; label: string }

const istParts = (d: Date) => {
  const t = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() };
};
const istToUtc = (y: number, m: number, d: number, h: number) => new Date(Date.UTC(y, m, d, h) - IST_OFFSET_MIN * 60_000);
const fmtHour = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? 'am' : 'pm'}`;

export function callSlots(now: Date): Slot[] {
  const out: Slot[] = [];
  const { y, m, d } = istParts(now);
  for (const [day, add] of [['today', 0], ['tomorrow', 1]] as const) {
    for (let h = CALL_WINDOW.startHour; h + CALL_WINDOW.slotHours <= CALL_WINDOW.endHour; h += CALL_WINDOW.slotHours) {
      const start = istToUtc(y, m, d + add, h);
      if (start.getTime() - now.getTime() < CALL_WINDOW.minLeadMinutes * 60_000) continue;
      const end = istToUtc(y, m, d + add, h + CALL_WINDOW.slotHours);
      out.push({ day, start: start.toISOString(), end: end.toISOString(), label: `${fmtHour(h)} – ${fmtHour(h + CALL_WINDOW.slotHours)}` });
    }
  }
  return out;
}

export function isInsideCallWindow(startIso: string, endIso: string): boolean {
  const s = new Date(startIso), e = new Date(endIso);
  if (!(e > s)) return false;
  const hour = (d: Date) => {
    const t = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
    return t.getUTCHours() + t.getUTCMinutes() / 60;
  };
  const sh = hour(s), eh = hour(e) === 0 ? 24 : hour(e);
  return sh >= CALL_WINDOW.startHour && eh <= CALL_WINDOW.endHour && e.getTime() - s.getTime() <= CALL_WINDOW.slotHours * 3_600_000;
}
