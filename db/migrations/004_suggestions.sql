-- Proposals are retained after review; accepted card IDs survive later card deletion.
CREATE TABLE suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_name text NOT NULL CHECK (length(author_name) BETWEEN 1 AND 100),
  author_kind text NOT NULL CHECK (author_kind IN ('local','session','token','proxy')),
  proposal jsonb NOT NULL CHECK (jsonb_typeof(proposal) = 'object'),
  reviewed_draft jsonb CHECK (jsonb_typeof(reviewed_draft) = 'object'),
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 4000),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','accepted','dismissed')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  accepted_card_id text UNIQUE,
  reviewed_by text CHECK (length(reviewed_by) BETWEEN 1 AND 100),
  reviewer_kind text CHECK (reviewer_kind IN ('local','session','proxy')),
  decision_note text NOT NULL DEFAULT '' CHECK (length(decision_note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CHECK ((state = 'pending' AND reviewed_at IS NULL AND accepted_card_id IS NULL)
    OR (state = 'accepted' AND reviewed_at IS NOT NULL AND accepted_card_id IS NOT NULL AND reviewed_by IS NOT NULL AND reviewer_kind IS NOT NULL)
    OR (state = 'dismissed' AND reviewed_at IS NOT NULL AND accepted_card_id IS NULL AND reviewed_by IS NOT NULL AND reviewer_kind IS NOT NULL))
);
CREATE INDEX suggestions_state_created ON suggestions (state, created_at DESC, id);
