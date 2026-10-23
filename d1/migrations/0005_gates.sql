-- One row per member per gate item they ticked. Item ids come from the course manifest and stay frozen after publish.
CREATE TABLE gate_checks (
  account_id TEXT NOT NULL REFERENCES accounts(internal_id),
  session_no INTEGER NOT NULL CHECK (typeof(session_no) = 'integer' AND session_no BETWEEN 1 AND 30),
  item_id TEXT NOT NULL CHECK (length(item_id) BETWEEN 1 AND 40 AND item_id NOT GLOB '*[^a-z0-9-]*'),
  state TEXT NOT NULL CHECK (state IN ('done','needs_work')),
  proof_url TEXT NULL CHECK (proof_url IS NULL OR (proof_url LIKE 'https://%' AND length(proof_url) <= 512)),
  note TEXT NULL CHECK (note IS NULL OR length(note) <= 500),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (account_id, session_no, item_id)
);
