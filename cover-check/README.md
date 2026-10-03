# Cover Check — funnel codebase

The flow behind the WhatsApp button: Rung 1 Cover Quiz (S0–S10), Rung 2 Policy Upload (U1–U8), and the telecaller hand-off.
Built from *Cover Check funnel — Draft v1, 3 Oct 2026*. Design decisions: [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).

## Layers

```
cover-check/
├─ data/                          DATA — PostgreSQL
│  ├─ migrations/001_init.sql       11 record types + enums, append-only consent ledger, CHECKs that block a call without consent
│  ├─ migrations/002_views_and_jobs.sql  agent_queue (the only gate to a phone call), lead_card_source, funnel/drop-off views,
│  │                                     retention purge, least-privilege roles (app / agent / bi)
│  ├─ seeds/001_reference.sql       notice texts v1, readout rules R1–R8, demo pincodes
│  └─ tests/smoke.sql               SQL-level guarantees (run in a rolled-back transaction)
│
├─ shared/                        DOMAIN — used by backend AND frontend, so rules never drift
│  └─ src/  enums · types · quiz (S1–S6 config + validation) · readout (R1–R8) · handoff (lead state,
│           P1–P4, calling slots) · leadCard (telecaller card) · coverSummary (U6/U7) · util
│
├─ backend/                       BACKEND — Node 20+, Express, TypeScript
│  └─ src/
│     ├─ repositories/              DATA ACCESS — every SQL statement lives here (one repo per record type)
│     ├─ services/                  business logic: journey (S0–S8, S10), otp, handoff (S9 + telecaller), document (U1–U7)
│     ├─ integrations/              WhatsApp (Gupshup), encrypted object store, policy extractor (interface + demo)
│     ├─ http/                      routes (thin), zod schemas, auth middleware (link token / agent key), error mapping
│     ├─ db/                        pool, transactions, migration runner
│     └─ app.ts, server.ts          composition root
│  └─ test/journey.test.ts          end-to-end service test against Postgres (the "Priya" example)
│
└─ frontend/                      FRONTEND — React 19 + TypeScript (Vite)
   └─ src/
      ├─ styles/tokens.css, app.css  design tokens + component styles
      ├─ illustrations/, ui/icons     original inline-SVG illustrations and line icons
      ├─ ui/components.tsx            ScreenShell, OptionTile, Chip, Stepper, Field, ConsentBox, OtpForm, Sheet…
      ├─ screens/                     Landing, QuizScreen (S1–S6, generic), Readout, Capture, NextStep (S9/U8),
      │                               Confirmation, Upload (U1–U7)
      ├─ agent/LeadCardView.tsx       telecaller lead card
      ├─ api/                         CoverCheckApi interface · HttpApi (real) · MockApi (prototype)
      ├─ state/flow.tsx               journey state + navigation
      ├─ main.tsx                     production entry  (https://host/c/<token>)
      └─ prototype.tsx                prototype entry   (phone frame + live telecaller card)
```

## Run it (VS Code)

Needs Node.js 22 LTS and PostgreSQL 16. Run the commands below in the VS Code terminal, from the `cover-check` folder.

```bash
npm install                                  # once
npm run prototype                            # clickable prototype, no database needed → opens /prototype.html

# full app
cp backend/.env.example backend/.env          # Windows: copy backend\.env.example backend\.env  — then set your Postgres password
psql -U postgres -c "CREATE DATABASE cover_check_dev"   # or create it in pgAdmin
npm run db:migrate                           # tables, views, seed data
npm run dev:api                              # terminal 1 — API on :8080 (OTP codes + WhatsApp sends print here)
npm run dev:web                              # terminal 2 — web on :5173
npm run link                                 # terminal 3 — prints a signed test link to open
npm run link -- +919800000123                # a link for another mobile = a fresh journey (the same mobile resumes where it stopped)

# tests — the backend tests use their own database and do not read backend/.env
psql -U postgres -c "CREATE DATABASE cover_check_test"
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/cover_check_test npm run db:migrate
TEST_DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/cover_check_test npm test
# Windows PowerShell: set them first with  $env:TEST_DATABASE_URL="postgres://..."
```

