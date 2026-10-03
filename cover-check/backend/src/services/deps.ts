import type { Repos } from '../repositories/index.js';
import type { LinkTokenService } from './linkTokenService.js';
import type { WhatsAppSender } from '../integrations/whatsapp.js';
import type { ObjectStore } from '../integrations/storage.js';
import type { PolicyExtractor } from '../integrations/extractor.js';

/** Everything a service needs, injected so tests can swap any part. */
export interface Deps {
  repos: Repos;
  /** Run in one DB transaction with repos bound to that transaction. */
  tx<T>(fn: (r: Repos) => Promise<T>): Promise<T>;
  tokens: LinkTokenService;
  whatsapp: WhatsAppSender;
  store: ObjectStore;
  extractor: PolicyExtractor;
  sendOtpSms(mobile: string, code: string): Promise<void>;
  now(): Date;
  config: {
    noticeVersion: string;
    docRetentionDays: number;
    maxFiles: number;
    maxFileMb: number;
    waSummaryTemplateId: string;
  };
}

/** Request context resolved from the link token. */
export interface LeadCtx {
  leadId: string;
  sourceId: string | null;
  ip?: string;
  userAgent?: string;
}
