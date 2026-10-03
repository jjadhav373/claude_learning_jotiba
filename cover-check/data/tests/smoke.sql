-- Smoke test: run after migrations + seeds. Exercises the Priya example end to end and the
-- guarantees the design depends on. Wrapped in a transaction and rolled back.
\set ON_ERROR_STOP on
BEGIN;
SET search_path = cover_check, public;

-- Lead from the WhatsApp send list
INSERT INTO lead (lead_id, mobile) VALUES ('11111111-1111-1111-1111-111111111111', '+919812345214');
INSERT INTO source (lead_id, link_token_hash, door, wa_template_id, wa_message_id, campaign_id)
VALUES ('11111111-1111-1111-1111-111111111111', encode(digest('tok','sha256'),'hex'), 'check', 'cover_fest_utility_v1', 'wamid.1', 'coverfest');

-- S1 first tap → save_answers consent
INSERT INTO consent (lead_id, purpose, notice_version, notice_language, notice_sha256, granted, method)
SELECT '11111111-1111-1111-1111-111111111111', 'save_answers', 'v1', 'en', body_sha256, true, 'button'
FROM notice_version WHERE notice_version='v1' AND notice_language='en' AND purpose='save_answers';

INSERT INTO quiz_session (session_id, lead_id, path) VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'own');
INSERT INTO quiz_answer (session_id, situation, members, eldest_age, children_count, sum_insured_band, policy_age_band,
                         health_condition, room_rent_limit, renewal_window)
VALUES ('22222222-2222-2222-2222-222222222222', 'own', ARRAY['self','spouse','children']::member_t[], 36, 2, '5_10', '3_5',
        'prefer_not', 'unsure', '1_3m');
UPDATE quiz_session SET completed_ts = now(), screens_completed = 6, last_screen_id = 'S6', total_time_sec = 58, unsure_count = 1
WHERE session_id = '22222222-2222-2222-2222-222222222222';

INSERT INTO finding (lead_id, session_id, origin, rule_id, rule_version, category, severity, text_version_id)
VALUES ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'quiz', 'R1', 'v1-2026-10-03', 'room_rent', 'review', 'h1');

-- Hand-off WITHOUT contact consent cannot be queued
DO $$ BEGIN
  BEGIN
    INSERT INTO handoff (lead_id, requested_action, queue, priority) VALUES ('11111111-1111-1111-1111-111111111111', 'advisor_call', 'hand_raised', 'P2');
    RAISE EXCEPTION 'expected check violation';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok: queue requires contact consent';
  END;
END $$;

-- Contact consent + queued hand-off
INSERT INTO consent (consent_id, lead_id, purpose, notice_version, notice_language, notice_sha256, granted, method)
VALUES ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'contact_call', 'v1', 'en', 'x', true, 'tick');
INSERT INTO handoff (lead_id, requested_action, slot_start, slot_end, call_language, topic, note, contact_consent_id, priority, queue, sla_due_ts)
VALUES ('11111111-1111-1111-1111-111111111111', 'advisor_call', now() + interval '6 hours', now() + interval '8 hours', 'hi', 'renewal',
        'Premium badh gaya hai.', '33333333-3333-3333-3333-333333333333', 'P2', 'hand_raised', now() + interval '6 hours');
UPDATE lead SET first_name='Priya', pincode='411001', city='Pune', state='Maharashtra', mobile_confirmed=true, mobile_verified=true,
                lead_state='hand_raised', priority='P2' WHERE lead_id='11111111-1111-1111-1111-111111111111';

DO $$ BEGIN
  IF (SELECT count(*) FROM agent_queue) <> 1 THEN RAISE EXCEPTION 'agent_queue should have 1 row'; END IF;
  IF (SELECT situation FROM lead_card_source WHERE first_name='Priya') <> 'own' THEN RAISE EXCEPTION 'lead card missing answers'; END IF;
  RAISE NOTICE 'ok: queue + lead card';
END $$;

-- Consent ledger is append-only
DO $$ BEGIN
  BEGIN
    UPDATE consent SET granted = false WHERE consent_id = '33333333-3333-3333-3333-333333333333';
    RAISE EXCEPTION 'expected append-only error';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: consent is append-only';
  END;
END $$;

-- Withdrawal adds a row and removes the lead from the queue immediately
INSERT INTO consent (lead_id, purpose, notice_version, notice_language, notice_sha256, granted, method, withdrawn_ts, withdrawn_via)
VALUES ('11111111-1111-1111-1111-111111111111', 'contact_call', 'v1', 'en', 'x', false, 'button', now(), 'stop_reply');
DO $$ BEGIN
  IF (SELECT count(*) FROM agent_queue) <> 0 THEN RAISE EXCEPTION 'withdrawn lead still queued'; END IF;
  IF (SELECT count(*) FROM consent WHERE lead_id='11111111-1111-1111-1111-111111111111') <> 3 THEN RAISE EXCEPTION 'ledger rows'; END IF;
  RAISE NOTICE 'ok: withdrawal dequeues';
END $$;

-- Policy facts keep both values when the person edits
INSERT INTO policy_document (doc_id, lead_id, consent_id, file_ref, original_name, mime, size_bytes, content_sha256, retention_until)
VALUES ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
        'kms://bucket/obj', 'schedule.pdf', 'application/pdf', 200000, 'abc', now() - interval '1 day');
INSERT INTO policy_fact (doc_id, fact_key, value, source_page, confidence) VALUES
 ('44444444-4444-4444-4444-444444444444', 'sum_insured_inr', '500000', 1, 0.97),
 ('44444444-4444-4444-4444-444444444444', 'insurer_name', '"Example General"', 1, 0.99),
 ('44444444-4444-4444-4444-444444444444', 'room_rent_limit', NULL, NULL, NULL);
UPDATE policy_fact SET user_confirmed = true, user_value = '700000' WHERE fact_key = 'sum_insured_inr';
DO $$ BEGIN
  IF (SELECT sum_insured_inr FROM policy_profile) <> 700000 THEN RAISE EXCEPTION 'user value should win'; END IF;
  IF (SELECT value FROM policy_fact WHERE fact_key='sum_insured_inr')::text <> '500000' THEN RAISE EXCEPTION 'extracted value lost'; END IF;
  RAISE NOTICE 'ok: facts keep both values';
END $$;

-- Retention job
DO $$ BEGIN
  IF purge_expired_documents() <> 1 THEN RAISE EXCEPTION 'retention purge'; END IF;
  IF (SELECT count(*) FROM policy_fact) <> 0 THEN RAISE EXCEPTION 'facts not purged'; END IF;
  RAISE NOTICE 'ok: retention purge';
END $$;

-- Analytics views compile and return
SELECT * FROM screen_dropoff LIMIT 1;
SELECT * FROM quiz_timing;

ROLLBACK;
