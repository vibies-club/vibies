import { nickname, validToken } from '../access-core.ts';
import { projectId, projectVersion } from '../project-core.ts';
import { httpsUrl, isoDate, text, type AgreementLine, type JobTerms } from '../collab-core.ts';
import type { AccessDatabase, D1Result, D1Statement } from './access.ts';

// Every rule below is decided inside the write batch that applies it (one D1 transaction).
// Batches are chained by a fresh nonce: the first guarded write records it, later writes
// require it, so a failed guard leaves every statement at zero rows.
const now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const fresh = "julianday(s.created_at) > julianday('now','-24 hours')";
const me = `(SELECT a.internal_id FROM sessions s JOIN accounts a ON a.github_id=s.github_id
  WHERE s.session_hash=?1 AND ${fresh} AND a.status='approved')`;
const instructor = `EXISTS (SELECT 1 FROM sessions s JOIN community c ON c.instructor_github_id=s.github_id
  WHERE s.session_hash=?1 AND c.singleton=1 AND ${fresh})`;
const actor = `(${me} IS NOT NULL OR ${instructor})`;
const isPoster = `(j.poster_account_id=${me} OR (j.poster_is_instructor=1 AND ${instructor}))`;
const isClaimant = `(j.claimant_account_id IS NOT NULL AND j.claimant_account_id=${me})`;
const visibleProject = "p.publication='Published' AND p.connection='Connected' AND p.moderation='Visible'";
const bool = (sql: string) => `json(CASE WHEN ${sql} THEN 'true' ELSE 'false' END)`;
const instructorName = "(SELECT instructor_nickname FROM community WHERE singleton=1)";

type Kind = { kind: string };
type Row = Record<string, unknown>;
function rows<T>(result: D1Result<T>): T[] {
  if (!result.success) throw new Error('Collaborate unavailable');
  return result.results;
}
function statements(db: AccessDatabase, args: unknown[]) {
  return (sql: string) => {
    const count = Math.max(0, ...Array.from(sql.matchAll(/\?(\d+)/g), match => Number(match[1])));
    return db.prepare(sql).bind(...args.slice(0, count));
  };
}
const uuid = (value: unknown): value is string => projectId(value);

/** The poster's current line on a product: their active percent, or 100 when no agreement exists yet. */
const lineOf = (project: string, account: string) => `(SELECT CASE WHEN a.id IS NULL THEN 100 ELSE coalesce((SELECT l.percent
  FROM share_agreement_lines l WHERE l.agreement_id=a.id AND l.account_id=${account}),0) END
  FROM (SELECT 1) LEFT JOIN share_agreements a ON a.project_id=${project} AND a.status='active')`;

// Job terms bind at ?6..?15 for both post and edit.
const termsCheck = `
  WHEN ?11 IS NOT NULL AND (${me} IS NULL OR ?12 IS NULL) THEN 'invalid'
  WHEN ?12 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM personal_projects p WHERE p.id=?12
    AND (p.owner_account_id=${me} OR (${me} IS NULL AND ${instructor} AND ${visibleProject}))) THEN 'invalid'
  WHEN ?13 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM project_milestones WHERE id=?13 AND project_id=?12) THEN 'invalid'
  WHEN ?11 IS NOT NULL AND ${lineOf('?12', me)} < ?11 THEN 'insufficient_share'`;
function termArgs(t: JobTerms) {
  return [t.title, t.description, t.deliverable, t.windowDays, t.money, t.share, t.projectId, t.milestoneId,
    JSON.stringify(t.skills), JSON.stringify(t.criteria)];
}
const claimReset = `claimant_account_id=NULL,claimed_at=NULL,locked_tier=NULL,first_delivered_at=NULL,delivered_at=NULL,
  delivery_url=NULL,delivery_note=NULL,changes_at=NULL,change_rounds=0,reject_count=0,accepted_at=NULL,final_tier=NULL,
  share_granted=NULL,paid_amount_usd=NULL,paid_on=NULL,paid_note=NULL,paid_at=NULL,receipt_at=NULL`;

/** Tier for a delivery made now. A resubmission within 3 days of a change request keeps the locked tier. */
const tierNow = (t: string) => `CASE WHEN ${t}.state='changes' AND julianday('now') <= julianday(${t}.changes_at)+3 THEN ${t}.locked_tier
  WHEN julianday('now') <= julianday(${t}.claimed_at)+${t}.window_days THEN 100
  WHEN julianday('now') <= julianday(${t}.claimed_at)+2*${t}.window_days THEN 50 ELSE 0 END`;

/** Share-paid jobs pay from the poster's own line. Version N+1 activates at once; nobody else's line changes. */
function shareGrant(agreement: string) {
  const job = (column: string) => `(SELECT ${column} FROM jobs WHERE id=?2)`;
  const P = job('project_id'), G = job('share_granted'), poster = job('poster_account_id'), claimant = job('claimant_account_id');
  const ready = `EXISTS (SELECT 1 FROM job_events WHERE op=?4) AND ${G} > 0 AND ${P} IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM share_agreements WHERE job_id=?2)`;
  const made = `EXISTS (SELECT 1 FROM share_agreements WHERE id=${agreement})`;
  const delta = `- CASE WHEN l.account_id=${poster} THEN ${G} ELSE 0 END + CASE WHEN l.account_id=${claimant} THEN ${G} ELSE 0 END`;
  const active = `SELECT 1 FROM share_agreements WHERE project_id=${P} AND status='active'`;
  return [
    `UPDATE share_agreements SET status='replaced',closed_at=${now} WHERE project_id=${P} AND status='pending' AND ${ready}`,
    `INSERT INTO share_agreements(id,project_id,version,source,job_id) SELECT ${agreement},${P},
      (SELECT coalesce(max(version),0)+1 FROM share_agreements WHERE project_id=${P}),'job',?2 WHERE ${ready}`,
    `INSERT INTO share_agreement_lines(agreement_id,account_id,role,percent,brings)
      SELECT ${agreement},l.account_id,l.role,l.percent ${delta},l.brings FROM share_agreement_lines l
      JOIN share_agreements a ON a.id=l.agreement_id WHERE a.project_id=${P} AND a.status='active' AND ${made} AND l.percent ${delta} > 0`,
    `INSERT INTO share_agreement_lines(agreement_id,account_id,role,percent,brings)
      SELECT ${agreement},${poster},'Owner',100-${G},NULL WHERE ${made} AND NOT EXISTS (${active}) AND 100-${G} > 0`,
    `INSERT INTO share_agreement_lines(agreement_id,account_id,role,percent,brings)
      SELECT ${agreement},${claimant},coalesce((SELECT role FROM project_team WHERE project_id=${P} AND account_id=${claimant} AND status='active'),'Job contributor'),
      ${G},'Job: '||${job('title')} WHERE ${made} AND NOT EXISTS (SELECT 1 FROM share_agreement_lines l JOIN share_agreements a ON a.id=l.agreement_id
      WHERE a.project_id=${P} AND a.status='active' AND l.account_id=${claimant})`,
    `UPDATE share_agreements SET status='superseded',closed_at=${now} WHERE project_id=${P} AND status='active' AND ${made}`,
    `UPDATE share_agreements SET status='active',activated_at=${now} WHERE id=${agreement} AND status='pending'`,
    `INSERT INTO project_team(project_id,account_id,role,status) SELECT ${P},${claimant},'Job contributor','active' WHERE ${made}
      ON CONFLICT(project_id,account_id) DO UPDATE SET status='active',updated_at=${now}`,
  ];
}

