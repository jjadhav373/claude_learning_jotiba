import type {
  Bootstrap, CaptureInput, CoverSummary, DocumentStatusView, EventName, HandoffInput, Language, LeadCard, LeadState,
  PolicyFactKey, Priority, QuizAnswers, Readout, ScreenId, Slot,
} from '@cover-check/shared';

export interface ApiError { code: string; message: string; details?: unknown }

/** The single seam between UI and server. HttpApi talks to the backend; MockApi powers the prototype. */
export interface CoverCheckApi {
  bootstrap(): Promise<Bootstrap & { slots: Slot[] }>;
  event(name: EventName, screenId?: ScreenId, props?: Record<string, string | number | boolean | null>): void;
  startQuiz(language: Language): Promise<{ sessionId: string }>;
  saveScreen(sessionId: string, screenId: ScreenId, answers: QuizAnswers, timeOnScreenMs: number | null): Promise<{ answers: QuizAnswers; next: string }>;
  completeQuiz(sessionId: string): Promise<Readout>;
  readoutDwell(sessionId: string, dwellMs: number): void;
  pincode(pin: string): Promise<{ city: string | null; state: string | null }>;
  capture(input: CaptureInput): Promise<{ city: string | null; state: string | null; maskedMobile: string; summarySentAt: string }>;
  sendOtp(purpose: 'upload' | 'call'): Promise<{ resendAfterSec: number; attemptsLeft: number }>;
  verifyOtp(code: string): Promise<{ verified: boolean }>;
  slots(): Promise<Slot[]>;
  handoff(input: HandoffInput & { language: Language }): Promise<{ leadState: LeadState; priority: Priority | null; queued: boolean }>;
  withdraw(): Promise<void>;
  docConsent(language: Language): Promise<void>;
  uploadDocs(files: File[]): Promise<{ accepted: string[]; rejected: { name: string; reason: string }[] }>;
  docPassword(docId: string, password: string): Promise<DocumentStatusView>;
  docStatus(docId: string): Promise<DocumentStatusView>;
  confirmFacts(docId: string, edits: { key: PolicyFactKey; userValue: string | null }[]): Promise<CoverSummary>;
  docSummary(docId: string): Promise<CoverSummary>;
}

/** Telecaller-side reads (separate auth in production). */
export interface AgentApi {
  card(leadId: string): Promise<LeadCard>;
}
