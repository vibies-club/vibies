-- Deployment code may read this singleton but must never activate a database.
CREATE TABLE deployment_activation (
  singleton INTEGER PRIMARY KEY NOT NULL DEFAULT 1 CHECK (singleton = 1),
  state TEXT NOT NULL DEFAULT 'disabled' CHECK (state IN ('disabled','reconciled','active')),
  environment_id TEXT,
  snapshot_hash TEXT,
  reconciled_at TEXT,
  activated_at TEXT,
  CHECK (state = 'disabled' OR (environment_id IS NOT NULL AND snapshot_hash IS NOT NULL AND reconciled_at IS NOT NULL)),
  CHECK (state <> 'active' OR activated_at IS NOT NULL)
);
INSERT INTO deployment_activation(singleton) VALUES (1);
CREATE TRIGGER deployment_activation_transition BEFORE UPDATE OF state ON deployment_activation
WHEN NEW.state <> OLD.state AND NOT ((OLD.state = 'disabled' AND NEW.state = 'reconciled') OR (OLD.state = 'reconciled' AND NEW.state = 'active'))
BEGIN SELECT RAISE(ABORT,'invalid_activation_transition'); END;
CREATE TRIGGER deployment_activation_keep BEFORE DELETE ON deployment_activation
BEGIN SELECT RAISE(ABORT,'activation_record_required'); END;
