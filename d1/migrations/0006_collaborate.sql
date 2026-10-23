-- Collaborate: project teams, versioned share agreements and jobs (PR6).
-- Money and shares are recorded here and never moved. Every role, ownership and state
-- rule is enforced inside the guarded write batches in lib/d1/collaborate.ts; these
-- constraints and triggers are the last line that a bad write cannot cross.

CREATE TABLE project_team (
  project_id TEXT NOT NULL REFERENCES personal_projects(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(internal_id),
  role TEXT NOT NULL CHECK (length(role) BETWEEN 1 AND 40 AND role = trim(role)),
  status TEXT NOT NULL CHECK (status IN ('invited','active','declined','left','removed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (project_id, account_id)
);
CREATE INDEX project_team_account_idx ON project_team(account_id);
CREATE TRIGGER project_team_not_owner BEFORE INSERT ON project_team
WHEN NEW.account_id = (SELECT owner_account_id FROM personal_projects WHERE id = NEW.project_id)
BEGIN SELECT RAISE(ABORT,'team_owner'); END;

-- One row per job. Claim, delivery, review and payment fields live inline.
CREATE TABLE jobs (
  id TEXT PRIMARY KEY NOT NULL,
  poster_account_id TEXT REFERENCES accounts(internal_id),
  poster_is_instructor INTEGER NOT NULL DEFAULT 0 CHECK (poster_is_instructor IN (0,1)),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80 AND title = trim(title)),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 2000 AND description = trim(description)),
  deliverable TEXT NOT NULL CHECK (deliverable IN ('pull_request','live_url','file_link')),
  window_days INTEGER NOT NULL CHECK (window_days BETWEEN 1 AND 30),
  money_usd INTEGER CHECK (money_usd IS NULL OR money_usd BETWEEN 1 AND 1000000),
  share_percent INTEGER CHECK (share_percent IS NULL OR share_percent BETWEEN 2 AND 100),
  -- No ON DELETE SET NULL check on share: a deleted product leaves the job without its project.
  project_id TEXT REFERENCES personal_projects(id) ON DELETE SET NULL,
  -- No foreign key: roadmap reorder deletes and reinserts milestone rows.
  milestone_id TEXT,
  skills TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(skills) AND json_type(skills) = 'array' AND json_array_length(skills) <= 5),
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','claimed','delivered','changes','accepted','paid','cancelled','disputed')),
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0,1)),
  claimant_account_id TEXT REFERENCES accounts(internal_id),
  claimed_at TEXT,
  locked_tier INTEGER CHECK (locked_tier IS NULL OR locked_tier IN (0,50,100)),
  first_delivered_at TEXT,
  delivered_at TEXT,
  delivery_url TEXT CHECK (delivery_url IS NULL OR (length(delivery_url) BETWEEN 9 AND 2048 AND lower(substr(delivery_url,1,8)) = 'https://')),
  delivery_note TEXT CHECK (delivery_note IS NULL OR length(delivery_note) BETWEEN 1 AND 1000),
  changes_at TEXT,
  change_rounds INTEGER NOT NULL DEFAULT 0 CHECK (change_rounds BETWEEN 0 AND 2),
  reject_count INTEGER NOT NULL DEFAULT 0 CHECK (reject_count BETWEEN 0 AND 1),
  accepted_at TEXT,
  final_tier INTEGER CHECK (final_tier IS NULL OR final_tier IN (0,50,100)),
  share_granted INTEGER CHECK (share_granted IS NULL OR share_granted BETWEEN 0 AND 100),
  paid_amount_usd INTEGER CHECK (paid_amount_usd IS NULL OR paid_amount_usd BETWEEN 0 AND 1000000),
  paid_on TEXT CHECK (paid_on IS NULL OR (length(paid_on) = 10 AND date(paid_on) = paid_on)),
  paid_note TEXT CHECK (paid_note IS NULL OR length(paid_note) BETWEEN 1 AND 500),
  paid_at TEXT,
  receipt_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  -- Exactly one poster: a Member account or the Instructor, who has no account row.
  CHECK ((poster_account_id IS NULL) = (poster_is_instructor = 1)),
  CHECK (money_usd IS NOT NULL OR share_percent IS NOT NULL),
  CHECK (share_percent IS NULL OR poster_is_instructor = 0),
  CHECK (claimant_account_id IS NULL OR poster_account_id IS NULL OR claimant_account_id <> poster_account_id),
  CHECK (state IN ('open','cancelled') OR (claimant_account_id IS NOT NULL AND claimed_at IS NOT NULL)),
  CHECK (state NOT IN ('delivered','changes') OR (delivered_at IS NOT NULL AND locked_tier IS NOT NULL)),
  CHECK (state NOT IN ('accepted','paid') OR final_tier IS NOT NULL)
);
CREATE INDEX jobs_poster_idx ON jobs(poster_account_id);
CREATE INDEX jobs_claimant_idx ON jobs(claimant_account_id);
CREATE INDEX jobs_project_idx ON jobs(project_id);
CREATE TRIGGER jobs_share_project_insert BEFORE INSERT ON jobs
WHEN NEW.share_percent IS NOT NULL AND (NEW.project_id IS NULL OR NEW.poster_account_id IS NOT
  (SELECT owner_account_id FROM personal_projects WHERE id = NEW.project_id))
