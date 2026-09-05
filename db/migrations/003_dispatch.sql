CREATE TABLE dispatches (
  id uuid PRIMARY KEY,
  idempotency_key text UNIQUE NOT NULL,
  card_id text NOT NULL,
  revision bigint NOT NULL,
  principal text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','succeeded','disabled','uncertain')),
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(card_id, revision)
);
