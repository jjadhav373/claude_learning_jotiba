import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { apiRouter } from './http/routes.js';
import { errorHandler } from './http/middleware.js';
import type { Deps } from './services/deps.js';

export function createApp(d: Deps, opts: { agentKey: string; corsOrigin: string }) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: opts.corsOrigin, allowedHeaders: ['authorization', 'content-type', 'x-agent-key', 'x-agent-id', 'x-agent-name'] }));
  app.use(express.json({ limit: '64kb' }));
  app.use('/api/v1', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.use('/api/v1', apiRouter(d, opts.agentKey));
  app.use(errorHandler);
  return app;
}
