/** Composition root: wires real infrastructure into services and starts the HTTP server. */
import { env } from './config/env.js';
import { buildDeps, closeDb } from './wiring.js';
import { createApp } from './app.js';

const deps = buildDeps();
const app = createApp(deps, { agentKey: env.AGENT_API_KEY, corsOrigin: env.CORS_ORIGIN });
const server = app.listen(env.PORT, () => console.info(`Cover Check API on :${env.PORT}`));

// Daily retention sweep (VALIDATION REQUIRED: period). Use a proper scheduler in production.
setInterval(() => deps.repos.documents.purgeExpired().catch(console.error), 24 * 3_600_000).unref();

const shutdown = () => server.close(() => closeDb().then(() => process.exit(0)));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