BEGIN SELECT RAISE(ABORT,'share_project'); END;
CREATE TRIGGER jobs_share_project_update BEFORE UPDATE OF share_percent, project_id ON jobs
WHEN NEW.share_percent IS NOT NULL AND (NEW.share_percent IS NOT OLD.share_percent OR NEW.project_id IS NOT OLD.project_id)
  AND (NEW.project_id IS NULL AND NEW.share_percent IS NOT OLD.share_percent
    OR NEW.project_id IS NOT NULL AND NEW.poster_account_id IS NOT (SELECT owner_account_id FROM personal_projects WHERE id = NEW.project_id))
BEGIN SELECT RAISE(ABORT,'share_project'); END;
CREATE TRIGGER jobs_keep BEFORE DELETE ON jobs
BEGIN SELECT RAISE(ABORT,'jobs_are_kept'); END;

CREATE TABLE job_criteria (
  job_id TEXT NOT NULL REFERENCES jobs(id),
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 10),
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 200 AND text = trim(text)),
  PRIMARY KEY (job_id, position)
);

-- The audit trail. Rows are never changed or removed.
CREATE TABLE job_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  op TEXT NOT NULL UNIQUE,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  kind TEXT NOT NULL CHECK (kind IN ('posted','edited','cancelled','claimed','abandoned','released','expired',
    'claimant_left','poster_left','delivered','changes_requested','rejected','accepted','auto_accepted','paid',
    'receipt_confirmed','not_received','disputed','resolved','hidden','restored')),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('member','instructor','system')),
  actor_account_id TEXT REFERENCES accounts(internal_id),
  detail TEXT CHECK (detail IS NULL OR (json_valid(detail) AND length(detail) <= 6000)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK ((actor_kind = 'member') = (actor_account_id IS NOT NULL))
);
CREATE INDEX job_events_job_idx ON job_events(job_id, created_at, seq);
CREATE TRIGGER job_events_no_update BEFORE UPDATE ON job_events
BEGIN SELECT RAISE(ABORT,'job_events_immutable'); END;
CREATE TRIGGER job_events_no_delete BEFORE DELETE ON job_events
BEGIN SELECT RAISE(ABORT,'job_events_immutable'); END;

