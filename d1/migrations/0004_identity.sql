-- Set once by the operator after verifying the account and D1 binding.
-- Deployments never create or change destination identity.
CREATE TABLE deployment_identity (
  singleton INTEGER PRIMARY KEY NOT NULL DEFAULT 1 CHECK (singleton = 1),
  account_id TEXT NOT NULL CHECK (length(account_id) = 32 AND account_id NOT GLOB '*[^a-f0-9]*'),
  database_id TEXT NOT NULL CHECK (length(database_id) = 36 AND database_id NOT GLOB '*[^a-f0-9-]*'),
  environment_id TEXT NOT NULL CHECK (length(environment_id) BETWEEN 1 AND 100 AND environment_id NOT GLOB '*[^a-z0-9_-]*'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TRIGGER deployment_identity_immutable BEFORE UPDATE ON deployment_identity
BEGIN SELECT RAISE(ABORT,'destination_identity_immutable'); END;
CREATE TRIGGER deployment_identity_required BEFORE DELETE ON deployment_identity
BEGIN SELECT RAISE(ABORT,'destination_identity_required'); END;