type JobSpec = {
  success: string;
  role: string;                  // SQL condition on j (job_state) and the session
  states: readonly string[];     // allowed effective states
  taken?: boolean;               // report a state mismatch as 'taken' before 'stale'
  extra?: string;                // more WHEN ... THEN clauses
  event: string;                 // SQL for the event kind
  detail?: string;               // SQL for the event detail JSON
  set: string;                   // assignments on jobs
  params?: unknown[];            // bound from ?6
  after?: string[];              // statements that must follow the update, chained on the nonce
  materialize?: boolean;         // record a pending lapse (expiry, auto-acceptance) before this event
  hiddenOk?: boolean;
};

async function jobAction(db: AccessDatabase, hash: string | null, id: unknown, version: unknown, spec: JobSpec): Promise<Kind> {
  if (!validToken(hash) || !uuid(id) || !projectVersion(version)) return { kind: 'invalid' };
  const op = crypto.randomUUID();
  const stmt = statements(db, [hash, id.toLowerCase(), version, op, crypto.randomUUID(), ...(spec.params ?? [])]);
  const states = spec.states.map(state => `'${state}'`).join(',');
  const decision = `SELECT CASE
    WHEN NOT ${actor} THEN 'forbidden'
    WHEN j.id IS NULL THEN 'missing'
    ${spec.hiddenOk ? '' : `WHEN j.hidden=1 AND NOT ${instructor} THEN 'hidden_job'`}
    WHEN NOT coalesce((${spec.role}),0) THEN 'forbidden'
    ${spec.taken ? `WHEN j.effective_state NOT IN (${states}) THEN 'taken'` : ''}
    WHEN j.version<>CAST(?3 AS INTEGER) THEN 'stale'
    WHEN j.effective_state NOT IN (${states}) THEN 'invalid'
    ${spec.extra ?? ''}
    ELSE 'ok' END kind FROM (SELECT 1) LEFT JOIN job_state j ON j.id=?2`;
  const allowed = `(SELECT kind FROM (${decision}))='ok'`;
  const queries = [stmt(decision)];
  if (spec.materialize !== false) queries.push(stmt(`INSERT INTO job_events(op,job_id,kind,actor_kind,actor_account_id,created_at)
    SELECT ?5,j.id,j.lapse,'system',NULL,j.lapse_at FROM job_state j WHERE j.id=?2 AND j.lapse IS NOT NULL AND ${allowed}`));
  queries.push(stmt(`INSERT INTO job_events(op,job_id,kind,actor_kind,actor_account_id,detail)
    SELECT ?4,j.id,${spec.event},CASE WHEN ${me} IS NOT NULL THEN 'member' ELSE 'instructor' END,${me},${spec.detail ?? 'NULL'}
    FROM job_state j WHERE j.id=?2 AND ${allowed}`));
  queries.push(stmt(`UPDATE jobs SET ${spec.set},version=version+1,updated_at=${now}
    WHERE id=?2 AND EXISTS (SELECT 1 FROM job_events WHERE op=?4)`));
  for (const sql of spec.after ?? []) queries.push(stmt(sql));
  queries.push(stmt('SELECT EXISTS (SELECT 1 FROM job_events WHERE op=?4) done'));
  const results = await db.batch<Row>(queries);
  results.forEach(rows);
  const kind = rows(results[0])[0].kind as string;
  // Time can pass between statements; a guard that flips mid-batch leaves nothing written.
  if (kind !== 'ok') return { kind };
  return { kind: rows(results[results.length - 1])[0].done === 1 ? spec.success : 'stale' };
}

// ---------- Jobs ----------

