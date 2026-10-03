export type ErrorCode =
  | 'BAD_TOKEN' | 'TOKEN_EXPIRED' | 'VALIDATION' | 'NOT_FOUND' | 'CONSENT_REQUIRED' | 'OTP_REQUIRED'
  | 'OTP_INVALID' | 'OTP_LOCKED' | 'OTP_TOO_SOON' | 'RATE_LIMITED' | 'OUTSIDE_CALL_HOURS' | 'FILE_REJECTED'
  | 'PASSWORD_REQUIRED' | 'PASSWORD_LOCKED' | 'FORBIDDEN' | 'CONFLICT';

const STATUS: Record<ErrorCode, number> = {
  BAD_TOKEN: 401, TOKEN_EXPIRED: 401, VALIDATION: 422, NOT_FOUND: 404, CONSENT_REQUIRED: 403, OTP_REQUIRED: 403,
  OTP_INVALID: 422, OTP_LOCKED: 429, OTP_TOO_SOON: 429, RATE_LIMITED: 429, OUTSIDE_CALL_HOURS: 422, FILE_REJECTED: 422,
  PASSWORD_REQUIRED: 422, PASSWORD_LOCKED: 422, FORBIDDEN: 403, CONFLICT: 409,
};

/** Errors the UI knows how to show. `message` is safe to display. */
export class AppError extends Error {
  readonly status: number;
  constructor(readonly code: ErrorCode, message: string, readonly details?: unknown) {
    super(message);
    this.status = STATUS[code];
  }
}
