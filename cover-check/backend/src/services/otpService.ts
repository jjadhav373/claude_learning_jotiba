/**
 * OTP only where the spec puts it: before upload and before a call request. The quiz stays login-free.
 * 6 digits · resend after 30 s · 3 attempts · 5 minute expiry · 5 sends an hour.
 */
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { AppError } from './errors.js';
import type { Deps, LeadCtx } from './deps.js';

export const OTP_RULES = { length: 6, resendAfterSec: 30, maxAttempts: 3, ttlSec: 300, maxPerHour: 5 } as const;
const hash = (code: string, otpId: string) => createHash('sha256').update(`${code}:${otpId}`).digest('hex');

export const otpService = (d: Deps) => ({
  async send(ctx: LeadCtx, purpose: 'upload' | 'call') {
    const lead = await d.repos.leads.get(ctx.leadId);
    if (!lead) throw new AppError('NOT_FOUND', 'Not found');
    const last = await d.repos.otps.lastSent(ctx.leadId);
    const now = d.now().getTime();
    if (last && now - new Date(last.sent_ts).getTime() < OTP_RULES.resendAfterSec * 1000)
      throw new AppError('OTP_TOO_SOON', 'Please wait a few seconds before asking for a new code.');
    if ((await d.repos.otps.sentInLastHour(ctx.leadId)) >= OTP_RULES.maxPerHour)
      throw new AppError('RATE_LIMITED', 'Too many codes requested. Try again in an hour.');
    const code = String(randomInt(0, 10 ** OTP_RULES.length)).padStart(OTP_RULES.length, '0');
    await d.repos.otps.create({ leadId: ctx.leadId, mobile: lead.mobile, purpose, ttlSec: OTP_RULES.ttlSec, codeHash: (id) => hash(code, id) });
    await d.sendOtpSms(lead.mobile, code);
    await d.repos.events.log({ name: 'otp_sent', leadId: ctx.leadId, props: { purpose } });
    return { resendAfterSec: OTP_RULES.resendAfterSec, attemptsLeft: OTP_RULES.maxAttempts };
  },

  async verify(ctx: LeadCtx, code: string) {
    if (!/^\d{6}$/.test(code)) throw new AppError('OTP_INVALID', 'Enter the 6 digit code.');
    const o = await d.repos.otps.lastSent(ctx.leadId);
    if (!o || o.verified_ts) throw new AppError('OTP_INVALID', 'Ask for a new code.');
    if (new Date(o.expires_ts).getTime() < d.now().getTime()) throw new AppError('OTP_INVALID', 'This code has expired. Ask for a new one.');
    if (o.attempts >= OTP_RULES.maxAttempts) throw new AppError('OTP_LOCKED', 'Too many tries. Ask for a new code.');
    await d.repos.otps.bumpAttempt(o.otp_id);
    const ok = timingSafeEqual(Buffer.from(hash(code, o.otp_id)), Buffer.from(o.code_hash));
    if (!ok) throw new AppError('OTP_INVALID', 'That code is not right.', { attemptsLeft: OTP_RULES.maxAttempts - o.attempts - 1 });
    await d.tx(async (r) => {
      await r.otps.markVerified(o.otp_id);
      await r.leads.markVerified(ctx.leadId);
      await r.events.log({ name: 'otp_verified', leadId: ctx.leadId });
    });
    return { verified: true };
  },
});
export type OtpService = ReturnType<typeof otpService>;
