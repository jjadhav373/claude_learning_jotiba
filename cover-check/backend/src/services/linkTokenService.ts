/**
 * Signed, per-recipient link token carried by the WhatsApp button.
 * The mobile number is already known from the send list, so it is confirmed later — never typed.
 * Format: base64url(payload).base64url(HMAC-SHA256(payload))
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { DOORS, isIndianMobile, type Door } from '@cover-check/shared';
import { AppError } from './errors.js';

export interface LinkPayload {
  m: string;   // mobile, E.164
  d: Door;     // door → S0 headline
  c?: string;  // campaign id
  cr?: string; // creative id
  t?: string;  // WhatsApp template id
  w?: string;  // WhatsApp message id
  exp: number; // epoch seconds
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export const linkTokenService = (secret: string, ttlDays: number) => {
  const sign = (body: string) => createHmac('sha256', secret).update(body).digest();
  return {
    issue(p: Omit<LinkPayload, 'exp'>, now = Date.now()): string {
      if (!isIndianMobile(p.m)) throw new AppError('VALIDATION', 'Invalid mobile');
      const body = b64(JSON.stringify({ ...p, exp: Math.floor(now / 1000) + ttlDays * 86_400 }));
      return `${body}.${b64(sign(body))}`;
    },
    verify(token: string, now = Date.now()): LinkPayload {
      const [body, sig] = token.split('.');
      if (!body || !sig) throw new AppError('BAD_TOKEN', 'This link is not valid.');
      const expected = sign(body), given = Buffer.from(sig, 'base64url');
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new AppError('BAD_TOKEN', 'This link is not valid.');
      const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as LinkPayload;
      if (!DOORS.includes(p.d) || !isIndianMobile(p.m)) throw new AppError('BAD_TOKEN', 'This link is not valid.');
      if (p.exp * 1000 < now) throw new AppError('TOKEN_EXPIRED', 'This link has expired. Tap the button in a newer message.');
      return p;
    },
    hash: (token: string) => createHash('sha256').update(token).digest('hex'),
  };
};
export type LinkTokenService = ReturnType<typeof linkTokenService>;
