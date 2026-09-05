CREATE TABLE board_revision (
  id integer PRIMARY KEY CHECK (id = 1),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
INSERT INTO board_revision (id) VALUES (1);

CREATE TABLE cards (
  id text PRIMARY KEY,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 10000),
  column_id text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  parent_id text REFERENCES cards(id) DEFERRABLE INITIALLY DEFERRED,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (parent_id IS DISTINCT FROM id)
);
CREATE INDEX cards_column_position ON cards(column_id, position);
CREATE INDEX cards_parent ON cards(parent_id);

CREATE TABLE card_dependencies (
  card_id text NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  dependency_id text NOT NULL REFERENCES cards(id) DEFERRABLE INITIALLY DEFERRED,
  position integer NOT NULL,
  PRIMARY KEY (card_id, dependency_id),
  CHECK (card_id <> dependency_id)
);
CREATE INDEX card_dependencies_target ON card_dependencies(dependency_id);

CREATE TABLE card_comments (
  id text PRIMARY KEY,
  card_id text NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 10000),
  author text NOT NULL CHECK (length(btrim(author)) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL
);
CREATE INDEX card_comments_card ON card_comments(card_id, created_at, id);
