/**
 * Rung 1 quiz definition. Data, not components: the UI renders these generically and the
 * API validates against the same rules, so wording and "mandatory" can never drift apart.
 */
import { pathOf, type Path } from './enums';
import type { AnswerField, QuizAnswers } from './types';

export interface Option {
  value: string;
  label: string;
  /** Rendered as the dashed "Not sure" tile. */
  unsure?: boolean;
  icon?: string;
}

interface Base {
  field: AnswerField;
  label: string;
  helper?: string;
  required: boolean;
  /** Question only exists when this returns true ("If shown" in the spec). */
  showIf?: (a: QuizAnswers) => boolean;
}
export type Question =
  | (Base & { kind: 'single'; options: Option[] })
  | (Base & { kind: 'multi'; options: Option[]; min?: number; style?: 'tiles' | 'chips' })
  | (Base & { kind: 'number'; min: number; max: number; placeholder?: string })
  | (Base & { kind: 'stepper'; min: number; max: number })
  | (Base & { kind: 'text'; maxLength: number; placeholder?: string });

export interface QuizScreen {
  id: 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';
  step: number; // 1..6
  title: string;
  intro?: string;
  seconds: number;
  questions: Question[];
}

const unsure: Option = { value: 'unsure', label: 'Not sure', unsure: true };

const SUM_BANDS: Option[] = [
  { value: 'lt3', label: 'Under ₹3 L' },
  { value: '3_5', label: '₹3 – 5 L' },
  { value: '5_10', label: '₹5 – 10 L' },
  { value: '10_25', label: '₹10 – 25 L' },
  { value: '25p', label: '₹25 L and above' },
  unsure,
];

const HEALTH: Option[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'prefer_not', label: 'Prefer not to say' },
];

const CONDITION_CHIPS: Option[] = [
  { value: 'bp', label: 'BP' },
  { value: 'diabetes', label: 'Diabetes' },
  { value: 'thyroid', label: 'Thyroid' },
  { value: 'heart', label: 'Heart' },
  { value: 'asthma', label: 'Asthma' },
  { value: 'other', label: 'Other' },
];

const ROOM_RENT: Option[] = [
  { value: 'limit', label: 'Yes, there is a limit' },
  { value: 'no_limit', label: 'No limit' },
  unsure,
];

const has = (a: QuizAnswers, m: string) => (a.members ?? []).includes(m as never);

export const S1: QuizScreen = {
  id: 'S1', step: 1, seconds: 5,
  title: 'Where do you stand today?',
  questions: [{
    kind: 'single', field: 'situation', required: true, label: 'Where do you stand today?',
    options: [
      { value: 'none', label: "I don't have health insurance", icon: 'none' },
      { value: 'own', label: "I have my own or my family's policy", icon: 'own' },
      { value: 'group', label: 'My company covers me', icon: 'group' },
    ],
  }],
};

