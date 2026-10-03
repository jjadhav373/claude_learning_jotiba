-- Cover Check — core schema (PostgreSQL 15+)
-- Eleven record types from the funnel spec: lead, source, consent, quiz_session, quiz_answer,
-- policy_document, policy_fact, finding, handoff, call_outcome, event.
-- Field names and enums are proposals to map onto the existing lead system.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid(), digest()

CREATE SCHEMA IF NOT EXISTS cover_check;
SET search_path = cover_check, public;

-- ------------------------------------------------------------------ enums
CREATE TYPE door_t            AS ENUM ('get','check','company','review');
CREATE TYPE language_t        AS ENUM ('en','hi','mr');
CREATE TYPE situation_t       AS ENUM ('none','own','group');
CREATE TYPE member_t          AS ENUM ('self','spouse','children','parents','parents_in_law');
CREATE TYPE parents_age_t     AS ENUM ('u60','60_70','70p');
CREATE TYPE sum_band_t        AS ENUM ('lt3','3_5','5_10','10_25','25p','unsure');
CREATE TYPE family_group_t    AS ENUM ('yes','only_me','unsure');
CREATE TYPE health_cond_t     AS ENUM ('yes','no','prefer_not');
CREATE TYPE condition_tag_t   AS ENUM ('bp','diabetes','thyroid','heart','asthma','other');
CREATE TYPE policy_age_t      AS ENUM ('lt1','1_3','3_5','5p','unsure');
CREATE TYPE job_exit_t        AS ENUM ('own_policy','none','unsure');
CREATE TYPE room_rent_t       AS ENUM ('limit','no_limit','unsure');
CREATE TYPE concern_t         AS ENUM ('bills','parents','serious_illness','savings','other');
CREATE TYPE renewal_t         AS ENUM ('lt1m','1_3m','3_12m','unsure');
CREATE TYPE yes_no_t          AS ENUM ('yes','no');
CREATE TYPE start_timing_t    AS ENUM ('this_month','1_3m','exploring');
CREATE TYPE lead_state_t      AS ENUM ('incomplete','data_only','consented_warm','hand_raised');
CREATE TYPE consent_purpose_t AS ENUM ('save_answers','whatsapp_summary','contact_call','read_document','share_with_insurer');
CREATE TYPE consent_method_t  AS ENUM ('button','tick','otp');
CREATE TYPE withdrawn_via_t   AS ENUM ('stop_reply','page','advisor');
CREATE TYPE action_t          AS ENUM ('advisor_call','callback','see_plans','summary_only','upload_policy');
CREATE TYPE topic_t           AS ENUM ('renewal','parents','compare','claim','other');
CREATE TYPE priority_t        AS ENUM ('P1','P2','P3','P4');
CREATE TYPE queue_t           AS ENUM ('hand_raised','warm');
CREATE TYPE doc_status_t      AS ENUM ('queued','reading','ready','needs_review','failed');
CREATE TYPE doc_failure_t     AS ENUM ('wrong_password','unreadable','not_health','too_large','other');
CREATE TYPE policy_type_t     AS ENUM ('individual','floater','group');
CREATE TYPE finding_origin_t  AS ENUM ('quiz','document');
CREATE TYPE finding_cat_t     AS ENUM ('room_rent','waiting','renewal','sum_insured','family','other');
CREATE TYPE severity_t        AS ENUM ('review','ask','info');
CREATE TYPE disposition_t     AS ENUM ('enquiry_created','callback_later','not_interested','wrong_number','do_not_call');

-- ------------------------------------------------------------------ helpers
CREATE FUNCTION touch_updated() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_ts := now(); RETURN NEW; END $$;

CREATE FUNCTION forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege'; END $$;

-- ------------------------------------------------------------------ notice versions
-- Exact text shown to the person, stored once and referenced by hash.
CREATE TABLE notice_version (
  notice_version  text        NOT NULL,
  notice_language language_t  NOT NULL,
  purpose         consent_purpose_t NOT NULL,
  body            text        NOT NULL,
  body_sha256     text        GENERATED ALWAYS AS (encode(digest(body, 'sha256'), 'hex')) STORED,
  approved_by     text,                         -- compliance sign-off
  created_ts      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notice_version, notice_language, purpose)
);

