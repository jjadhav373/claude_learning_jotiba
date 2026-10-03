import { z } from 'zod';

// Load backend/.env when present (Node 20.12+). Real environment variables still win.
try { process.loadEnvFile?.('.env'); } catch { /* no .env file — use defaults / real env */ }

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().default('postgres://postgres@localhost:5432/cover_check_dev'),
  DB_POOL_MAX: z.coerce.number().default(10),
  /** HMAC key used to sign WhatsApp link tokens (rotate via KMS). */
  LINK_TOKEN_SECRET: z.string().min(32).default('dev-only-secret-change-me-dev-only-secret'),
  LINK_TOKEN_TTL_DAYS: z.coerce.number().default(14),
  AGENT_API_KEY: z.string().default('dev-agent-key'),
  NOTICE_VERSION: z.string().default('v1'),
  /** VALIDATION REQUIRED — document retention period. */
  DOC_RETENTION_DAYS: z.coerce.number().default(90),
  MAX_FILES: z.coerce.number().default(3),
  MAX_FILE_MB: z.coerce.number().default(15),
  GUPSHUP_API_KEY: z.string().optional(),
  GUPSHUP_APP_NAME: z.string().default('turtlemint'),
  GUPSHUP_SOURCE_NUMBER: z.string().optional(),
  WA_SUMMARY_TEMPLATE_ID: z.string().default('cover_check_summary_v1'),
  STORAGE_BUCKET: z.string().default('cover-check-docs'),
  KMS_KEY_ID: z.string().optional(),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

export const env = Env.parse(process.env);
export type EnvT = z.infer<typeof Env>;
