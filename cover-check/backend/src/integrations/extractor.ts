/**
 * Policy document reader. "Who builds it" is an open decision in the spec, so this is an
 * interface with a demo implementation. A real implementation (OCR + LLM/rules per insurer
 * format) must return `null` for anything it cannot read — never a guess.
 */
import type { DocFailure, PolicyFactKey } from '@cover-check/shared';

export interface ExtractionInput { data: Buffer; mime: string; password?: string }

export type ExtractionResult =
  | { ok: true; extractorVersion: string; pages: number; facts: { key: PolicyFactKey; value: unknown | null; sourcePage: number | null; confidence: number | null }[] }
  | { ok: false; extractorVersion: string; reason: DocFailure | 'password_required'; failedPage?: number };

export interface PolicyExtractor { extract(input: ExtractionInput): Promise<ExtractionResult> }

/** Below this confidence a fact is shown empty with "Please enter it". VALIDATION REQUIRED. */
export const MIN_CONFIDENCE = 0.8;

const isEncryptedPdf = (b: Buffer) => b.subarray(0, 1024 * 64).includes('/Encrypt');

export const demoExtractor = (): PolicyExtractor => ({
  async extract({ data, mime, password }) {
    const v = 'demo-0.1';
    if (mime === 'application/pdf' && isEncryptedPdf(data)) {
      if (!password) return { ok: false, extractorVersion: v, reason: 'password_required' };
      if (password.length < 4) return { ok: false, extractorVersion: v, reason: 'wrong_password' };
    }
    const text = data.toString('latin1');
    if (/motor|vehicle|term life|travel insurance/i.test(text) && !/health|mediclaim|hospital/i.test(text))
      return { ok: false, extractorVersion: v, reason: 'not_health' };
    return {
      ok: true, extractorVersion: v, pages: 4,
      facts: [
        { key: 'insurer_name', value: 'Example General Insurance', sourcePage: 1, confidence: 0.98 },
        { key: 'product_name', value: 'Family Health Optima', sourcePage: 1, confidence: 0.95 },
        { key: 'policy_type', value: 'floater', sourcePage: 1, confidence: 0.93 },
        { key: 'policy_number_last4', value: '4821', sourcePage: 1, confidence: 0.99 },
        { key: 'sum_insured_inr', value: 500000, sourcePage: 1, confidence: 0.97 },
        { key: 'members', value: 'Self (36), Spouse (34), 2 children', sourcePage: 2, confidence: 0.9 },
        { key: 'start_date', value: '2025-11-20', sourcePage: 1, confidence: 0.96 },
        { key: 'end_date', value: '2026-11-19', sourcePage: 1, confidence: 0.96 },
        { key: 'room_rent_limit', value: '1% of sum insured per day', sourcePage: 3, confidence: 0.86 },
        { key: 'copay_percent', value: 0, sourcePage: 3, confidence: 0.82 },
        { key: 'ped_waiting_months', value: 36, sourcePage: 3, confidence: 0.91 },
        { key: 'specific_waiting_months', value: 24, sourcePage: 3, confidence: 0.88 },
        { key: 'initial_waiting_days', value: 30, sourcePage: 3, confidence: 0.92 },
        { key: 'restoration', value: null, sourcePage: null, confidence: null },
        { key: 'no_claim_bonus', value: '10% a year, up to 50%', sourcePage: 4, confidence: 0.7 },
      ],
    };
  },
});