export function quizScreens(path: Path | null): QuizScreen[] {
  if (!path) return [S1];
  const A = path === 'A', B = path === 'B', C = path === 'C';

  const s2: QuizScreen = {
    id: 'S2', step: 2, seconds: 12,
    title: A ? 'Who do you want to cover?' : 'Who is covered today?',
    questions: [
      {
        kind: 'multi', field: 'members', required: true, min: 1, style: 'tiles',
        label: A ? 'Who do you want to cover?' : 'Who is covered today?', helper: 'Pick all that apply',
        options: [
          { value: 'self', label: 'Me' },
          { value: 'spouse', label: 'Spouse or partner' },
          { value: 'children', label: 'Children' },
          { value: 'parents', label: 'Parents' },
          { value: 'parents_in_law', label: 'Parents-in-law' },
        ],
      },
      { kind: 'number', field: 'eldest_age', required: true, min: 18, max: 99, label: 'How old is the eldest person?',
        helper: 'Age decides waiting periods and which plans apply', placeholder: 'Age in years' },
      { kind: 'stepper', field: 'children_count', required: true, min: 1, max: 6, label: 'How many children?',
        showIf: (a) => has(a, 'children') },
      { kind: 'single', field: 'parents_age_band', required: true, label: 'How old are your parents?',
        showIf: (a) => has(a, 'parents'),
        options: [{ value: 'u60', label: 'Under 60' }, { value: '60_70', label: '60 to 70' }, { value: '70p', label: 'Over 70' }] },
    ],
  };

  const s3: QuizScreen = {
    id: 'S3', step: 3, seconds: 6,
    title: A ? 'How much cover would you like?' : B ? 'How much is your cover?' : 'How much does your company cover?',
    intro: A ? undefined : 'It is printed on your policy or e-card as "Sum insured".',
    questions: [
      { kind: 'single', field: 'sum_insured_band', required: true, options: SUM_BANDS,
        label: A ? 'How much cover would you like?' : B ? 'How much is your cover?' : 'How much does your company cover?' },
      ...(C ? [{ kind: 'single', field: 'family_in_group_cover', required: true, label: 'Is your family included?',
        options: [{ value: 'yes', label: 'Yes' }, { value: 'only_me', label: 'Only me' }, unsure] } as Question] : []),
    ],
  };

  const s4: QuizScreen = {
    id: 'S4', step: 4, seconds: 8,
    title: C ? 'If you left your job, would you still have health cover?' : B ? 'About your policy and health' : 'Any health condition today?',
    intro: 'Some treatments are covered only after a waiting period.',
    questions: C
      ? [{ kind: 'single', field: 'job_exit_cover', required: true, label: 'If you left your job, would you still have health cover?',
          options: [{ value: 'own_policy', label: 'Yes, my own policy' }, { value: 'none', label: 'No' }, unsure] }]
      : [
          ...(B ? [{ kind: 'single', field: 'policy_age_band', required: true, label: 'How long have you had this policy?',
            options: [{ value: 'lt1', label: 'Under 1 yr' }, { value: '1_3', label: '1 to 3 yrs' }, { value: '3_5', label: '3 to 5 yrs' },
              { value: '5p', label: '5+ yrs' }, unsure] } as Question] : []),
          { kind: 'single', field: 'health_condition', required: true, options: HEALTH,
            label: A ? 'Does anyone to be covered have a health condition today?' : 'Does anyone covered have a health condition today?' },
          { kind: 'multi', field: 'condition_tags', required: false, style: 'chips', options: CONDITION_CHIPS,
            label: 'If you like, tell us which (optional)', showIf: (a) => a.health_condition === 'yes' },
        ],
  };

  const s5: QuizScreen = A
    ? { id: 'S5', step: 5, seconds: 6, title: 'What worries you most?', questions: [
        { kind: 'single', field: 'top_concern', required: true, label: 'What worries you most?', options: [
          { value: 'bills', label: 'Hospital bills' }, { value: 'parents', label: "Parents' health" },
          { value: 'serious_illness', label: 'A serious illness' }, { value: 'savings', label: 'Savings running out' },
          { value: 'other', label: 'Something else' }] }] }
    : { id: 'S5', step: 5, seconds: 6, title: 'Does your policy limit room rent?',
        intro: 'A room rent limit can reduce what is paid on the whole bill, not only the room.',
        questions: [
          { kind: 'single', field: 'room_rent_limit', required: true, label: 'Does your policy limit room rent?', options: ROOM_RENT },
          { kind: 'text', field: 'room_rent_note', required: false, maxLength: 40, label: 'What is the limit? (optional)',
            placeholder: 'e.g. 1% of cover, or ₹5,000 a day', showIf: (a) => a.room_rent_limit === 'limit' },
        ] };

  const s6: QuizScreen = A
    ? { id: 'S6', step: 6, seconds: 6, title: 'When do you want cover to start?', questions: [
        { kind: 'single', field: 'start_timing', required: true, label: 'When do you want cover to start?', options: [
          { value: 'this_month', label: 'This month' }, { value: '1_3m', label: 'In 1 to 3 months' }, { value: 'exploring', label: 'Just exploring' }] }] }
    : B
      ? { id: 'S6', step: 6, seconds: 6, title: 'When does your policy renew?', questions: [
          { kind: 'single', field: 'renewal_window', required: true, label: 'When does your policy renew?', options: [
            { value: 'lt1m', label: 'Within 1 month' }, { value: '1_3m', label: '1 to 3 months' },
            { value: '3_12m', label: '3 to 12 months' }, unsure] }] }
      : { id: 'S6', step: 6, seconds: 6, title: 'Do you also have a personal health policy?', questions: [
          { kind: 'single', field: 'personal_policy_besides_group', required: true, label: 'Do you also have a personal health policy?',
            options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] }] };

  return [S1, s2, s3, s4, s5, s6];
}