-- Versioned share agreements. Version N is per project. Only one pending and one active.
CREATE TABLE share_agreements (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES personal_projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','superseded','declined','replaced')),
  source TEXT NOT NULL CHECK (source IN ('proposal','job')),
  job_id TEXT REFERENCES jobs(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  activated_at TEXT,
  closed_at TEXT,
  CHECK ((source = 'job') = (job_id IS NOT NULL)),
  CHECK (status NOT IN ('active','superseded') OR activated_at IS NOT NULL),
  UNIQUE (project_id, version)
);
CREATE UNIQUE INDEX share_agreements_one_pending ON share_agreements(project_id) WHERE status = 'pending';
CREATE UNIQUE INDEX share_agreements_one_active ON share_agreements(project_id) WHERE status = 'active';
CREATE TRIGGER share_agreements_insert BEFORE INSERT ON share_agreements
WHEN NEW.status <> 'pending'
BEGIN SELECT RAISE(ABORT,'agreement_starts_pending'); END;
CREATE TRIGGER share_agreements_fixed BEFORE UPDATE OF id, project_id, version, source, job_id, created_at ON share_agreements
BEGIN SELECT RAISE(ABORT,'agreement_immutable'); END;
CREATE TRIGGER share_agreements_transition BEFORE UPDATE OF status ON share_agreements
WHEN NEW.status <> OLD.status AND NOT ((OLD.status = 'pending' AND NEW.status IN ('active','declined','replaced'))
  OR (OLD.status = 'active' AND NEW.status = 'superseded'))
BEGIN SELECT RAISE(ABORT,'agreement_transition'); END;
-- Activation needs lines that total 100, and for a proposal every listed person's acceptance.
-- A proposal activates only when everyone listed accepted, and everyone (still approved) whose line it drops or
-- lowers against the previous active version accepted too. Job grants only move the poster's own line.
CREATE TRIGGER share_agreements_activation BEFORE UPDATE OF status ON share_agreements
WHEN NEW.status = 'active' AND OLD.status = 'pending' AND (
  coalesce((SELECT sum(percent) FROM share_agreement_lines WHERE agreement_id = NEW.id), 0) <> 100
  OR (NEW.source = 'proposal' AND EXISTS (SELECT 1 FROM share_agreement_lines l WHERE l.agreement_id = NEW.id
    AND NOT EXISTS (SELECT 1 FROM share_agreement_acceptances c WHERE c.agreement_id = NEW.id
      AND c.account_id = l.account_id AND c.decision = 'accepted')))
  OR (NEW.source = 'proposal' AND EXISTS (SELECT 1 FROM share_agreement_lines ol JOIN accounts acc ON acc.internal_id = ol.account_id AND acc.status = 'approved'
    WHERE ol.agreement_id = (SELECT pa.id FROM share_agreements pa WHERE pa.project_id = NEW.project_id AND pa.id <> NEW.id
      AND pa.activated_at IS NOT NULL ORDER BY pa.version DESC LIMIT 1)
    AND ol.percent > coalesce((SELECT nl.percent FROM share_agreement_lines nl WHERE nl.agreement_id = NEW.id AND nl.account_id = ol.account_id), 0)
    AND NOT EXISTS (SELECT 1 FROM share_agreement_acceptances c WHERE c.agreement_id = NEW.id
      AND c.account_id = ol.account_id AND c.decision = 'accepted'))))
BEGIN SELECT RAISE(ABORT,'agreement_not_ready'); END;
CREATE TRIGGER share_agreements_closed_delete BEFORE DELETE ON share_agreements
WHEN EXISTS (SELECT 1 FROM personal_projects WHERE id = OLD.project_id)
BEGIN SELECT RAISE(ABORT,'agreement_history_kept'); END;

CREATE TABLE share_agreement_lines (
  agreement_id TEXT NOT NULL REFERENCES share_agreements(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(internal_id),
  role TEXT NOT NULL CHECK (length(role) BETWEEN 1 AND 40 AND role = trim(role)),
  percent INTEGER NOT NULL CHECK (percent BETWEEN 1 AND 100),
  brings TEXT CHECK (brings IS NULL OR (length(brings) BETWEEN 1 AND 200 AND brings = trim(brings))),
  PRIMARY KEY (agreement_id, account_id)
);
CREATE TRIGGER share_lines_pending_only BEFORE INSERT ON share_agreement_lines
WHEN (SELECT status FROM share_agreements WHERE id = NEW.agreement_id) IS NOT 'pending'
BEGIN SELECT RAISE(ABORT,'agreement_lines_fixed'); END;
CREATE TRIGGER share_lines_no_update BEFORE UPDATE ON share_agreement_lines
BEGIN SELECT RAISE(ABORT,'agreement_lines_fixed'); END;
CREATE TRIGGER share_lines_no_delete BEFORE DELETE ON share_agreement_lines
WHEN EXISTS (SELECT 1 FROM share_agreements WHERE id = OLD.agreement_id)
BEGIN SELECT RAISE(ABORT,'agreement_lines_fixed'); END;

CREATE TABLE share_agreement_acceptances (
  agreement_id TEXT NOT NULL REFERENCES share_agreements(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(internal_id),
  decision TEXT NOT NULL CHECK (decision IN ('accepted','declined')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (agreement_id, account_id)
);
-- Listed people answer, and so do holders of the current active version (their line may drop or shrink).
CREATE TRIGGER share_acceptances_listed BEFORE INSERT ON share_agreement_acceptances
WHEN (NOT EXISTS (SELECT 1 FROM share_agreement_lines WHERE agreement_id = NEW.agreement_id AND account_id = NEW.account_id)
    AND NOT EXISTS (SELECT 1 FROM share_agreement_lines ol JOIN share_agreements oa ON oa.id = ol.agreement_id
      WHERE oa.status = 'active' AND oa.project_id = (SELECT project_id FROM share_agreements WHERE id = NEW.agreement_id)
      AND ol.account_id = NEW.account_id))
  OR (SELECT status FROM share_agreements WHERE id = NEW.agreement_id) IS NOT 'pending'
BEGIN SELECT RAISE(ABORT,'acceptance_not_listed'); END;
CREATE TRIGGER share_acceptances_no_update BEFORE UPDATE ON share_agreement_acceptances
BEGIN SELECT RAISE(ABORT,'acceptances_immutable'); END;
CREATE TRIGGER share_acceptances_no_delete BEFORE DELETE ON share_agreement_acceptances
WHEN EXISTS (SELECT 1 FROM share_agreements WHERE id = OLD.agreement_id)
BEGIN SELECT RAISE(ABORT,'acceptances_immutable'); END;

-- Derived job state. No cron: time and membership decide it at read and write time,
-- so expiry, auto-acceptance and revoked claimants also show in read-only mode.
CREATE VIEW job_state AS
SELECT j.*,
  CASE
    WHEN j.state IN ('claimed','changes') AND coalesce(c.status,'') <> 'approved' THEN 'open'
    WHEN j.state = 'claimed' AND julianday('now') > julianday(j.claimed_at) + 2 * j.window_days THEN 'open'
    WHEN j.state = 'changes' AND julianday('now') > max(julianday(j.claimed_at) + 2 * j.window_days, julianday(j.changes_at) + 3) THEN 'open'
    WHEN j.state = 'delivered' AND julianday('now') > julianday(j.delivered_at) + 7 THEN 'accepted'
    WHEN j.state = 'open' AND j.poster_is_instructor = 0 AND coalesce(p.status,'') <> 'approved' THEN 'cancelled'
    ELSE j.state END AS effective_state,
  CASE
    WHEN j.state IN ('claimed','changes') AND coalesce(c.status,'') <> 'approved' THEN 'claimant_left'
    WHEN j.state = 'claimed' AND julianday('now') > julianday(j.claimed_at) + 2 * j.window_days THEN 'expired'
    WHEN j.state = 'changes' AND julianday('now') > max(julianday(j.claimed_at) + 2 * j.window_days, julianday(j.changes_at) + 3) THEN 'expired'
    WHEN j.state = 'delivered' AND julianday('now') > julianday(j.delivered_at) + 7 THEN 'auto_accepted'
    WHEN j.state = 'open' AND j.poster_is_instructor = 0 AND coalesce(p.status,'') <> 'approved' THEN 'poster_left'
    END AS lapse,
  CASE
    WHEN j.state IN ('claimed','changes') AND coalesce(c.status,'') <> 'approved' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHEN j.state = 'claimed' AND julianday('now') > julianday(j.claimed_at) + 2 * j.window_days
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', julianday(j.claimed_at) + 2 * j.window_days)
    WHEN j.state = 'changes' AND julianday('now') > max(julianday(j.claimed_at) + 2 * j.window_days, julianday(j.changes_at) + 3)
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', max(julianday(j.claimed_at) + 2 * j.window_days, julianday(j.changes_at) + 3))
    WHEN j.state = 'delivered' AND julianday('now') > julianday(j.delivered_at) + 7
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', julianday(j.delivered_at) + 7)
    WHEN j.state = 'open' AND j.poster_is_instructor = 0 AND coalesce(p.status,'') <> 'approved' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now')
    END AS lapse_at
FROM jobs j
LEFT JOIN accounts c ON c.internal_id = j.claimant_account_id
LEFT JOIN accounts p ON p.internal_id = j.poster_account_id;