VS Code shortcut: Terminal → Run Task → "Run full app (API + Web)" or "Prototype (no database)".

## Getting leads to telecallers (sheet workflow)

```bash
npm run export:leads                 # new callable leads → exports/telecaller-sheet-<time>.csv  (open in Excel / import to Google Sheets)
npm run export:leads -- --all        # every open callable lead again
npm run import:outcomes -- exports/telecaller-sheet-<time>.csv   # after telecallers fill the outcome columns
```

* Only `agent_queue` rows are exported: hand raised (P1/P2) or warm-consented (P3/P4), contact consent live, not DND.
  "Summary only" without consent, withdrawn and STOP leads never appear.
* Each lead is exported once (tracked in `handoff.exported_ts`), so two telecallers never get the same person.
* Telecallers fill: Connected (Y/N), Call minutes, Disposition (`enquiry_created`, `callback_later`, `not_interested`,
  `wrong_number`, `do_not_call`), Enquiry ID, Agent notes, Agent name. Don't edit Lead ID / Handoff ID.
* `do_not_call` withdraws call consent and blocks the number from every future export. Importing the same file twice is safe.
* Also available as a download: `GET /api/v1/agent/export.csv` with header `x-agent-key`.

## API (v1)

| Method | Path | Screen | Notes |
| --- | --- | --- | --- |
| GET | `/link/:token` | S0 | Verifies the signed token, merges the lead by mobile, logs the source. Returns door, masked mobile, resume state, call slots |
| POST | `/quiz/sessions` | S1 | First tap: starts the session and records `save_answers` consent |
| PUT | `/quiz/sessions/:id` | S1–S6 | Saves one screen; server re-validates with the shared config |
| POST | `/quiz/sessions/:id/complete` | S7 | Returns the readout and records exactly which rule lines were shown |
| POST | `/capture` | S8 | Name, pincode, confirmed mobile → `whatsapp_summary` consent + WhatsApp summary. Never creates a call |
| POST | `/otp/send`, `/otp/verify` | S9, U2 | 6 digits, resend after 30 s, 3 tries, 5 min expiry, 5/hour |
| POST | `/handoff` | S9, U8 | Advisor call requires ticked consent, verified mobile and a slot inside 9 am–9 pm IST |
| POST | `/consents/withdraw` | S10 | Also triggered by a WhatsApp STOP reply (`/webhooks/whatsapp`) |
| POST | `/documents/consent`, `/documents`, `/documents/:id/password` | U1, U3 | Separate `read_document` consent; up to 3 files × 15 MB; password used once, never stored |
| GET | `/documents/:id` | U4, U5 | Poll. Low-confidence facts come back empty, never guessed |
| POST | `/documents/:id/confirm` | U5 | Keeps extracted and user values side by side |
| GET | `/documents/:id/summary` | U6–U7 | Sections with page references + points to review |
| GET | `/agent/queue`, `/agent/leads/:id/card` | Telecaller | Reads `agent_queue` — only consented, non-DND leads |
| POST | `/agent/leads/:id/outcomes` | Telecaller | `do_not_call` withdraws consent and flags the lead |

## Guarantees the design depends on (and where they are enforced)

| Promise | Enforced in |
| --- | --- |
| A call has to be earned | `handoff` CHECK: no queue without `contact_consent_id`; `agent_queue` view joins live consent and DND; `deriveLeadState` |
| Three separate consents, nothing pre-ticked | Separate `consent` rows per purpose; UI checkboxes start unticked |
| Withdrawal as easy as giving it | Append-only ledger + withdrawal row; queue drops the lead immediately (tested) |
| Their words reach the call | `lead_card_source` view + `buildLeadCard` restate stored answers only |
| Never guess a policy fact | Extractor returns `null`; low confidence shown empty; summary says “Not found in your document” |
| Exact wording is traceable | `notice_version` stored by hash; `finding.rule_version` + `text_version_id` |

## Still VALIDATION REQUIRED (from the spec)

Callback wording on S10 · warm-lead call window · P1–P4 thresholds · document retention period (default 90 days in `.env`) ·
`share_with_insurer` purpose · condition tags on S4 · extractor vendor and insurer formats · final notice copy and translations.
