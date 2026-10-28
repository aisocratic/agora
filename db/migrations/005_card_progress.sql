-- A card's measured outcome, e.g. 32 accounts found out of 100. It lives in the
-- card's metadata like the other optional task fields; this keeps every writer,
-- not only the API, to the shape lib/goal-progress.ts validates:
-- { label: 1-80 characters, current: whole 0..total, total: whole 1..2^53-1 }.
ALTER TABLE cards ADD CONSTRAINT cards_progress_check CHECK (
  CASE
    WHEN jsonb_typeof(metadata->'progress') IS NULL OR jsonb_typeof(metadata->'progress') = 'null' THEN true
    WHEN jsonb_typeof(metadata->'progress') <> 'object' THEN false
    WHEN NOT ((metadata->'progress') ?& ARRAY['label', 'current', 'total']) OR (metadata->'progress') - 'label' - 'current' - 'total' <> '{}'::jsonb THEN false
    WHEN jsonb_typeof(metadata->'progress'->'label') <> 'string'
      OR jsonb_typeof(metadata->'progress'->'current') <> 'number'
      OR jsonb_typeof(metadata->'progress'->'total') <> 'number' THEN false
    ELSE length(btrim(metadata->'progress'->>'label')) BETWEEN 1 AND 80
      AND (metadata->'progress'->>'current')::numeric >= 0
      AND (metadata->'progress'->>'total')::numeric > 0
      AND (metadata->'progress'->>'current')::numeric <= (metadata->'progress'->>'total')::numeric
      AND (metadata->'progress'->>'total')::numeric <= 9007199254740991
      AND trunc((metadata->'progress'->>'current')::numeric) = (metadata->'progress'->>'current')::numeric
      AND trunc((metadata->'progress'->>'total')::numeric) = (metadata->'progress'->>'total')::numeric
  END
);
