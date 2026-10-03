-- Telecaller sheet export: remember which hand-offs went out in which batch,
-- so a second export the same day does not hand the same person to two telecallers.
BEGIN;
SET search_path = cover_check, public;

ALTER TABLE handoff ADD COLUMN exported_ts  timestamptz;
ALTER TABLE handoff ADD COLUMN export_batch text;
CREATE INDEX handoff_unexported_idx ON handoff (priority, sla_due_ts)
  WHERE closed_ts IS NULL AND queue IS NOT NULL AND exported_ts IS NULL;

GRANT UPDATE (exported_ts, export_batch) ON handoff TO cover_check_agent;
COMMIT;