-- ------------------------------------------------------------------ 1. lead
-- One row per mobile number. Repeat visits merge by mobile.
CREATE TABLE lead (
  lead_id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile             text         NOT NULL UNIQUE CHECK (mobile ~ '^\+91[6-9][0-9]{9}$'),
  mobile_confirmed   boolean      NOT NULL DEFAULT false,
  mobile_verified    boolean      NOT NULL DEFAULT false,
  mobile_verified_ts timestamptz,
  first_name         text         CHECK (char_length(first_name) BETWEEN 2 AND 40),
  pincode            char(6)      CHECK (pincode ~ '^[1-9][0-9]{5}$'),
  city               text,
  state              text,
  language           language_t,
  lead_state         lead_state_t NOT NULL DEFAULT 'incomplete',
  priority           priority_t,
  do_not_contact     boolean      NOT NULL DEFAULT false,  -- set by STOP / do_not_call disposition
  created_ts         timestamptz  NOT NULL DEFAULT now(),
  last_seen_ts       timestamptz  NOT NULL DEFAULT now(),
  updated_ts         timestamptz  NOT NULL DEFAULT now()
);
CREATE TRIGGER lead_touch BEFORE UPDATE ON lead FOR EACH ROW EXECUTE FUNCTION touch_updated();
CREATE INDEX lead_state_idx ON lead (lead_state, priority);

