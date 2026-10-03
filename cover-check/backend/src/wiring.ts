/** Builds the real dependency graph. Shared by the HTTP server and the command-line scripts. */
import { env } from './config/env.js';
import { pool, withTransaction, type Queryable } from './db/pool.js';
import { createRepos } from './repositories/index.js';
import { linkTokenService } from './services/linkTokenService.js';
import { gupshupSender } from './integrations/whatsapp.js';
import { localEncryptedStore } from './integrations/storage.js';
import { demoExtractor } from './integrations/extractor.js';
import type { Deps } from './services/deps.js';

export function buildDeps(): Deps {
  return {
    repos: createRepos(pool as unknown as Queryable),
    tx: (fn) => withTransaction((client) => fn(createRepos(client))),
    tokens: linkTokenService(env.LINK_TOKEN_SECRET, env.LINK_TOKEN_TTL_DAYS),
    whatsapp: gupshupSender({ apiKey: env.GUPSHUP_API_KEY, appName: env.GUPSHUP_APP_NAME, source: env.GUPSHUP_SOURCE_NUMBER }),
    store: localEncryptedStore('.data/docs', env.LINK_TOKEN_SECRET), // swap for S3 + KMS in production
    extractor: demoExtractor(),
    sendOtpSms: async (mobile, code) => {
      if (env.NODE_ENV !== 'production') console.info('[otp:dev]', mobile, code);
      // production: SMS gateway / WhatsApp authentication template
    },
    now: () => new Date(),
    config: {
      noticeVersion: env.NOTICE_VERSION,
      docRetentionDays: env.DOC_RETENTION_DAYS,
      maxFiles: env.MAX_FILES,
      maxFileMb: env.MAX_FILE_MB,
      waSummaryTemplateId: env.WA_SUMMARY_TEMPLATE_ID,
    },
  };
}

export const closeDb = () => pool.end();