export function screensForAnswers(a: QuizAnswers): QuizScreen[] {
  return quizScreens(a.situation ? pathOf(a.situation) : null);
}

export const visibleQuestions = (s: QuizScreen, a: QuizAnswers) => s.questions.filter((q) => !q.showIf || q.showIf(a));

/** Returns the first problem, or null when the screen can move on. "Not sure" counts as an answer. */
export function validateQuestion(q: Question, a: QuizAnswers): string | null {
  const v = a[q.field] as unknown;
  const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
  if (empty) return q.required ? 'Please answer this to continue' : null;
  switch (q.kind) {
    case 'single':
      return q.options.some((o) => o.value === v) ? null : 'Pick one option';
    case 'multi': {
      if (!Array.isArray(v)) return 'Pick at least one';
      if (q.min && v.length < q.min) return 'Pick at least one';
      return v.every((x) => q.options.some((o) => o.value === x)) ? null : 'Unknown option';
    }
    case 'number':
    case 'stepper': {
      const n = Number(v);
      if (!Number.isInteger(n)) return 'Enter a whole number';
      return n < q.min || n > q.max ? `Enter a number from ${q.min} to ${q.max}` : null;
    }
    case 'text':
      return String(v).length > q.maxLength ? `Keep it under ${q.maxLength} characters` : null;
  }
}

export function screenErrors(s: QuizScreen, a: QuizAnswers): Partial<Record<AnswerField, string>> {
  const out: Partial<Record<AnswerField, string>> = {};
  for (const q of visibleQuestions(s, a)) {
    const e = validateQuestion(q, a);
    if (e) out[q.field] = e;
  }
  return out;
}

export const isScreenComplete = (s: QuizScreen, a: QuizAnswers) => Object.keys(screenErrors(s, a)).length === 0;

/** Remove answers that no longer apply (e.g. user changed path on S1, or unpicked Children). */
export function pruneAnswers(a: QuizAnswers): QuizAnswers {
  const screens = screensForAnswers(a);
  const allowed = new Set<AnswerField>();
  for (const s of screens) for (const q of visibleQuestions(s, a)) allowed.add(q.field);
  const out: QuizAnswers = {};
  for (const k of Object.keys(a) as AnswerField[]) if (allowed.has(k)) (out as Record<string, unknown>)[k] = a[k];
  return out;
}

/** Spec: a lead is complete when S1–S3 are answered (plus name, pincode, confirmed mobile on S8). */
export function isQuizCoreComplete(a: QuizAnswers): boolean {
  return screensForAnswers(a).slice(0, 3).every((s) => isScreenComplete(s, a)) && !!a.situation;
}

export const UNSURE_FIELDS: AnswerField[] = [
  'sum_insured_band', 'family_in_group_cover', 'policy_age_band', 'job_exit_cover', 'room_rent_limit', 'renewal_window',
];
export const unsureCount = (a: QuizAnswers) => UNSURE_FIELDS.filter((f) => a[f] === 'unsure').length;
