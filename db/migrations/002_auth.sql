CREATE TABLE auth_sessions (
  id_hash text PRIMARY KEY,
  name text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE auth_login_attempts (
  key text PRIMARY KEY,
  started_at timestamptz NOT NULL,
  attempts integer NOT NULL
);