-- ------------------------------------------------------------------ 2. source
-- One row per link open. Ties every lead to the message and creative that brought it.
CREATE TABLE source (
  source_id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          uuid        NOT NULL REFERENCES lead ON DELETE CASCADE,
  link_token_hash  text        NOT NULL,       -- sha256 of the signed token, never the token
  wa_template_id   text,
  wa_message_id    text,
  door             door_t      NOT NULL,
  campaign_id      text,
  creative_id      text,
  utm_source       text,
  utm_medium       text,
  utm_campaign     text,
  device_type      text,
  os               text,
  browser          text,
  first_click_ts   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX source_lead_idx ON source (lead_id, first_click_ts DESC);
CREATE INDEX source_campaign_idx ON source (campaign_id, creative_id);
CREATE INDEX source_token_idx ON source (link_token_hash);

-- ------------------------------------------------------------------ 3. consent (append-only ledger)
-- One row per decision, never edited. Withdrawal adds a row with granted = false.
CREATE TABLE consent (
  consent_id       uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          uuid              NOT NULL REFERENCES lead ON DELETE CASCADE,
  purpose          consent_purpose_t NOT NULL,
  notice_version   text              NOT NULL,
  notice_language  language_t        NOT NULL,
  notice_sha256    text              NOT NULL,
  granted          boolean           NOT NULL,
  method           consent_method_t  NOT NULL,
  granted_ts       timestamptz       NOT NULL DEFAULT clock_timestamp(),  -- clock time so rows in one tx order correctly
  ip               inet,
  user_agent       text,
  withdrawn_ts     timestamptz,
  withdrawn_via    withdrawn_via_t,
  CHECK ((withdrawn_ts IS NULL) = (withdrawn_via IS NULL)),
  CHECK (withdrawn_ts IS NULL OR granted = false)
);
CREATE TRIGGER consent_append_only BEFORE UPDATE OR DELETE ON consent FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE INDEX consent_lead_purpose_idx ON consent (lead_id, purpose, granted_ts DESC);

-- Current state per purpose = latest row.
CREATE VIEW consent_current AS
SELECT DISTINCT ON (lead_id, purpose)
       lead_id, purpose, consent_id, granted, granted_ts, notice_version, withdrawn_ts
FROM consent
ORDER BY lead_id, purpose, granted_ts DESC, consent_id;

-- ------------------------------------------------------------------ 4. quiz_session
CREATE TABLE quiz_session (
  session_id        uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           uuid         NOT NULL REFERENCES lead ON DELETE CASCADE,
  source_id         uuid         REFERENCES source ON DELETE SET NULL,
  path              situation_t,
  started_ts        timestamptz  NOT NULL DEFAULT clock_timestamp(),
  completed_ts      timestamptz,
  last_screen_id    text         NOT NULL DEFAULT 'S0',
  screens_completed smallint     NOT NULL DEFAULT 0 CHECK (screens_completed BETWEEN 0 AND 10),
  total_time_sec    integer,
  unsure_count      smallint     NOT NULL DEFAULT 0,
  resumed           boolean      NOT NULL DEFAULT false
);
CREATE INDEX quiz_session_lead_idx ON quiz_session (lead_id, started_ts DESC);
CREATE INDEX quiz_session_open_idx ON quiz_session (lead_id) WHERE completed_ts IS NULL;

-- ------------------------------------------------------------------ 5. quiz_answer
-- The profile the telecaller reads. One wide row per session (fast to read), plus
-- per-answer quality data in quiz_answer_meta.
CREATE TABLE quiz_answer (
  session_id                    uuid PRIMARY KEY REFERENCES quiz_session ON DELETE CASCADE,
  situation                     situation_t,
  members                       member_t[] CHECK (members IS NULL OR cardinality(members) >= 1),
  eldest_age                    smallint CHECK (eldest_age BETWEEN 18 AND 99),
  children_count                smallint CHECK (children_count BETWEEN 1 AND 6),
  parents_age_band              parents_age_t,
  sum_insured_band              sum_band_t,
  family_in_group_cover         family_group_t,
  health_condition              health_cond_t,
  condition_tags                condition_tag_t[],      -- sensitive: only stored with its own consent (see service)
  policy_age_band               policy_age_t,
  job_exit_cover                job_exit_t,
  room_rent_limit               room_rent_t,
  room_rent_note                text CHECK (char_length(room_rent_note) <= 40),
  top_concern                   concern_t,
  renewal_window                renewal_t,
  personal_policy_besides_group yes_no_t,
  start_timing                  start_timing_t,
  updated_ts                    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER quiz_answer_touch BEFORE UPDATE ON quiz_answer FOR EACH ROW EXECUTE FUNCTION touch_updated();

CREATE TABLE quiz_answer_meta (
  session_id        uuid        NOT NULL REFERENCES quiz_session ON DELETE CASCADE,
  field             text        NOT NULL,
  screen_id         text        NOT NULL,
  answered_ts       timestamptz NOT NULL DEFAULT now(),
  time_on_screen_ms integer,
  changed_count     smallint    NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, field)
);

-- ------------------------------------------------------------------ 6. policy_document
-- One row per uploaded file. The file itself sits in encrypted object storage.
CREATE TABLE policy_document (
  doc_id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id            uuid          NOT NULL REFERENCES lead ON DELETE CASCADE,
  consent_id         uuid          NOT NULL REFERENCES consent,      -- read_document consent
  file_ref           text          NOT NULL,                          -- encrypted object key, never a public URL
  original_name      text          NOT NULL,
  mime               text          NOT NULL CHECK (mime IN ('application/pdf','image/jpeg','image/png','image/heic')),
  size_bytes         integer       NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 15 * 1024 * 1024),
  pages              smallint,
  password_protected boolean       NOT NULL DEFAULT false,            -- the password itself is never stored
  password_attempts  smallint      NOT NULL DEFAULT 0,
  processing_status  doc_status_t  NOT NULL DEFAULT 'queued',
  failure_reason     doc_failure_t,
  failed_page        smallint,
  extractor_version  text,
  content_sha256     text          NOT NULL,
  policy_number_last4 char(4),                                        -- for duplicate merge
  uploaded_ts        timestamptz   NOT NULL DEFAULT now(),
  ready_ts           timestamptz,
  retention_until    timestamptz   NOT NULL,                          -- VALIDATION REQUIRED: period
  deleted_ts         timestamptz,
  superseded_by      uuid          REFERENCES policy_document,
  CHECK (processing_status <> 'failed' OR failure_reason IS NOT NULL)
);
CREATE INDEX policy_document_lead_idx ON policy_document (lead_id, uploaded_ts DESC) WHERE deleted_ts IS NULL;
CREATE INDEX policy_document_retention_idx ON policy_document (retention_until) WHERE deleted_ts IS NULL;

