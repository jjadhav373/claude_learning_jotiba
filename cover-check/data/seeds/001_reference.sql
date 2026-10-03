-- Reference data: notice texts (DRAFT — compliance to sign off), readout rules R1–R8, demo pincodes.
SET search_path = cover_check, public;

INSERT INTO notice_version (notice_version, notice_language, purpose, body) VALUES
 ('v1','en','save_answers',     'We save your answers to build your summary. We do not share them with insurers.'),
 ('v1','en','whatsapp_summary', 'We save your answers and send the summary to this number. A call is never part of this step.'),
 ('v1','en','contact_call',     'Turtlemint can call me on {masked_mobile} in this slot.'),
 ('v1','en','read_document',    'I allow Turtlemint to read this document to prepare my summary.')
ON CONFLICT DO NOTHING;

INSERT INTO readout_rule (rule_id, rule_version, category, severity, body) VALUES
 ('R1','v1-2026-10-03','room_rent','review','Some policies limit room rent, and that can reduce what is paid on the whole bill, not only the room. Check the room rent line in your policy.'),
 ('R2','v1-2026-10-03','renewal','review','Your renewal is close. It is a good time to read what changed since last year.'),
 ('R3','v1-2026-10-03','waiting','ask','Existing conditions usually have a waiting period before they are covered. Check yours.'),
 ('R4','v1-2026-10-03','other','review','Company cover usually ends when the job does. Check what you would have after that.'),
 ('R5','v1-2026-10-03','family','ask','Your family may not be covered under your company policy. Check who is.'),
 ('R6','v1-2026-10-03','waiting','ask','Cover for parents above 60 can have different waiting periods and limits. Check these.'),
 ('R7','v1-2026-10-03','sum_insured','ask','Not knowing your cover amount is common. It is printed on your policy schedule.'),
 ('R8','v1-2026-10-03','other','ask','You marked this as not sure. It is worth finding out.')
ON CONFLICT DO NOTHING;

-- Demo rows; load the full India Post directory in production.
INSERT INTO pincode_directory (pincode, city, state) VALUES
 ('400001','Mumbai','Maharashtra'), ('400070','Mumbai','Maharashtra'), ('411001','Pune','Maharashtra'),
 ('411038','Pune','Maharashtra'), ('440001','Nagpur','Maharashtra'), ('110001','New Delhi','Delhi'),
 ('560001','Bengaluru','Karnataka'), ('600001','Chennai','Tamil Nadu'), ('500001','Hyderabad','Telangana'),
 ('700001','Kolkata','West Bengal'), ('380001','Ahmedabad','Gujarat'), ('302001','Jaipur','Rajasthan')
ON CONFLICT DO NOTHING;