export async function job_post(db: AccessDatabase, hash: string | null, terms: JobTerms): Promise<Kind & { id?: string }> {
  if (!validToken(hash) || !validTerms(terms)) return { kind: 'invalid' };
  const id = crypto.randomUUID(), op = crypto.randomUUID();
  const stmt = statements(db, [hash, id, '1', op, null, ...termArgs(terms)]);
  const decision = `SELECT CASE WHEN NOT ${actor} THEN 'forbidden' ${termsCheck} ELSE 'ok' END kind`;
  const results = await db.batch<Row>([
    stmt(decision),
    stmt(`INSERT INTO jobs(id,poster_account_id,poster_is_instructor,title,description,deliverable,window_days,money_usd,
      share_percent,project_id,milestone_id,skills) SELECT ?2,${me},CASE WHEN ${me} IS NULL THEN 1 ELSE 0 END,
      ?6,?7,?8,?9,?10,?11,?12,?13,?14 WHERE (SELECT kind FROM (${decision}))='ok'`),
    stmt(`INSERT INTO job_events(op,job_id,kind,actor_kind,actor_account_id) SELECT ?4,?2,'posted',
      CASE WHEN ${me} IS NOT NULL THEN 'member' ELSE 'instructor' END,${me} WHERE EXISTS (SELECT 1 FROM jobs WHERE id=?2)`),
    stmt(`INSERT INTO job_criteria(job_id,position,text) SELECT ?2,key+1,value FROM json_each(?15)
      WHERE EXISTS (SELECT 1 FROM job_events WHERE op=?4)`),
  ]);
  results.forEach(rows);
  const kind = rows(results[0])[0].kind as string;
  return kind === 'ok' ? { kind: 'posted', id } : { kind };
}
// Direct callers (tests, future code) pass terms that must match what the form reader would produce.
function validTerms(t: JobTerms) {
  return typeof t === 'object' && text(t.title, 1, 80) === t.title && text(t.description, 1, 2000, true) === t.description &&
    ['pull_request', 'live_url', 'file_link'].includes(t.deliverable) && Number.isInteger(t.windowDays) && t.windowDays >= 1 && t.windowDays <= 30 &&
    (t.money === null || (Number.isInteger(t.money) && t.money >= 1 && t.money <= 1_000_000)) &&
    (t.share === null || (Number.isInteger(t.share) && t.share >= 1 && t.share <= 100 && t.projectId !== null)) &&
    (t.money !== null || t.share !== null) && (t.projectId === null || uuid(t.projectId)) &&
    (t.milestoneId === null || (uuid(t.milestoneId) && t.projectId !== null)) &&
    Array.isArray(t.skills) && t.skills.length <= 5 && t.skills.every(s => typeof s === 'string' && /^[a-z0-9][a-z0-9 +#.-]{0,23}$/.test(s)) &&
    Array.isArray(t.criteria) && t.criteria.length >= 1 && t.criteria.length <= 10 && t.criteria.every(c => text(c, 1, 200) === c);
}

export async function job_edit(db: AccessDatabase, hash: string | null, id: string, version: string, terms: JobTerms): Promise<Kind> {
  if (!validTerms(terms)) return { kind: 'invalid' };
  return jobAction(db, hash, id, version, {
    success: 'edited', role: isPoster, states: ['open'], extra: termsCheck, event: "'edited'",
    params: termArgs(terms),
    set: `state='open',${claimReset},title=?6,description=?7,deliverable=?8,window_days=?9,money_usd=?10,share_percent=?11,
      project_id=?12,milestone_id=?13,skills=?14`,
    after: [`DELETE FROM job_criteria WHERE job_id=?2 AND EXISTS (SELECT 1 FROM job_events WHERE op=?4)`,
      `INSERT INTO job_criteria(job_id,position,text) SELECT ?2,key+1,value FROM json_each(?15) WHERE EXISTS (SELECT 1 FROM job_events WHERE op=?4)`],
  });
}
export const job_cancel = (db: AccessDatabase, hash: string | null, id: string, version: string) => jobAction(db, hash, id, version, {
  success: 'cancelled', role: isPoster, states: ['open'], event: "'cancelled'", set: `state='cancelled',${claimReset}`,
});
export const job_claim = (db: AccessDatabase, hash: string | null, id: string, version: string) => jobAction(db, hash, id, version, {
  success: 'claimed', role: `${me} IS NOT NULL AND j.poster_account_id IS NOT ${me}`, states: ['open'], taken: true,
  extra: `WHEN (SELECT count(*) FROM job_state WHERE claimant_account_id=${me} AND effective_state IN ('claimed','changes')) >= 2 THEN 'limit'`,
  event: "'claimed'", set: `state='claimed',${claimReset.replace('claimant_account_id=NULL,claimed_at=NULL', `claimant_account_id=${me},claimed_at=${now}`)}`,
});
export const job_abandon = (db: AccessDatabase, hash: string | null, id: string, version: string) => jobAction(db, hash, id, version, {
  success: 'abandoned', role: isClaimant, states: ['claimed', 'changes'], event: "'abandoned'", set: `state='open',${claimReset}`,
});
export const job_release = (db: AccessDatabase, hash: string | null, id: string, version: string) => jobAction(db, hash, id, version, {
  success: 'released', role: isPoster, states: ['claimed'],
  extra: `WHEN julianday('now') <= julianday(j.claimed_at)+j.window_days THEN 'too_early'`,
  event: "'released'", set: `state='open',${claimReset}`,
});
export async function job_deliver(db: AccessDatabase, hash: string | null, id: string, version: string, url: unknown, note: unknown): Promise<Kind> {
  const link = httpsUrl(url), body = text(note, 1, 1000, true);
  if (!link || link !== url || body !== note) return { kind: 'invalid' };
  return jobAction(db, hash, id, version, {
    success: 'delivered', role: isClaimant, states: ['claimed', 'changes'], event: "'delivered'", params: [link, body],
    detail: `json_object('url',?6,'note',?7,'tier',${tierNow('j')})`,
    set: `locked_tier=${tierNow('jobs')},state='delivered',first_delivered_at=coalesce(first_delivered_at,${now}),delivered_at=${now},
      delivery_url=?6,delivery_note=?7`,
  });
}
const shareGuard = `WHEN j.share_percent IS NOT NULL AND j.share_granted IS NULL AND j.project_id IS NULL THEN 'project_missing'
  WHEN j.share_percent IS NOT NULL AND j.share_granted IS NULL AND ${lineOf('j.project_id', 'j.poster_account_id')} < j.share_percent THEN 'insufficient_share'`;
/** Poster accepts a delivery, or either side records the automatic acceptance after 7 silent days. */
export const job_accept = (db: AccessDatabase, hash: string | null, id: string, version: string) => jobAction(db, hash, id, version, {
  success: 'accepted', role: `(${isPoster} OR (j.lapse IS 'auto_accepted' AND ${isClaimant}))`, states: ['delivered', 'accepted'],
  extra: `WHEN j.effective_state='accepted' AND j.lapse IS NOT 'auto_accepted' THEN 'invalid' ${shareGuard}`,
  materialize: false, event: "CASE WHEN j.lapse IS 'auto_accepted' THEN 'auto_accepted' ELSE 'accepted' END",
  detail: `json_object('tier',j.locked_tier,'amount',j.money_usd*j.locked_tier/100,'share',j.share_percent*j.locked_tier/100,'at',coalesce(j.lapse_at,${now}))`,
  params: [crypto.randomUUID()],
  set: `state=CASE WHEN money_usd IS NULL THEN 'paid' ELSE 'accepted' END,
    accepted_at=CASE WHEN julianday('now') > julianday(delivered_at)+7 THEN strftime('%Y-%m-%dT%H:%M:%fZ',julianday(delivered_at)+7) ELSE ${now} END,
    final_tier=locked_tier,share_granted=CASE WHEN share_percent IS NULL OR project_id IS NULL THEN NULL ELSE share_percent*locked_tier/100 END,
    paid_at=CASE WHEN money_usd IS NULL THEN ${now} END`,
  after: shareGrant('?6'),
});
export async function job_changes(db: AccessDatabase, hash: string | null, id: string, version: string, failed: unknown, note: unknown): Promise<Kind> {
  const body = note === null || note === '' ? null : text(note, 1, 1000, true);
  if (!Array.isArray(failed) || failed.length < 1 || failed.length > 10 || new Set(failed).size !== failed.length ||
    !failed.every(n => Number.isInteger(n) && n >= 1 && n <= 10) || (note !== null && note !== '' && body !== note)) return { kind: 'invalid' };
  return jobAction(db, hash, id, version, {
    success: 'changes_requested', role: isPoster, states: ['delivered'], params: [JSON.stringify(failed), body],
    extra: `WHEN j.change_rounds >= 2 THEN 'rounds'
      WHEN (SELECT count(*) FROM job_criteria WHERE job_id=?2 AND position IN (SELECT value FROM json_each(?6))) <> json_array_length(?6) THEN 'invalid'`,
    event: "'changes_requested'",
    detail: `json_object('failed',json((SELECT json_group_array(text) FROM (SELECT text FROM job_criteria WHERE job_id=?2
      AND position IN (SELECT value FROM json_each(?6)) ORDER BY position))),'note',?7,'round',j.change_rounds+1)`,
    set: `state='changes',changes_at=${now},change_rounds=change_rounds+1`,
  });
}
/** First reject sends the claim back to work with the tier unlocked. A second reject opens a dispute. */
export async function job_reject(db: AccessDatabase, hash: string | null, id: string, version: string, note: unknown): Promise<Kind> {
  const body = text(note, 1, 1000, true);
  if (!body || body !== note) return { kind: 'invalid' };
  return jobAction(db, hash, id, version, {
    success: 'rejected', role: isPoster, states: ['delivered'], params: [body],
    event: "CASE WHEN j.reject_count=0 THEN 'rejected' ELSE 'disputed' END",
    detail: `json_object('note',?6,'reason',CASE WHEN j.reject_count=0 THEN NULL ELSE 'Second reject' END)`,
    set: `state=CASE WHEN reject_count=0 THEN 'claimed' ELSE 'disputed' END,
      locked_tier=CASE WHEN reject_count=0 THEN NULL ELSE locked_tier END,reject_count=1`,
  });
}
export async function job_paid(db: AccessDatabase, hash: string | null, id: string, version: string, amount: unknown, on: unknown, note: unknown): Promise<Kind> {
  const body = note === null || note === '' ? null : text(note, 1, 500, true);
  if (!Number.isInteger(amount) || (amount as number) < 0 || (amount as number) > 1_000_000 || isoDate(on) !== on ||
    (note !== null && note !== '' && body !== note)) return { kind: 'invalid' };
  return jobAction(db, hash, id, version, {
    success: 'paid', role: isPoster, states: ['accepted'], params: [amount, on, body],
    extra: `WHEN j.lapse IS NOT NULL OR j.money_usd IS NULL THEN 'invalid'
      WHEN julianday(?7) > julianday('now','+1 day') OR julianday(?7) < julianday(j.claimed_at,'-1 day') THEN 'invalid'`,
    event: "'paid'", detail: `json_object('amount',?6,'on',?7,'note',?8)`,
    set: `state='paid',paid_amount_usd=?6,paid_on=?7,paid_note=?8,paid_at=${now}`,
  });
}
export const job_receipt = (db: AccessDatabase, hash: string | null, id: string, version: string) => jobAction(db, hash, id, version, {
  success: 'receipt_confirmed', role: isClaimant, states: ['paid'], extra: `WHEN j.receipt_at IS NOT NULL THEN 'invalid'`,
  event: "'receipt_confirmed'", set: `receipt_at=${now}`,
});
async function disputeWith(db: AccessDatabase, hash: string | null, id: string, version: string, reason: unknown, mode: 'dispute' | 'not_received') {
  const body = text(reason, 1, 1000, true);
  if (!body || body !== reason) return { kind: 'invalid' };
  return jobAction(db, hash, id, version, mode === 'not_received' ? {
    success: 'disputed', role: isClaimant, states: ['paid'], extra: `WHEN j.receipt_at IS NOT NULL THEN 'invalid'`, params: [body],
    event: "'not_received'", detail: `json_object('reason',?6)`, set: `state='disputed'`,
  } : {
    success: 'disputed', role: `(${isPoster} OR ${isClaimant})`, states: ['delivered', 'changes', 'accepted', 'paid'], params: [body],
    extra: `WHEN j.effective_state='paid' AND j.receipt_at IS NOT NULL THEN 'invalid'`,
    event: "'disputed'", detail: `json_object('reason',?6)`, set: `state='disputed'`,
  });
}
export const job_not_received = (db: AccessDatabase, hash: string | null, id: string, version: string, reason: unknown) => disputeWith(db, hash, id, version, reason, 'not_received');
export const job_dispute = (db: AccessDatabase, hash: string | null, id: string, version: string, reason: unknown) => disputeWith(db, hash, id, version, reason, 'dispute');

/** Instructor settles a dispute: final state, tier and a reason both sides can read. */
export async function job_resolve(db: AccessDatabase, hash: string | null, id: string, version: string, outcome: unknown, tier: unknown, reason: unknown): Promise<Kind> {
  const body = text(reason, 1, 1000, true);
  const settles = outcome === 'accepted' || outcome === 'paid';
  if (!body || body !== reason || !['accepted', 'paid', 'open', 'cancelled'].includes(outcome as string) ||
    (settles ? ![0, 50, 100].includes(tier as number) : tier !== null)) return { kind: 'invalid' };
  // 'open' clears the claim; 'cancelled' keeps the record as it stood; 'accepted' and 'paid' settle the tier.
  const keep = (column: string, reset = 'NULL') => `CASE WHEN ?6='open' THEN ${reset} ELSE ${column} END`;
  const settle = (value: string, column: string) => `CASE WHEN ?6 IN ('accepted','paid') THEN ${value} ELSE ${keep(column)} END`;
  return jobAction(db, hash, id, version, {
    success: 'resolved', role: instructor, states: ['disputed'], hiddenOk: true, params: [outcome, tier, body, crypto.randomUUID()],
    extra: `WHEN ?6='open' AND j.share_granted IS NOT NULL THEN 'invalid'
      ${shareGuard.replace(/WHEN j\.share_percent/g, "WHEN ?6 IN ('accepted','paid') AND j.share_percent")}`,
    event: "'resolved'", detail: `json_object('outcome',?6,'tier',?7,'reason',?8)`,
    set: `${['claimant_account_id', 'claimed_at', 'first_delivered_at', 'delivered_at', 'delivery_url', 'delivery_note', 'changes_at', 'paid_on', 'paid_note']
        .map(column => `${column}=${keep(column)}`).join(',')},change_rounds=${keep('change_rounds', '0')},reject_count=${keep('reject_count', '0')},
      state=CASE WHEN ?6='accepted' AND money_usd IS NULL THEN 'paid' ELSE ?6 END,
      locked_tier=${settle('CAST(?7 AS INTEGER)', 'locked_tier')},final_tier=${settle('CAST(?7 AS INTEGER)', 'final_tier')},
      accepted_at=${settle(`coalesce(accepted_at,${now})`, 'accepted_at')},
      share_granted=${settle('CASE WHEN share_percent IS NULL OR project_id IS NULL THEN NULL ELSE coalesce(share_granted,share_percent*CAST(?7 AS INTEGER)/100) END', 'share_granted')},
      paid_at=CASE WHEN ?6='paid' OR (?6='accepted' AND money_usd IS NULL) THEN coalesce(paid_at,${now}) ELSE ${keep('paid_at')} END,
      paid_amount_usd=CASE WHEN ?6='paid' AND money_usd IS NOT NULL THEN coalesce(paid_amount_usd,money_usd*CAST(?7 AS INTEGER)/100) ELSE ${keep('paid_amount_usd')} END,
      receipt_at=CASE WHEN ?6='paid' THEN coalesce(receipt_at,${now}) ELSE ${keep('receipt_at')} END`,
    after: shareGrant('?9'),
  });
}
export const job_moderate = (db: AccessDatabase, hash: string | null, id: string, version: string, hidden: boolean) => jobAction(db, hash, id, version, {
  success: hidden ? 'hidden' : 'restored', role: instructor, states: ['open', 'claimed', 'delivered', 'changes', 'accepted', 'paid', 'cancelled', 'disputed'],
  hiddenOk: true, materialize: false, extra: `WHEN j.hidden=${hidden ? 1 : 0} THEN 'unchanged'`,
  event: hidden ? "'hidden'" : "'restored'", set: `hidden=${hidden ? 1 : 0}`,
});

// ---------- Teams and share agreements ----------

const owns = `EXISTS (SELECT 1 FROM personal_projects p WHERE p.id=?2 AND p.owner_account_id=${me})`;
/** Runs [decision, ...writes, final?]. Returns the decision and, when given, the final row. */
async function single(db: AccessDatabase, args: unknown[], decision: string, writes: string[], final?: string): Promise<Kind & { last?: Row }> {
  const stmt = statements(db, args);
  const results = await db.batch<Row>([stmt(decision), ...writes.map(sql => stmt(sql)), ...(final ? [stmt(final)] : [])]);
  results.forEach(rows);
  return { kind: rows(results[0])[0].kind as string, last: final ? rows(results[results.length - 1])[0] : undefined };
}
const key = (value: unknown) => nickname(value)?.toLowerCase() ?? null;

export async function team_invite(db: AccessDatabase, hash: string | null, project: string, member: unknown, role: unknown): Promise<Kind> {
  const target = key(member), title = text(role, 1, 40);
  if (!validToken(hash) || !uuid(project) || !target || !title || title !== role) return { kind: 'invalid' };
  const decision = `SELECT CASE WHEN NOT ${owns} THEN 'forbidden'
    WHEN t.internal_id IS NULL THEN 'no_member'
    WHEN t.internal_id=(SELECT owner_account_id FROM personal_projects WHERE id=?2) THEN 'invalid'
    WHEN EXISTS (SELECT 1 FROM project_team WHERE project_id=?2 AND account_id=t.internal_id AND status IN ('invited','active')) THEN 'exists'
    ELSE 'invited' END kind FROM (SELECT 1) LEFT JOIN accounts t ON t.nickname_key=?3 AND t.status='approved'`;
  return single(db, [hash, project.toLowerCase(), target, title], decision, [`INSERT INTO project_team(project_id,account_id,role,status)
    SELECT ?2,internal_id,?4,'invited' FROM accounts WHERE nickname_key=?3 AND (SELECT kind FROM (${decision}))='invited'
    ON CONFLICT(project_id,account_id) DO UPDATE SET role=excluded.role,status='invited',updated_at=${now}`]);
}
export async function team_respond(db: AccessDatabase, hash: string | null, project: string, accept: boolean): Promise<Kind> {
  if (!validToken(hash) || !uuid(project) || typeof accept !== 'boolean') return { kind: 'invalid' };
  const success = accept ? 'joined' : 'declined';
  const decision = `SELECT CASE WHEN ${me} IS NULL THEN 'forbidden'
    WHEN NOT EXISTS (SELECT 1 FROM project_team WHERE project_id=?2 AND account_id=${me} AND status='invited') THEN 'invalid'
    ELSE '${success}' END kind`;
  return single(db, [hash, project.toLowerCase()], decision, [`UPDATE project_team SET status='${accept ? 'active' : 'declined'}',updated_at=${now}
    WHERE project_id=?2 AND account_id=${me} AND (SELECT kind FROM (${decision}))='${success}'`]);
}
export async function team_leave(db: AccessDatabase, hash: string | null, project: string): Promise<Kind> {
  if (!validToken(hash) || !uuid(project)) return { kind: 'invalid' };
  const decision = `SELECT CASE WHEN ${me} IS NULL THEN 'forbidden'
    WHEN NOT EXISTS (SELECT 1 FROM project_team WHERE project_id=?2 AND account_id=${me} AND status IN ('invited','active')) THEN 'invalid'
    ELSE 'left' END kind`;
  return single(db, [hash, project.toLowerCase()], decision, [`UPDATE project_team SET status='left',updated_at=${now}
    WHERE project_id=?2 AND account_id=${me} AND (SELECT kind FROM (${decision}))='left'`]);
}
export async function team_remove(db: AccessDatabase, hash: string | null, project: string, member: unknown): Promise<Kind> {
  const target = key(member);
  if (!validToken(hash) || !uuid(project) || !target) return { kind: 'invalid' };
  const decision = `SELECT CASE WHEN NOT ${owns} THEN 'forbidden'
    WHEN NOT EXISTS (SELECT 1 FROM project_team t JOIN accounts a ON a.internal_id=t.account_id
      WHERE t.project_id=?2 AND a.nickname_key=?3 AND t.status IN ('invited','active')) THEN 'invalid'
    ELSE 'removed' END kind`;
  return single(db, [hash, project.toLowerCase(), target], decision, [`UPDATE project_team SET status='removed',updated_at=${now}
    WHERE project_id=?2 AND account_id=(SELECT internal_id FROM accounts WHERE nickname_key=?3) AND (SELECT kind FROM (${decision}))='removed'`]);
}

/** Activates agreement ?N once every listed person accepted; the old active version is superseded first. */
const activation = (agreement: string) => {
  const ready = `EXISTS (SELECT 1 FROM share_agreements WHERE id=${agreement} AND status='pending')
    AND NOT EXISTS (SELECT 1 FROM share_agreement_lines l WHERE l.agreement_id=${agreement} AND NOT EXISTS
      (SELECT 1 FROM share_agreement_acceptances c WHERE c.agreement_id=${agreement} AND c.account_id=l.account_id AND c.decision='accepted'))`;
  return [`UPDATE share_agreements SET status='superseded',closed_at=${now} WHERE project_id=?2 AND status='active' AND ${ready}`,
    `UPDATE share_agreements SET status='active',activated_at=${now} WHERE id=${agreement} AND ${ready}`];
};

/** Owner proposes version N+1 (basis = latest version they saw). Owner auto-accepts; it replaces any pending version. */
export async function agreement_propose(db: AccessDatabase, hash: string | null, project: string, basis: unknown, lines: AgreementLine[]): Promise<Kind> {
  if (!validToken(hash) || !uuid(project) || typeof basis !== 'string' || !/^(0|[1-9]\d{0,8})$/.test(basis) || !Array.isArray(lines) ||
    lines.length < 1 || lines.length > 9 || new Set(lines.map(line => line.key)).size !== lines.length ||
    !lines.every(line => key(line.key) === line.key && text(line.role, 1, 40) === line.role && Number.isInteger(line.percent) &&
      line.percent >= 1 && line.percent <= 100 && (line.brings === null || text(line.brings, 1, 200) === line.brings)) ||
    lines.reduce((sum, line) => sum + line.percent, 0) !== 100) return { kind: 'invalid' };
  const id = crypto.randomUUID();
  const decision = `SELECT CASE WHEN NOT ${owns} THEN 'forbidden'
    WHEN (SELECT coalesce(max(version),0) FROM share_agreements WHERE project_id=?2) <> CAST(?3 AS INTEGER) THEN 'stale'
    WHEN (SELECT count(*) FROM accounts a WHERE a.status='approved' AND a.nickname_key IN (SELECT json_extract(value,'$.key') FROM json_each(?5))
      AND (a.internal_id=(SELECT owner_account_id FROM personal_projects WHERE id=?2) OR EXISTS (SELECT 1 FROM project_team t
        WHERE t.project_id=?2 AND t.account_id=a.internal_id AND t.status='active'))) <> json_array_length(?5) THEN 'not_team'
    WHEN (SELECT sum(json_extract(value,'$.percent')) FROM json_each(?5)) <> 100 THEN 'invalid'
    ELSE 'proposed' END kind`;
  const made = `EXISTS (SELECT 1 FROM share_agreements WHERE id=?4)`;
  return single(db, [hash, project.toLowerCase(), basis, id, JSON.stringify(lines)], decision, [
    `UPDATE share_agreements SET status='replaced',closed_at=${now} WHERE project_id=?2 AND status='pending' AND (SELECT kind FROM (${decision}))='proposed'`,
    `INSERT INTO share_agreements(id,project_id,version,source) SELECT ?4,?2,(SELECT coalesce(max(version),0)+1 FROM share_agreements WHERE project_id=?2),'proposal'
      WHERE (SELECT kind FROM (${decision}))='proposed'`,
    `INSERT INTO share_agreement_lines(agreement_id,account_id,role,percent,brings)
      SELECT ?4,a.internal_id,json_extract(l.value,'$.role'),json_extract(l.value,'$.percent'),json_extract(l.value,'$.brings')
      FROM json_each(?5) l JOIN accounts a ON a.nickname_key=json_extract(l.value,'$.key') AND a.status='approved' WHERE ${made}`,
    `INSERT INTO share_agreement_acceptances(agreement_id,account_id,decision) SELECT ?4,p.owner_account_id,'accepted'
      FROM personal_projects p WHERE p.id=?2 AND ${made} AND EXISTS (SELECT 1 FROM share_agreement_lines WHERE agreement_id=?4 AND account_id=p.owner_account_id)`,
    ...activation('?4'),
  ], `SELECT status FROM share_agreements WHERE id=?4`).then(result => ({ kind: result.kind === 'proposed' && result.last?.status === 'active' ? 'activated' : result.kind }));
}
export async function agreement_respond(db: AccessDatabase, hash: string | null, project: string, agreement: string, version: unknown, accept: boolean): Promise<Kind> {
  if (!validToken(hash) || !uuid(project) || !uuid(agreement) || !projectVersion(version) || typeof accept !== 'boolean') return { kind: 'invalid' };
  const decision = `SELECT CASE WHEN ${me} IS NULL THEN 'forbidden'
    WHEN a.id IS NULL OR a.project_id<>?2 THEN 'missing'
    WHEN NOT EXISTS (SELECT 1 FROM share_agreement_lines WHERE agreement_id=?3 AND account_id=${me}) THEN 'forbidden'
    WHEN a.status<>'pending' OR a.version<>CAST(?4 AS INTEGER) THEN 'stale'
    WHEN EXISTS (SELECT 1 FROM share_agreement_acceptances WHERE agreement_id=?3 AND account_id=${me}) THEN 'already'
    ELSE 'ok' END kind FROM (SELECT 1) LEFT JOIN share_agreements a ON a.id=?3`;
  const answer = accept ? 'accepted' : 'declined';
  const result = await single(db, [hash, project.toLowerCase(), agreement.toLowerCase(), version, answer], decision, [
    `INSERT INTO share_agreement_acceptances(agreement_id,account_id,decision) SELECT ?3,${me},?5 WHERE (SELECT kind FROM (${decision}))='ok'`,
    ...(accept ? activation('?3') : [`UPDATE share_agreements SET status='declined',closed_at=${now} WHERE id=?3 AND status='pending'
      AND EXISTS (SELECT 1 FROM share_agreement_acceptances WHERE agreement_id=?3 AND account_id=${me} AND decision='declined')`]),
  ], `SELECT status FROM share_agreements WHERE id=?3`);
  if (result.kind !== 'ok') return { kind: result.kind };
  return { kind: result.last?.status === 'active' ? 'activated' : answer };
}

// ---------- Reads ----------

const nick = (account: string) => `CASE WHEN ${account} IS NULL THEN NULL ELSE (SELECT nickname FROM accounts WHERE internal_id=${account}) END`;
const jobSummary = `'id',j.id,'title',j.title,'deliverable',j.deliverable,'windowDays',j.window_days,'money',j.money_usd,'share',j.share_percent,
  'poster',CASE WHEN j.poster_is_instructor=1 THEN ${instructorName} ELSE ${nick('j.poster_account_id')} END,
  'byInstructor',${bool('j.poster_is_instructor=1')},'projectId',j.project_id,'projectTitle',(SELECT title FROM personal_projects WHERE id=j.project_id),
  'skills',json(j.skills),'state',j.effective_state,'hidden',${bool('j.hidden=1')},'createdAt',j.created_at,
  'claimant',CASE WHEN j.effective_state IN ('open','cancelled') THEN NULL ELSE ${nick('j.claimant_account_id')} END,
  'claimedAt',CASE WHEN j.effective_state IN ('open','cancelled') THEN NULL ELSE j.claimed_at END,
  'deliveredAt',CASE WHEN j.effective_state IN ('open','cancelled') THEN NULL ELSE j.delivered_at END,
  'confirmed',${bool('j.receipt_at IS NOT NULL')},'isPoster',${bool(isPoster)},'isClaimant',${bool(`${isClaimant} AND j.effective_state NOT IN ('open','cancelled')`)}`;
const canSeeJob = `(j.hidden=0 OR ${instructor} OR j.poster_account_id=${me} OR j.claimant_account_id=${me})`;
const completed = (account: string) => `(SELECT count(*) FROM job_state WHERE claimant_account_id=${account} AND effective_state IN ('accepted','paid'))`;
const linesJson = (agreement: string) => `json((SELECT json_group_array(json_object('nickname',a.nickname,'role',l.role,'percent',l.percent,'brings',l.brings,
  'decision',(SELECT decision FROM share_agreement_acceptances c WHERE c.agreement_id=l.agreement_id AND c.account_id=l.account_id)))
  FROM (SELECT * FROM share_agreement_lines WHERE agreement_id=${agreement} ORDER BY percent DESC, account_id) l JOIN accounts a ON a.internal_id=l.account_id))`;

const linkable = `(SELECT json_group_array(json(item)) FROM (SELECT json_object('id',p.id,'title',p.title,
      'line',CASE WHEN p.owner_account_id=${me} THEN ${lineOf('p.id', me)} END,
      'milestones',json((SELECT json_group_array(json_object('id',m.id,'title',m.title)) FROM
        (SELECT id,title FROM project_milestones WHERE project_id=p.id ORDER BY position) m))) item
      FROM personal_projects p WHERE p.owner_account_id=${me} OR (${me} IS NULL AND ${visibleProject}) ORDER BY p.created_at,p.id))`;

export async function collab_board(db: AccessDatabase, hash: string | null): Promise<Kind & Row> {
  if (!validToken(hash)) return { kind: 'forbidden' };
  const row = await db.prepare(`SELECT CASE WHEN ${me} IS NOT NULL THEN 'member' ELSE 'instructor' END viewer,
    ${instructorName} instructorNickname, ${completed(me)} completed,
    (SELECT count(*) FROM job_state WHERE claimant_account_id=${me} AND effective_state IN ('claimed','changes')) activeClaims,
    (SELECT json_group_array(json(item)) FROM (SELECT json_object(${jobSummary}) item FROM job_state j WHERE ${canSeeJob}
      ORDER BY j.created_at DESC, j.id)) jobs,
    ${linkable} projects,
    (SELECT json_group_array(json(item)) FROM (SELECT json_object('projectId',p.id,'projectTitle',p.title,'owner',${nick('p.owner_account_id')},'role',t.role) item
      FROM project_team t JOIN personal_projects p ON p.id=t.project_id WHERE t.account_id=${me} AND t.status='invited' ORDER BY t.updated_at DESC)) invitations,
    (SELECT json_group_array(json(item)) FROM (SELECT json_object('projectId',p.id,'projectTitle',p.title,'owner',${nick('p.owner_account_id')},
      'agreementId',a.id,'version',a.version,'createdAt',a.created_at,'lines',${linesJson('a.id')}) item
      FROM share_agreements a JOIN personal_projects p ON p.id=a.project_id WHERE a.status='pending'
      AND EXISTS (SELECT 1 FROM share_agreement_lines WHERE agreement_id=a.id AND account_id=${me})
      AND NOT EXISTS (SELECT 1 FROM share_agreement_acceptances WHERE agreement_id=a.id AND account_id=${me}) ORDER BY a.created_at DESC)) pending,
    (SELECT json_group_array(json(item)) FROM (SELECT json_object('projectId',p.id,'projectTitle',p.title,'owner',${nick('p.owner_account_id')},
      'isOwner',${bool(`p.owner_account_id=${me}`)},'role',CASE WHEN p.owner_account_id=${me} THEN 'Owner' ELSE
        (SELECT role FROM project_team WHERE project_id=p.id AND account_id=${me}) END,
      'percent',CASE WHEN p.owner_account_id=${me} OR EXISTS (SELECT 1 FROM share_agreements WHERE project_id=p.id AND status='active') THEN ${lineOf('p.id', me)} END,
      'activeVersion',(SELECT version FROM share_agreements WHERE project_id=p.id AND status='active'),
      'pendingVersion',(SELECT version FROM share_agreements WHERE project_id=p.id AND status='pending'),
      'teamSize',1+(SELECT count(*) FROM project_team WHERE project_id=p.id AND status='active')) item
      FROM personal_projects p WHERE p.owner_account_id=${me} OR EXISTS (SELECT 1 FROM project_team WHERE project_id=p.id AND account_id=${me} AND status='active')
      ORDER BY p.owner_account_id=${me} DESC, p.created_at)) teams
    WHERE ${actor}`).bind(hash).first<Row>();
  if (!row) return { kind: 'forbidden' };
  return { kind: 'ok', viewer: row.viewer, instructorNickname: row.instructorNickname, completed: row.completed, activeClaims: row.activeClaims,
    jobs: JSON.parse(row.jobs as string), projects: JSON.parse(row.projects as string),
    invitations: JSON.parse(row.invitations as string), pending: JSON.parse(row.pending as string), teams: JSON.parse(row.teams as string) };
}

export async function collab_job(db: AccessDatabase, hash: string | null, id: string): Promise<Kind & Row> {
  if (!validToken(hash)) return { kind: 'forbidden' };
  if (!uuid(id)) return { kind: 'missing' };
  const party = `(${instructor} OR j.poster_account_id=${me} OR j.claimant_account_id=${me})`;
  const row = await db.prepare(`SELECT CASE WHEN ${actor} THEN 1 ELSE 0 END authorized,
    CASE WHEN ${me} IS NOT NULL THEN 'member' ELSE 'instructor' END viewer, ${instructorName} instructorNickname,
    (SELECT count(*) FROM job_state WHERE claimant_account_id=${me} AND effective_state IN ('claimed','changes')) activeClaims,
    ${linkable} projects,
    (SELECT json_object(${jobSummary},'description',j.description,'version',CAST(j.version AS TEXT),'storedState',j.state,
      'milestoneId',j.milestone_id,'milestoneTitle',(SELECT title FROM project_milestones WHERE id=j.milestone_id AND project_id=j.project_id),
      'criteria',json((SELECT json_group_array(text) FROM (SELECT text FROM job_criteria WHERE job_id=j.id ORDER BY position))),
      'lockedTier',j.locked_tier,'finalTier',CASE WHEN j.lapse IS 'auto_accepted' THEN j.locked_tier ELSE j.final_tier END,
      'changeRounds',j.change_rounds,'rejectCount',j.reject_count,'changesAt',j.changes_at,'firstDeliveredAt',j.first_delivered_at,
      'acceptedAt',CASE WHEN j.lapse IS 'auto_accepted' THEN j.lapse_at ELSE j.accepted_at END,'lapse',j.lapse,'lapseAt',j.lapse_at,
      'shareGranted',j.share_granted,'paidAmount',j.paid_amount_usd,'paidOn',j.paid_on,'paidAt',j.paid_at,'receiptAt',j.receipt_at,
      'posterLine',CASE WHEN j.share_percent IS NOT NULL AND j.project_id IS NOT NULL THEN ${lineOf('j.project_id', 'j.poster_account_id')} END,
      'claimantCompleted',CASE WHEN j.effective_state IN ('open','cancelled') OR j.claimant_account_id IS NULL THEN NULL ELSE ${completed('j.claimant_account_id')} END,
      'party',${bool(party)},
      'deliveryUrl',CASE WHEN ${party} AND j.effective_state NOT IN ('open','cancelled') THEN j.delivery_url END,
      'deliveryNote',CASE WHEN ${party} AND j.effective_state NOT IN ('open','cancelled') THEN j.delivery_note END,
      'paidNote',CASE WHEN ${party} THEN j.paid_note END,
      'agreementVersion',(SELECT version FROM share_agreements WHERE job_id=j.id),
      'events',CASE WHEN ${party} THEN json((SELECT json_group_array(json_object('kind',e.kind,'actorKind',e.actor_kind,
        'actor',CASE e.actor_kind WHEN 'member' THEN ${nick('e.actor_account_id')} WHEN 'instructor' THEN ${instructorName} END,
        'detail',json(e.detail),'at',e.created_at)) FROM (SELECT * FROM job_events WHERE job_id=j.id ORDER BY seq) e)) END)
      FROM job_state j WHERE j.id=?2 AND ${canSeeJob}) job`).bind(hash, id.toLowerCase()).first<Row>();
  if (!row?.authorized) return { kind: 'forbidden' };
  if (!row.job) return { kind: 'missing' };
  return { kind: 'ok', viewer: row.viewer, instructorNickname: row.instructorNickname, activeClaims: row.activeClaims, projects: JSON.parse(row.projects as string), job: JSON.parse(row.job as string) };
}

export async function collab_team(db: AccessDatabase, hash: string | null, project: string): Promise<Kind & Row> {
  if (!validToken(hash)) return { kind: 'forbidden' };
  if (!uuid(project)) return { kind: 'missing' };
  const isOwner = `p.owner_account_id=${me}`;
  const readable = `(${isOwner} OR (${visibleProject}) OR (${instructor} AND p.moderation='Hidden'))`;
  const insider = `(${isOwner} OR ${instructor} OR EXISTS (SELECT 1 FROM project_team WHERE project_id=p.id AND account_id=${me} AND status IN ('invited','active'))
    OR EXISTS (SELECT 1 FROM share_agreement_lines l JOIN share_agreements a ON a.id=l.agreement_id WHERE a.project_id=p.id AND l.account_id=${me}))`;
  const agreement = (a: string) => `json_object('id',${a}.id,'version',${a}.version,'status',${a}.status,'source',${a}.source,
    'jobId',${a}.job_id,'jobTitle',(SELECT title FROM jobs WHERE id=${a}.job_id),'createdAt',${a}.created_at,'activatedAt',${a}.activated_at,
    'closedAt',${a}.closed_at,'lines',${linesJson(`${a}.id`)})`;
  const row = await db.prepare(`SELECT CASE WHEN ${actor} THEN 1 ELSE 0 END authorized,
    (SELECT json_object('projectId',p.id,'owner',${nick('p.owner_account_id')},'isOwner',${bool(isOwner)},'insider',${bool(insider)},
      'myStatus',(SELECT status FROM project_team WHERE project_id=p.id AND account_id=${me} AND status IN ('invited','active')),
      'myRole',(SELECT role FROM project_team WHERE project_id=p.id AND account_id=${me} AND status IN ('invited','active')),
      'team',json((SELECT json_group_array(json_object('nickname',a.nickname,'role',t.role,'status',t.status,'completed',${completed('t.account_id')}))
        FROM (SELECT * FROM project_team WHERE project_id=p.id AND status IN ('invited','active') ORDER BY status='invited', created_at) t
        JOIN accounts a ON a.internal_id=t.account_id)),
      'candidates',CASE WHEN ${isOwner} THEN json((SELECT json_group_array(nickname) FROM (SELECT a.nickname FROM accounts a WHERE a.status='approved'
        AND a.internal_id<>p.owner_account_id AND NOT EXISTS (SELECT 1 FROM project_team t WHERE t.project_id=p.id AND t.account_id=a.internal_id
        AND t.status IN ('invited','active')) ORDER BY a.nickname_key))) END,
      'latestVersion',(SELECT coalesce(max(version),0) FROM share_agreements WHERE project_id=p.id),
      'active',CASE WHEN ${insider} THEN (SELECT ${agreement('a')} FROM share_agreements a WHERE a.project_id=p.id AND a.status='active') END,
      'pending',CASE WHEN ${insider} THEN (SELECT ${agreement('a')} FROM share_agreements a WHERE a.project_id=p.id AND a.status='pending') END,
      'myDecision',(SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM share_agreement_lines WHERE agreement_id=a.id AND account_id=${me}) THEN 'not_listed'
        ELSE coalesce((SELECT decision FROM share_agreement_acceptances WHERE agreement_id=a.id AND account_id=${me}),'needed') END
        FROM share_agreements a WHERE a.project_id=p.id AND a.status='pending'),
      'history',CASE WHEN ${insider} THEN json((SELECT json_group_array(json(${agreement('h')})) FROM
        (SELECT * FROM share_agreements WHERE project_id=p.id AND status NOT IN ('active','pending') ORDER BY version DESC) h)) ELSE json('[]') END,
      'openShareJobs',(SELECT coalesce(sum(share_percent),0) FROM job_state WHERE project_id=p.id AND share_percent IS NOT NULL
        AND share_granted IS NULL AND effective_state NOT IN ('cancelled','paid','accepted')))
      FROM personal_projects p WHERE p.id=?2 AND ${readable}) team`).bind(hash, project.toLowerCase()).first<Row>();
  if (!row?.authorized) return { kind: 'forbidden' };
  if (!row.team) return { kind: 'missing' };
  return { kind: 'ok', team: JSON.parse(row.team as string) };
}
