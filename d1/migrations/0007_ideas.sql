-- Collaborate: ideas, interest, comments and project funding. Money is recorded, never moved.

CREATE TABLE ideas (
  id TEXT PRIMARY KEY NOT NULL,
  author_account_id TEXT NOT NULL REFERENCES accounts(internal_id),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80 AND title = trim(title)),
  problem TEXT NOT NULL CHECK (length(problem) BETWEEN 1 AND 2000 AND problem = trim(problem)),
  audience TEXT NOT NULL CHECK (length(audience) BETWEEN 1 AND 200 AND audience = trim(audience)),
  help TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(help) AND json_type(help) = 'array' AND json_array_length(help) <= 5),
  stage TEXT NOT NULL CHECK (stage IN ('idea','exploring','building')),
  project_id TEXT REFERENCES personal_projects(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  activity_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE INDEX ideas_activity_idx ON ideas(activity_at DESC, id);
CREATE TRIGGER ideas_help_values BEFORE INSERT ON ideas
WHEN EXISTS (SELECT 1 FROM json_each(NEW.help) WHERE value NOT IN ('cofounder','designer','builder','tester','funding'))
BEGIN SELECT RAISE(ABORT,'idea_help'); END;
CREATE TRIGGER ideas_help_values_update BEFORE UPDATE OF help ON ideas
WHEN EXISTS (SELECT 1 FROM json_each(NEW.help) WHERE value NOT IN ('cofounder','designer','builder','tester','funding'))
BEGIN SELECT RAISE(ABORT,'idea_help'); END;
-- An idea links only to a product its author owns. A cascade to NULL is always allowed.
CREATE TRIGGER ideas_project_owner BEFORE UPDATE OF project_id ON ideas
WHEN NEW.project_id IS NOT NULL AND NEW.project_id IS NOT OLD.project_id
  AND NEW.author_account_id IS NOT (SELECT owner_account_id FROM personal_projects WHERE id = NEW.project_id)
BEGIN SELECT RAISE(ABORT,'idea_project'); END;
CREATE TRIGGER ideas_project_owner_insert BEFORE INSERT ON ideas
WHEN NEW.project_id IS NOT NULL
BEGIN SELECT RAISE(ABORT,'idea_project'); END;
CREATE TRIGGER ideas_fixed BEFORE UPDATE OF id, author_account_id, created_at ON ideas
BEGIN SELECT RAISE(ABORT,'idea_immutable'); END;
CREATE TRIGGER ideas_keep BEFORE DELETE ON ideas
BEGIN SELECT RAISE(ABORT,'ideas_are_kept'); END;

CREATE TABLE idea_interest (
  idea_id TEXT NOT NULL REFERENCES ideas(id),
  account_id TEXT NOT NULL REFERENCES accounts(internal_id),
  role TEXT NOT NULL CHECK (length(role) BETWEEN 1 AND 40 AND role = trim(role)),
  note TEXT CHECK (note IS NULL OR (length(note) BETWEEN 1 AND 500 AND note = trim(note))),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (idea_id, account_id)
);
CREATE TRIGGER idea_interest_not_author BEFORE INSERT ON idea_interest
WHEN NEW.account_id = (SELECT author_account_id FROM ideas WHERE id = NEW.idea_id)
BEGIN SELECT RAISE(ABORT,'interest_author'); END;

-- Generic comments. Only ideas take comments today; 'project' is reserved for later.
CREATE TABLE comments (
  id TEXT PRIMARY KEY NOT NULL,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('idea','project')),
  target_id TEXT NOT NULL,
  author_account_id TEXT REFERENCES accounts(internal_id),
  author_is_instructor INTEGER NOT NULL DEFAULT 0 CHECK (author_is_instructor IN (0,1)),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000 AND body = trim(body)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK ((author_account_id IS NULL) = (author_is_instructor = 1))
);
CREATE INDEX comments_target_idx ON comments(target_kind, target_id, created_at);
CREATE TRIGGER comments_idea_exists BEFORE INSERT ON comments
WHEN NEW.target_kind = 'idea' AND NOT EXISTS (SELECT 1 FROM ideas WHERE id = NEW.target_id)
BEGIN SELECT RAISE(ABORT,'comment_target'); END;
CREATE TRIGGER comments_no_update BEFORE UPDATE ON comments
BEGIN SELECT RAISE(ABORT,'comments_immutable'); END;
CREATE TRIGGER comments_no_delete BEFORE DELETE ON comments
BEGIN SELECT RAISE(ABORT,'comments_immutable'); END;

CREATE TABLE project_funding (
  project_id TEXT PRIMARY KEY NOT NULL REFERENCES personal_projects(id) ON DELETE CASCADE,
  seeking INTEGER NOT NULL CHECK (seeking IN (0,1)),
  goal_usd INTEGER CHECK (goal_usd IS NULL OR goal_usd BETWEEN 1 AND 1000000),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (seeking = 0 OR goal_usd IS NOT NULL)
);

CREATE TABLE pledges (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES personal_projects(id) ON DELETE CASCADE,
  pledger_account_id TEXT REFERENCES accounts(internal_id),
  pledger_is_instructor INTEGER NOT NULL DEFAULT 0 CHECK (pledger_is_instructor IN (0,1)),
  amount_usd INTEGER NOT NULL CHECK (amount_usd BETWEEN 1 AND 1000000),
  note TEXT CHECK (note IS NULL OR (length(note) BETWEEN 1 AND 500 AND note = trim(note))),
  status TEXT NOT NULL DEFAULT 'pledged' CHECK (status IN ('pledged','received','withdrawn')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  closed_at TEXT,
  CHECK ((pledger_account_id IS NULL) = (pledger_is_instructor = 1)),
  CHECK ((status = 'pledged') = (closed_at IS NULL))
);
CREATE INDEX pledges_project_idx ON pledges(project_id, created_at);
CREATE TRIGGER pledges_not_owner BEFORE INSERT ON pledges
WHEN NEW.pledger_account_id IS NOT NULL AND NEW.pledger_account_id = (SELECT owner_account_id FROM personal_projects WHERE id = NEW.project_id)
BEGIN SELECT RAISE(ABORT,'pledge_owner'); END;
CREATE TRIGGER pledges_seeking BEFORE INSERT ON pledges
WHEN NOT EXISTS (SELECT 1 FROM project_funding WHERE project_id = NEW.project_id AND seeking = 1)
BEGIN SELECT RAISE(ABORT,'pledge_not_seeking'); END;
CREATE TRIGGER pledges_fixed BEFORE UPDATE OF id, project_id, pledger_account_id, pledger_is_instructor, amount_usd, note, created_at ON pledges
BEGIN SELECT RAISE(ABORT,'pledge_immutable'); END;
CREATE TRIGGER pledges_transition BEFORE UPDATE OF status ON pledges
WHEN NEW.status <> OLD.status AND NOT (OLD.status = 'pledged' AND NEW.status IN ('received','withdrawn'))
BEGIN SELECT RAISE(ABORT,'pledge_transition'); END;
CREATE TRIGGER pledges_keep BEFORE DELETE ON pledges
WHEN EXISTS (SELECT 1 FROM personal_projects WHERE id = OLD.project_id)
BEGIN SELECT RAISE(ABORT,'pledges_are_kept'); END;
