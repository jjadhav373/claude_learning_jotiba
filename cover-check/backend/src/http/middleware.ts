import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { AppError } from '../services/errors.js';
import type { Deps, LeadCtx } from '../services/deps.js';

declare module 'express-serve-static-core' {
  interface Request { lead?: LeadCtx; agentId?: string }
}

/** Customer routes: `Authorization: Bearer <link token>`. No login, no password — the signed link is the key. */
export const requireLead = (d: Deps) => async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) throw new AppError('BAD_TOKEN', 'This link is not valid.');
    d.tokens.verify(token, d.now().getTime());
    const hit = await d.repos.sources.leadForToken(d.tokens.hash(token));
    if (!hit) throw new AppError('BAD_TOKEN', 'Open the link from WhatsApp again.');
    req.lead = { leadId: hit.lead_id, sourceId: hit.source_id, ip: req.ip, userAgent: req.header('user-agent') ?? undefined };
    next();
  } catch (e) { next(e); }
};

/** Telecaller routes. Replace with the existing agent SSO in production. */
export const requireAgent = (apiKey: string) => (req: Request, _res: Response, next: NextFunction) => {
  if (req.header('x-agent-key') !== apiKey) return next(new AppError('FORBIDDEN', 'Agent access only'));
  req.agentId = req.header('x-agent-id') ?? 'agent-unknown';
  next();
};

export const parse = <S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> => {
  const r = schema.safeParse(value);
  if (!r.success) throw new AppError('VALIDATION', 'Some answers are not valid', r.error.flatten().fieldErrors);
  return r.data;
};

/** Wrap async handlers so thrown errors reach the error handler. */
export const h = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).then((body) => { if (!res.headersSent) res.json(body ?? { ok: true }); }, next);

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  if (err instanceof ZodError) return res.status(422).json({ error: { code: 'VALIDATION', message: 'Invalid input', details: err.flatten() } });
  console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong. Your answers are saved.' } });
};