-- Access log for documents (compliance: "access logs").
CREATE TABLE document_access_log (
  id         bigserial   PRIMARY KEY,
  doc_id     uuid        NOT NULL REFERENCES policy_document ON DELETE CASCADE,
  actor      text        NOT NULL,       -- 'lead', 'agent:<id>', 'system:extractor'
  action     text        NOT NULL,       -- read_file, read_facts, delete
  ts         timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER document_access_log_append_only BEFORE UPDATE OR DELETE ON document_access_log
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- ------------------------------------------------------------------ 7. policy_fact
-- One row per fact read from the document, with provenance and confirmation.
CREATE TABLE policy_fact (
  fact_id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id          uuid        NOT NULL REFERENCES policy_document ON DELETE CASCADE,
  fact_key        text        NOT NULL CHECK (fact_key IN (
                    'insurer_name','product_name','policy_type','policy_number_last4','sum_insured_inr','premium_inr',
                    'members','start_date','end_date','renewal_date','room_rent_limit','copay_percent','deductible_inr',
                    'ped_waiting_months','specific_waiting_months','initial_waiting_days','sublimits','restoration',
                    'no_claim_bonus','riders')),
  value           jsonb,                          -- NULL = not found in the document (never guessed)
  source_page     smallint,
  confidence      numeric(4,3) CHECK (confidence BETWEEN 0 AND 1),
  user_confirmed  boolean     NOT NULL DEFAULT false,
  user_value      jsonb,                          -- if the person edits, both values are kept
  confirmed_ts    timestamptz,
  UNIQUE (doc_id, fact_key)
);

-- Pivot for convenient reads: effective value = user_value if edited, else extracted value.
CREATE VIEW policy_profile AS
SELECT d.doc_id, d.lead_id,
  max(COALESCE(f.user_value, f.value) #>> '{}') FILTER (WHERE f.fact_key = 'insurer_name')    AS insurer_name,
  max(COALESCE(f.user_value, f.value) #>> '{}') FILTER (WHERE f.fact_key = 'product_name')    AS product_name,
  max(COALESCE(f.user_value, f.value) #>> '{}') FILTER (WHERE f.fact_key = 'policy_type')     AS policy_type,
  max((COALESCE(f.user_value, f.value) #>> '{}')::bigint) FILTER (WHERE f.fact_key = 'sum_insured_inr') AS sum_insured_inr,
  max((COALESCE(f.user_value, f.value) #>> '{}')::date)   FILTER (WHERE f.fact_key = 'end_date')        AS end_date,
  max(COALESCE(f.user_value, f.value) #>> '{}') FILTER (WHERE f.fact_key = 'room_rent_limit') AS room_rent_limit,
  bool_and(f.user_confirmed) AS all_confirmed
FROM policy_document d
JOIN policy_fact f USING (doc_id)
WHERE d.deleted_ts IS NULL
GROUP BY d.doc_id, d.lead_id;

-- ------------------------------------------------------------------ 8. finding
-- What we told the person, with the version of the wording.
CREATE TABLE readout_rule (
  rule_id      text          NOT NULL,
  rule_version text          NOT NULL,
  category     finding_cat_t NOT NULL,
  severity     severity_t    NOT NULL,
  body         text          NOT NULL,
  approved_by  text,
  PRIMARY KEY (rule_id, rule_version)
);

CREATE TABLE finding (
  finding_id      uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid             NOT NULL REFERENCES lead ON DELETE CASCADE,
  session_id      uuid             REFERENCES quiz_session ON DELETE CASCADE,
  doc_id          uuid             REFERENCES policy_document ON DELETE CASCADE,
  origin          finding_origin_t NOT NULL,
  rule_id         text             NOT NULL,
  rule_version    text             NOT NULL,
  category        finding_cat_t    NOT NULL,
  severity        severity_t       NOT NULL,
  field           text,                              -- R8: which "Not sure" answer
  text_version_id text             NOT NULL,         -- sha256 of the exact line shown
  shown_ts        timestamptz      NOT NULL DEFAULT now(),
  dwell_ms        integer,
  tapped          boolean          NOT NULL DEFAULT false,
  CHECK ((origin = 'quiz' AND session_id IS NOT NULL) OR (origin = 'document' AND doc_id IS NOT NULL))
);
CREATE INDEX finding_lead_idx ON finding (lead_id, shown_ts);
CREATE UNIQUE INDEX finding_once_per_session ON finding (session_id, rule_id, COALESCE(field, '')) WHERE origin = 'quiz';
CREATE UNIQUE INDEX finding_once_per_doc ON finding (doc_id, rule_id) WHERE origin = 'document';

-- ------------------------------------------------------------------ 9. handoff
-- What the person asked for. This row is what puts a lead in front of a telecaller.
CREATE TABLE handoff (
  handoff_id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id            uuid        NOT NULL REFERENCES lead ON DELETE CASCADE,
  requested_action   action_t    NOT NULL,
  slot_start         timestamptz,
  slot_end           timestamptz,
  call_language      language_t,
  topic              topic_t,
  note               text        CHECK (char_length(note) <= 140),
  contact_consent_id uuid        REFERENCES consent,
  priority           priority_t,
  queue              queue_t,
  assigned_agent_id  text,
  sla_due_ts         timestamptz,
  closed_ts          timestamptz,
  created_ts         timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (slot_start IS NULL OR slot_end > slot_start),
  -- No call without contact consent: a queued handoff must reference one.
  CHECK (queue IS NULL OR contact_consent_id IS NOT NULL),
  CHECK (requested_action NOT IN ('advisor_call','callback') OR queue IS NULL OR (slot_start IS NOT NULL AND call_language IS NOT NULL))
);
CREATE INDEX handoff_queue_idx ON handoff (queue, priority, sla_due_ts) WHERE closed_ts IS NULL AND queue IS NOT NULL;
CREATE INDEX handoff_lead_idx ON handoff (lead_id, created_ts DESC);

-- ------------------------------------------------------------------ 10. call_outcome
CREATE TABLE call_outcome (
  outcome_id     uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  handoff_id     uuid          NOT NULL REFERENCES handoff ON DELETE CASCADE,
  lead_id        uuid          NOT NULL REFERENCES lead ON DELETE CASCADE,
  agent_id       text          NOT NULL,
  attempt_no     smallint      NOT NULL CHECK (attempt_no >= 1),
  attempted_ts   timestamptz   NOT NULL DEFAULT now(),
  connected      boolean       NOT NULL,
  duration_sec   integer       CHECK (duration_sec >= 0),
  disposition    disposition_t NOT NULL,
  enquiry_id     text,
  quote_shared   boolean       NOT NULL DEFAULT false,
  policy_sold    boolean       NOT NULL DEFAULT false,
  agent_notes    text,
  followup_ts    timestamptz,
  UNIQUE (handoff_id, attempt_no)
);

-- ------------------------------------------------------------------ 11. event
-- One event per action, so any drop-off can be found. Partition by month in production.
CREATE TABLE event (
  event_id   bigserial   PRIMARY KEY,
  lead_id    uuid        REFERENCES lead ON DELETE CASCADE,
  session_id uuid,
  name       text        NOT NULL CHECK (name IN (
               'link_clicked','landing_viewed','quiz_started','screen_viewed','answer_submitted','quiz_completed',
               'readout_viewed','capture_submitted','otp_sent','otp_verified','next_action_selected','upload_started',
               'upload_completed','extraction_ready','facts_confirmed','summary_viewed','point_opened','call_requested',
               'plans_viewed','summary_sent','consent_withdrawn')),
  screen_id  text,
  props      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ts         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_name_ts_idx ON event (name, ts);
CREATE INDEX event_lead_idx ON event (lead_id, ts);

-- ------------------------------------------------------------------ supporting tables
CREATE TABLE otp_challenge (
  otp_id       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      uuid        NOT NULL REFERENCES lead ON DELETE CASCADE,
  mobile       text        NOT NULL,
  code_hash    text        NOT NULL,           -- sha256(code || otp_id), never the code
  purpose      text        NOT NULL CHECK (purpose IN ('upload','call','change_mobile')),
  attempts     smallint    NOT NULL DEFAULT 0,
  sent_ts      timestamptz NOT NULL DEFAULT now(),
  expires_ts   timestamptz NOT NULL,
  verified_ts  timestamptz
);
CREATE INDEX otp_lead_idx ON otp_challenge (lead_id, sent_ts DESC);

CREATE TABLE pincode_directory (
  pincode char(6) PRIMARY KEY,
  city    text NOT NULL,
  state   text NOT NULL
);

CREATE TABLE whatsapp_message (
  wa_message_id text        PRIMARY KEY,
  lead_id       uuid        NOT NULL REFERENCES lead ON DELETE CASCADE,
  template_id   text        NOT NULL,
  kind          text        NOT NULL CHECK (kind IN ('summary','cover_summary','reminder')),
  sent_ts       timestamptz NOT NULL DEFAULT now(),
  status        text        NOT NULL DEFAULT 'sent'
);

COMMIT;
