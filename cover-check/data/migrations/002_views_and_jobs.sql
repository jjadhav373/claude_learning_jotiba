-- Cover Check — read models, analytics views, retention, roles.
BEGIN;
SET search_path = cover_check, public;

-- ------------------------------------------------------------------ telecaller queue
-- Only leads with an open, queued hand-off AND a live contact consent AND no DND flag.
-- This view is the single gate between data and a phone call.
CREATE VIEW agent_queue AS
SELECT h.handoff_id, h.lead_id, h.queue, h.priority, h.sla_due_ts, h.slot_start, h.slot_end,
       h.call_language, h.assigned_agent_id, l.first_name, l.city, l.lead_state
FROM handoff h
JOIN lead l USING (lead_id)
JOIN consent_current cc ON cc.lead_id = h.lead_id AND cc.purpose = 'contact_call'
WHERE h.closed_ts IS NULL
  AND h.queue IS NOT NULL
  AND cc.granted
  AND NOT l.do_not_contact
ORDER BY h.priority, COALESCE(h.slot_start, h.sla_due_ts);

-- ------------------------------------------------------------------ lead card read model
-- Latest session answers + latest handoff + latest ready document, per lead.
-- condition_tags deliberately NOT exposed: detail belongs to the call, not the card.
CREATE VIEW lead_card_source AS
WITH last_session AS (
  SELECT DISTINCT ON (s.lead_id) s.lead_id, s.session_id
  FROM quiz_session s ORDER BY s.lead_id, s.started_ts DESC
), last_handoff AS (
  SELECT DISTINCT ON (h.lead_id) h.* FROM handoff h ORDER BY h.lead_id, h.created_ts DESC
), last_doc AS (
  SELECT DISTINCT ON (d.lead_id) d.lead_id, d.doc_id, d.processing_status
  FROM policy_document d WHERE d.deleted_ts IS NULL AND d.superseded_by IS NULL
  ORDER BY d.lead_id, d.uploaded_ts DESC
)
SELECT l.lead_id, l.first_name, l.pincode, l.city, l.state, l.mobile_verified, l.lead_state, l.priority,
       qa.situation, qa.members::text[] AS members, qa.eldest_age, qa.children_count, qa.parents_age_band, qa.sum_insured_band,
       qa.family_in_group_cover, qa.health_condition, qa.policy_age_band, qa.job_exit_cover, qa.room_rent_limit,
       qa.room_rent_note, qa.top_concern, qa.renewal_window, qa.personal_policy_besides_group, qa.start_timing,
       ls.session_id,
       lh.requested_action, lh.slot_start, lh.slot_end, lh.call_language, lh.topic, lh.note,
       ld.doc_id, ld.processing_status AS doc_status, pp.insurer_name, pp.product_name,
       cc.granted_ts AS contact_consent_ts, cc.notice_version AS contact_notice_version, cc.granted AS contact_granted
FROM lead l
LEFT JOIN last_session ls USING (lead_id)
LEFT JOIN quiz_answer qa ON qa.session_id = ls.session_id
LEFT JOIN last_handoff lh ON lh.lead_id = l.lead_id
LEFT JOIN last_doc ld ON ld.lead_id = l.lead_id
LEFT JOIN policy_profile pp ON pp.doc_id = ld.doc_id
LEFT JOIN consent_current cc ON cc.lead_id = l.lead_id AND cc.purpose = 'contact_call';

-- ------------------------------------------------------------------ funnel analytics
-- Journey "Measure" row: one count per stage per day and door.
CREATE VIEW funnel_daily AS
SELECT date_trunc('day', e.ts AT TIME ZONE 'Asia/Kolkata')::date AS day,
       s.door,
       count(DISTINCT e.lead_id) FILTER (WHERE e.name = 'link_clicked')       AS clicked,
       count(DISTINCT e.lead_id) FILTER (WHERE e.name = 'landing_viewed')     AS landed,
       count(DISTINCT e.lead_id) FILTER (WHERE e.name = 'quiz_started')       AS started,
       count(DISTINCT e.lead_id) FILTER (WHERE e.name = 'quiz_completed')     AS completed,
       count(DISTINCT e.lead_id) FILTER (WHERE e.name = 'readout_viewed')     AS readout,
       count(DISTINCT e.lead_id) FILTER (WHERE e.name = 'capture_submitted')  AS captured,
       count(DISTINCT e.lead_id) FILTER (WHERE e.name = 'call_requested')     AS call_requested,
       count(DISTINCT e.lead_id) FILTER (WHERE e.name = 'upload_completed')   AS uploaded,
       count(DISTINCT e.lead_id) FILTER (WHERE e.name = 'summary_sent')       AS summary_sent
FROM event e
LEFT JOIN LATERAL (SELECT door FROM source WHERE source.lead_id = e.lead_id ORDER BY first_click_ts LIMIT 1) s ON true
GROUP BY 1, 2;

-- Drop-off by screen (where incomplete sessions stopped).
CREATE VIEW screen_dropoff AS
SELECT path, last_screen_id, count(*) AS sessions,
       round(avg(total_time_sec)) AS avg_time_sec,
       round(avg(unsure_count), 2) AS avg_unsure
FROM quiz_session
WHERE completed_ts IS NULL
GROUP BY path, last_screen_id;

-- 60-second promise check.
CREATE VIEW quiz_timing AS
SELECT path,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY total_time_sec) AS p50_sec,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY total_time_sec) AS p90_sec,
       count(*) AS completed
FROM quiz_session WHERE completed_ts IS NOT NULL GROUP BY path;

-- ------------------------------------------------------------------ retention job
-- Marks expired documents deleted; the worker removes the object and its facts.
CREATE FUNCTION purge_expired_documents() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  WITH expired AS (
    UPDATE policy_document SET deleted_ts = now()
    WHERE deleted_ts IS NULL AND retention_until < now()
    RETURNING doc_id
  ), facts AS (
    DELETE FROM policy_fact WHERE doc_id IN (SELECT doc_id FROM expired)
  ), log AS (
    INSERT INTO document_access_log (doc_id, actor, action)
    SELECT doc_id, 'system:retention', 'delete' FROM expired
  )
  SELECT count(*) INTO n FROM expired;
  RETURN n;
END $$;

-- ------------------------------------------------------------------ roles (least privilege)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cover_check_app')   THEN CREATE ROLE cover_check_app NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cover_check_agent') THEN CREATE ROLE cover_check_agent NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cover_check_bi')    THEN CREATE ROLE cover_check_bi NOLOGIN; END IF;
END $$;

GRANT USAGE ON SCHEMA cover_check TO cover_check_app, cover_check_agent, cover_check_bi;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA cover_check TO cover_check_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA cover_check TO cover_check_app;
REVOKE UPDATE, DELETE ON consent, document_access_log FROM cover_check_app;

-- Agents read the queue and card, write outcomes. No raw documents, no condition tags.
GRANT SELECT ON agent_queue, lead_card_source, consent_current TO cover_check_agent;
GRANT SELECT ON finding, readout_rule TO cover_check_agent;
GRANT INSERT ON call_outcome TO cover_check_agent;
GRANT UPDATE (assigned_agent_id, closed_ts) ON handoff TO cover_check_agent;

-- BI sees aggregates only.
GRANT SELECT ON funnel_daily, screen_dropoff, quiz_timing TO cover_check_bi;

COMMIT;
