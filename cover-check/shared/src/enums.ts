/**
 * Enumerations shared by the database, API and UI.
 * Values mirror the data model in the Cover Check funnel spec. Keep in sync with
 * data/migrations/001_init.sql (CREATE TYPE …).
 */

export const DOORS = ['get', 'check', 'company', 'review'] as const;
export type Door = (typeof DOORS)[number];

export const LANGUAGES = ['en', 'hi', 'mr'] as const;
export type Language = (typeof LANGUAGES)[number];

export const SITUATIONS = ['none', 'own', 'group'] as const;
export type Situation = (typeof SITUATIONS)[number];

/** Spec paths: A = no cover yet, B = own/family policy, C = company cover. */
export type Path = 'A' | 'B' | 'C';
export const pathOf = (s: Situation): Path => (s === 'none' ? 'A' : s === 'own' ? 'B' : 'C');

export const MEMBERS = ['self', 'spouse', 'children', 'parents', 'parents_in_law'] as const;
export type Member = (typeof MEMBERS)[number];

export const PARENTS_AGE_BANDS = ['u60', '60_70', '70p'] as const;
export type ParentsAgeBand = (typeof PARENTS_AGE_BANDS)[number];

export const SUM_INSURED_BANDS = ['lt3', '3_5', '5_10', '10_25', '25p', 'unsure'] as const;
export type SumInsuredBand = (typeof SUM_INSURED_BANDS)[number];

export const FAMILY_IN_GROUP = ['yes', 'only_me', 'unsure'] as const;
export type FamilyInGroup = (typeof FAMILY_IN_GROUP)[number];

export const HEALTH_CONDITION = ['yes', 'no', 'prefer_not'] as const;
export type HealthCondition = (typeof HEALTH_CONDITION)[number];

export const CONDITION_TAGS = ['bp', 'diabetes', 'thyroid', 'heart', 'asthma', 'other'] as const;
export type ConditionTag = (typeof CONDITION_TAGS)[number];

export const POLICY_AGE_BANDS = ['lt1', '1_3', '3_5', '5p', 'unsure'] as const;
export type PolicyAgeBand = (typeof POLICY_AGE_BANDS)[number];

export const JOB_EXIT_COVER = ['own_policy', 'none', 'unsure'] as const;
export type JobExitCover = (typeof JOB_EXIT_COVER)[number];

export const ROOM_RENT_LIMIT = ['limit', 'no_limit', 'unsure'] as const;
export type RoomRentLimit = (typeof ROOM_RENT_LIMIT)[number];

export const TOP_CONCERNS = ['bills', 'parents', 'serious_illness', 'savings', 'other'] as const;
export type TopConcern = (typeof TOP_CONCERNS)[number];

export const RENEWAL_WINDOWS = ['lt1m', '1_3m', '3_12m', 'unsure'] as const;
export type RenewalWindow = (typeof RENEWAL_WINDOWS)[number];

export const YES_NO = ['yes', 'no'] as const;
export type YesNo = (typeof YES_NO)[number];

export const START_TIMING = ['this_month', '1_3m', 'exploring'] as const;
export type StartTiming = (typeof START_TIMING)[number];

export const LEAD_STATES = ['incomplete', 'data_only', 'consented_warm', 'hand_raised'] as const;
export type LeadState = (typeof LEAD_STATES)[number];

export const CONSENT_PURPOSES = [
  'save_answers',
  'whatsapp_summary',
  'contact_call',
  'read_document',
  'share_with_insurer', // VALIDATION REQUIRED — not used in the prototype
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const CONSENT_METHODS = ['button', 'tick', 'otp'] as const;
export type ConsentMethod = (typeof CONSENT_METHODS)[number];

export const WITHDRAWN_VIA = ['stop_reply', 'page', 'advisor'] as const;
export type WithdrawnVia = (typeof WITHDRAWN_VIA)[number];

export const REQUESTED_ACTIONS = ['advisor_call', 'callback', 'see_plans', 'summary_only', 'upload_policy'] as const;
export type RequestedAction = (typeof REQUESTED_ACTIONS)[number];

export const TOPICS = ['renewal', 'parents', 'compare', 'claim', 'other'] as const;
export type Topic = (typeof TOPICS)[number];

export const PRIORITIES = ['P1', 'P2', 'P3', 'P4'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const QUEUES = ['hand_raised', 'warm'] as const;
export type Queue = (typeof QUEUES)[number];

export const DOC_STATUS = ['queued', 'reading', 'ready', 'needs_review', 'failed'] as const;
export type DocStatus = (typeof DOC_STATUS)[number];

export const DOC_FAILURE = ['wrong_password', 'unreadable', 'not_health', 'too_large', 'other'] as const;
export type DocFailure = (typeof DOC_FAILURE)[number];

export const FINDING_ORIGIN = ['quiz', 'document'] as const;
export type FindingOrigin = (typeof FINDING_ORIGIN)[number];

export const FINDING_CATEGORY = ['room_rent', 'waiting', 'renewal', 'sum_insured', 'family', 'other'] as const;
export type FindingCategory = (typeof FINDING_CATEGORY)[number];

/** review = amber, ask = blue ("Worth asking"), info = green ("Fine"). */
export const SEVERITY = ['review', 'ask', 'info'] as const;
export type Severity = (typeof SEVERITY)[number];

export const DISPOSITIONS = ['enquiry_created', 'callback_later', 'not_interested', 'wrong_number', 'do_not_call'] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

export const SCREEN_IDS = ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10',
  'U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7', 'U8'] as const;
export type ScreenId = (typeof SCREEN_IDS)[number];

export const EVENT_NAMES = [
  'link_clicked', 'landing_viewed', 'quiz_started', 'screen_viewed', 'answer_submitted', 'quiz_completed',
  'readout_viewed', 'capture_submitted', 'otp_sent', 'otp_verified', 'next_action_selected', 'upload_started',
  'upload_completed', 'extraction_ready', 'facts_confirmed', 'summary_viewed', 'point_opened', 'call_requested',
  'plans_viewed', 'summary_sent', 'consent_withdrawn',
] as const;
export type EventName = (typeof EVENT_NAMES)[number];
