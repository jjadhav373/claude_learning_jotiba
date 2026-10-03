/**
 * REST API v1. Thin: parse → service → JSON. No SQL and no business rules here.
 *
 *  Customer (Bearer link token)                    Telecaller (x-agent-key)
 *  GET  /link/:token            S0 bootstrap        GET  /agent/queue, /agent/export.csv
 *  POST /events                 any screen          GET  /agent/leads/:id/card
 *  POST /quiz/sessions          S1 first tap        POST /agent/leads/:id/outcomes
 *  PUT  /quiz/sessions/:id      S1–S6
 *  POST /quiz/sessions/:id/complete   S7           Ops (x-agent-key)
 *  POST /quiz/sessions/:id/dwell      S7           POST /ops/links  issue a signed link
 *  GET  /pincode/:pin           S8                 POST /webhooks/whatsapp  inbound STOP
 *  POST /capture                S8
 *  POST /otp/send, /otp/verify  S9, U2
 *  POST /handoff                S9
 *  POST /consents/withdraw      S10
 *  POST /documents/consent      U1
 *  POST /documents              U3 (multipart, field "files")
 *  POST /documents/:id/password U3
 *  GET  /documents/:id          U4/U5 poll
 *  POST /documents/:id/confirm  U5
 *  GET  /documents/:id/summary  U6–U8
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { callSlots } from '@cover-check/shared';
import type { Deps } from '../services/deps.js';
import { journeyService } from '../services/journeyService.js';
import { otpService } from '../services/otpService.js';
import { handoffService } from '../services/handoffService.js';
import { documentService } from '../services/documentService.js';
import { telecallerSheetService } from '../services/telecallerSheetService.js';
import { h, parse, requireAgent, requireLead } from './middleware.js';
import * as S from './schemas.js';

export function apiRouter(d: Deps, agentKey: string): Router {
  const journey = journeyService(d), otp = otpService(d), handoff = handoffService(d), docs = documentService(d);
  const upload = multer({ storage: multer.memoryStorage(), limits: { files: d.config.maxFiles, fileSize: d.config.maxFileMb * 1024 * 1024 } });
  const r = Router();
  const lead = requireLead(d);
  const agent = requireAgent(agentKey);

  // ---------------------------------------------------------------- Rung 1
  r.get('/link/:token', h(async (req) => {
    const ua = req.header('user-agent') ?? '';
    const device = { type: /mobile/i.test(ua) ? 'mobile' : 'desktop', os: /android/i.test(ua) ? 'android' : /iphone|ipad/i.test(ua) ? 'ios' : 'other', browser: ua.slice(0, 120) };
    const boot = await journey.openLink(req.params.token!, device, req.query as Record<string, string>);
    return { ...boot, slots: callSlots(d.now()) };
  }));

  r.post('/events', lead, h(async (req) => {
    const e = parse(S.Event, req.body);
    await journey.logEvent(req.lead!, e.name, e.screenId, e.props ?? undefined, e.sessionId);
  }));

  r.post('/quiz/sessions', lead, h(async (req) => journey.startQuiz(req.lead!, parse(S.StartQuiz, req.body).language)));

  r.put('/quiz/sessions/:id', lead, h(async (req) => {
    const b = parse(S.SaveScreen, req.body);
    return journey.saveScreen(req.lead!, req.params.id!, b.screenId, b.answers, b.timeOnScreenMs);
  }));

  r.post('/quiz/sessions/:id/complete', lead, h(async (req) => journey.completeQuiz(req.lead!, req.params.id!)));
  r.post('/quiz/sessions/:id/dwell', lead, h(async (req) => journey.readoutDwell(req.lead!, req.params.id!, parse(S.Dwell, req.body).dwellMs)));

  r.get('/pincode/:pin', lead, h(async (req) => journey.lookupPincode(req.params.pin!)));
  r.post('/capture', lead, h(async (req) => journey.capture(req.lead!, parse(S.Capture, req.body))));

  r.post('/otp/send', lead, h(async (req) => otp.send(req.lead!, parse(S.Otp, req.body).purpose)));
  r.post('/otp/verify', lead, h(async (req) => otp.verify(req.lead!, parse(S.OtpVerify, req.body).code)));

  r.get('/slots', lead, h(async () => callSlots(d.now())));
  r.post('/handoff', lead, h(async (req) => {
    const { language, ...body } = parse(S.Handoff, req.body);
    return handoff.request(req.lead!, body, language);
  }));

  r.post('/consents/withdraw', lead, h(async (req) => journey.withdraw(req.lead!.leadId, 'page')));

  // ---------------------------------------------------------------- Rung 2
  r.post('/documents/consent', lead, h(async (req) => docs.consent(req.lead!, parse(S.DocConsent, req.body).language)));
  r.post('/documents', lead, upload.array('files', d.config.maxFiles), h(async (req) => {
    const files = ((req.files ?? []) as Express.Multer.File[]).map((f) => ({ originalName: f.originalname, mime: f.mimetype, data: f.buffer }));
    return docs.upload(req.lead!, files);
  }));
  r.post('/documents/:id/password', lead, h(async (req) => docs.submitPassword(req.lead!, req.params.id!, parse(S.DocPassword, req.body).password)));
  r.get('/documents/:id', lead, h(async (req) => docs.status(req.lead!, req.params.id!)));
  r.post('/documents/:id/confirm', lead, h(async (req) => docs.confirm(req.lead!, req.params.id!, parse(S.ConfirmFacts, req.body).edits)));
  r.get('/documents/:id/summary', lead, h(async (req) => docs.summary(req.lead!, req.params.id!)));

  // ---------------------------------------------------------------- Telecaller
  r.get('/agent/queue', agent, h(async (req) => handoff.queue(parse(S.AgentQueue, req.query).queue ?? null)));
  r.get('/agent/leads/:id/card', agent, h(async (req) => handoff.card(req.params.id!, req.header('x-agent-name') ?? undefined)));
  /** Same sheet as `npm run export:leads`, as a download. ?all=1 re-exports open leads. */
  r.get('/agent/export.csv', agent, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { csv, batch } = await telecallerSheetService(d).exportCsv({ onlyNew: req.query.all !== '1' });
      res.setHeader('content-type', 'text/csv; charset=utf-8');
      res.setHeader('content-disposition', `attachment; filename="telecaller-sheet-${batch}.csv"`);
      res.send(csv);
    } catch (e) { next(e); }
  });

  r.post('/agent/leads/:id/outcomes', agent, h(async (req) => {
    const { handoffId, ...o } = parse(S.Outcome, req.body);
    return handoff.outcome(req.agentId!, handoffId, req.params.id!, o);
  }));

  // ---------------------------------------------------------------- Ops + webhooks
  r.post('/ops/links', agent, h(async (req) => {
    const b = parse(S.IssueLink, req.body);
    return { token: d.tokens.issue({ m: b.mobile, d: b.door, c: b.campaignId, cr: b.creativeId, t: b.templateId }, d.now().getTime()) };
  }));

  /** Inbound WhatsApp (Gupshup). "STOP" withdraws contact + WhatsApp consent. Verify the Gupshup signature in production. */
  r.post('/webhooks/whatsapp', h(async (req) => {
    const text: string = req.body?.payload?.payload?.text ?? '';
    const from: string = req.body?.payload?.source ?? '';
    if (/^\s*stop\s*$/i.test(text) && from) {
      const leadRow = await d.repos.leads.findByMobile(`+${from.replace(/^\+/, '')}`);
      if (leadRow) await journey.withdraw(leadRow.lead_id, 'stop_reply');
    }
    return { ok: true };
  }));

  return r;
}
