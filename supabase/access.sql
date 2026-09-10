begin;

do $$
begin
  if to_regnamespace('vibies_private') is not null then
    if to_regclass('vibies_private._ownership') is null
       or obj_description(to_regclass('vibies_private._ownership'), 'pg_class')
          is distinct from 'vibies:issue-5-access' then
      raise exception 'Stop: vibies_private is not owned by the Vibies issue 5 access setup';
    end if;

    if not exists (
      select 1
        from vibies_private._ownership
       where project = 'vibies' and feature = 'issue-5-access'
    ) then
      raise exception 'Stop: vibies_private has an invalid ownership marker';
    end if;
  end if;
end;
$$;

create schema if not exists vibies_private;
revoke all on schema vibies_private from public;

create table if not exists vibies_private._ownership (
  project text primary key,
  feature text not null
);
comment on table vibies_private._ownership is 'vibies:issue-5-access';
insert into vibies_private._ownership (project, feature)
values ('vibies', 'issue-5-access')
on conflict (project) do nothing;

do $$
declare
  runtime_oid oid;
begin
  select oid into runtime_oid from pg_roles where rolname = 'vibies_runtime';
  if runtime_oid is null then
    execute 'create role vibies_runtime nologin noinherit';
    select oid into runtime_oid from pg_roles where rolname = 'vibies_runtime';
    execute 'comment on role vibies_runtime is ''vibies:issue-5-access-runtime''';
  elsif shobj_description(runtime_oid, 'pg_authid')
        is distinct from 'vibies:issue-5-access-runtime' then
    raise exception 'Stop: vibies_runtime is not owned by the Vibies issue 5 access setup';
  end if;
  if exists (
    select 1 from pg_roles where oid = runtime_oid
      and (rolcanlogin or rolinherit or rolsuper or rolcreatedb
           or rolcreaterole or rolreplication or rolbypassrls)
  ) then
    raise exception 'Stop: vibies_runtime has unexpected role privileges';
  end if;
end;
$$;

create table if not exists vibies_private.community (
  singleton boolean primary key default true check (singleton),
  instructor_github_id text,
  instructor_nickname text,
  check ((instructor_github_id is null) = (instructor_nickname is null))
);
insert into vibies_private.community (singleton) values (true)
on conflict (singleton) do nothing;

create table if not exists vibies_private.accounts (
  internal_id uuid not null default gen_random_uuid(),
  github_id text primary key,
  github_username text not null,
  nickname text,
  status text not null default 'unapproved'
    check (status in ('unapproved', 'approved', 'revoked')),
  onboarding_completed boolean not null default false,
  check (
    (status = 'unapproved' and nickname is null)
    or (status in ('approved', 'revoked') and nickname is not null)
  )
);
alter table vibies_private.accounts
  add column if not exists internal_id uuid not null default gen_random_uuid();
create unique index if not exists accounts_internal_id_unique
  on vibies_private.accounts (internal_id);
drop index if exists vibies_private.accounts_nickname_unique;
create unique index accounts_nickname_unique
  on vibies_private.accounts (lower(nickname collate pg_catalog."unicode"))
  where nickname is not null;

create table if not exists vibies_private.sessions (
  session_hash text primary key,
  github_id text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists sessions_created_at_idx
  on vibies_private.sessions (created_at);

create table if not exists vibies_private.sign_in_flows (
  state_hash text primary key,
  browser_hash text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists sign_in_flows_created_at_idx
  on vibies_private.sign_in_flows (created_at);

create table if not exists vibies_private.sign_in_attempts (
  id bigint generated always as identity primary key,
  browser_hash text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists sign_in_attempts_browser_created_idx
  on vibies_private.sign_in_attempts (browser_hash, created_at);

create table if not exists vibies_private.instructor_audit (
  id bigint generated always as identity primary key,
  previous_github_id text,
  new_github_id text not null,
  reason text not null,
  created_at timestamptz not null default clock_timestamp()
);

create or replace function vibies_private._normalized_nickname(value text)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  normalized text := btrim(value, ' ');
begin
  if normalized is null
     or char_length(normalized) not between 2 and 30
     -- ICU alnum covers Unicode L and Nd; these Unicode 17 ranges add Nl.
     or normalized collate pg_catalog."unicode" !~
       U&'^[-[:alnum:] _\16EE-\16F0\2160-\2182\2185-\2188\3007\3021-\3029\3038-\303A\A6E6-\A6EF\+010140-\+010174\+010341\+01034A\+0103D1-\+0103D5\+012400-\+01246E\+016FF4-\+016FF6]+$' then
    return null;
  end if;
  return normalized;
end;
$$;

create or replace function vibies_private._valid_hash(value text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(value ~ '^[0-9a-f]{64}$', false);
$$;

create or replace function vibies_private._valid_project_text(
  value text,
  p_max_length integer,
  p_allow_lf boolean
)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select char_length(value) between 1 and p_max_length
    and value = btrim(value)
    and not exists (
      select 1
        from generate_series(1, char_length(value)) as position
       where (
         ascii(substr(value, position, 1)) between 0 and 31
         and not (p_allow_lf and ascii(substr(value, position, 1)) = 10)
       )
       or ascii(substr(value, position, 1)) between 127 and 159
       or ascii(substr(value, position, 1)) in (
         173, 1564, 1757, 1807, 2274, 6158, 65279, 65529, 65530, 65531,
         69821, 69837, 917505
       )
       or ascii(substr(value, position, 1)) between 1536 and 1541
       or ascii(substr(value, position, 1)) between 2192 and 2193
       or ascii(substr(value, position, 1)) between 8203 and 8207
       or ascii(substr(value, position, 1)) between 8234 and 8238
       or ascii(substr(value, position, 1)) between 8288 and 8292
       or ascii(substr(value, position, 1)) between 8294 and 8303
       or ascii(substr(value, position, 1)) between 78896 and 78911
       or ascii(substr(value, position, 1)) between 113824 and 113827
       or ascii(substr(value, position, 1)) between 119155 and 119162
       or ascii(substr(value, position, 1)) between 917536 and 917631
    );
$$;

create or replace function vibies_private._valid_project_url(value text)
returns boolean
language sql
immutable
set search_path = pg_catalog, vibies_private
as $$
  select value is null or (
    vibies_private._valid_project_text(value, 2048, false)
    and value !~ '[[:space:]]'
    and value ~* '^https://[^/@?#[:space:]]+([/?#].*)?$'
  );
$$;

create table if not exists vibies_private.personal_projects (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references vibies_private.accounts (internal_id),
  repository_id text not null unique
    check (repository_id ~ '^[1-9][0-9]{0,15}$'),
  title text not null
    check (vibies_private._valid_project_text(title, 80, false)),
  summary text not null
    check (vibies_private._valid_project_text(summary, 500, true)),
  demo_url text check (vibies_private._valid_project_url(demo_url)),
  publication text not null default 'Draft'
    check (publication in ('Draft', 'Published', 'Archived')),
  connection text not null default 'Connected'
    check (connection in ('Connected', 'Disconnected')),
  moderation text not null default 'Visible'
    check (moderation in ('Visible', 'Hidden')),
  last_checked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  version bigint not null default 1 check (version > 0)
);
create index if not exists personal_projects_owner_idx
  on vibies_private.personal_projects (owner_account_id);

create or replace function vibies_private.access_state(p_session_hash text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, vibies_private
as $$
declare
  account_row vibies_private.accounts%rowtype;
  session_github_id text;
  instructor_id text;
  instructor_name text;
begin
  if not vibies_private._valid_hash(p_session_hash) then
    return jsonb_build_object('kind', 'signed_out');
  end if;

  delete from vibies_private.sessions
   where session_hash = p_session_hash
     and created_at <= clock_timestamp() - interval '24 hours';

  select s.github_id, c.instructor_github_id, c.instructor_nickname
    into session_github_id, instructor_id, instructor_name
    from vibies_private.sessions s
    cross join vibies_private.community c
   where s.session_hash = p_session_hash;

  if session_github_id is null then
    return jsonb_build_object('kind', 'signed_out');
  end if;
  if session_github_id = instructor_id then
    return jsonb_build_object('kind', 'instructor', 'nickname', instructor_name);
  end if;

  select * into account_row
    from vibies_private.accounts
   where github_id = session_github_id;
  if account_row.status = 'approved' then
    return jsonb_build_object(
      'kind', 'member',
      'nickname', account_row.nickname,
      'onboardingComplete', account_row.onboarding_completed
    );
  end if;
  return jsonb_build_object('kind', 'denied');
end;
$$;

create or replace function vibies_private.members(p_session_hash text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, vibies_private
as $$
declare
  result jsonb;
begin
  if not vibies_private._valid_hash(p_session_hash)
     or not exists (
       select 1
         from vibies_private.sessions s
         join vibies_private.community c
           on c.instructor_github_id = s.github_id
        where s.session_hash = p_session_hash
          and s.created_at > clock_timestamp() - interval '24 hours'
     ) then
    return jsonb_build_object('kind', 'forbidden');
  end if;

  select jsonb_build_object(
    'kind', 'ok',
    'activeCount', count(*) filter (where status = 'approved'),
    'accounts', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'githubId', github_id,
          'username', github_username,
          'nickname', nickname,
          'status', status
        ) order by github_username, github_id
      ),
      '[]'::jsonb
    )
  ) into result
  from vibies_private.accounts;
  return result;
end;
$$;

create or replace function vibies_private.change_member(
  p_session_hash text,
  p_github_id text,
  p_action text,
  p_nickname text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, vibies_private
as $$
declare
  account_row vibies_private.accounts%rowtype;
  normalized text;
  instructor_name text;
begin
  if not vibies_private._valid_hash(p_session_hash) then
    return jsonb_build_object('kind', 'forbidden');
  end if;

  select c.instructor_nickname into instructor_name
    from vibies_private.community c
    join vibies_private.sessions s on s.github_id = c.instructor_github_id
   where s.session_hash = p_session_hash
     and s.created_at > clock_timestamp() - interval '24 hours'
   for update of c;
  if not found then
    return jsonb_build_object('kind', 'forbidden');
  end if;

  if p_action is null
     or p_action not in ('approve', 'reapprove', 'revoke', 'dismiss')
     or p_github_id is null or p_github_id !~ '^[1-9][0-9]{0,63}$' then
    return jsonb_build_object('kind', 'invalid');
  end if;

  select * into account_row
    from vibies_private.accounts
   where github_id = p_github_id
   for update;
  if not found then
    return jsonb_build_object('kind', 'missing');
  end if;

  if p_action = 'approve' then
    normalized := vibies_private._normalized_nickname(p_nickname);
    if normalized is null then
      return jsonb_build_object('kind', 'nickname');
    end if;
    if account_row.status = 'approved' then
      if account_row.nickname = normalized then
        return jsonb_build_object('kind', 'ok');
      end if;
      return jsonb_build_object('kind', 'invalid');
    end if;
    if account_row.status <> 'unapproved' then
      return jsonb_build_object('kind', 'invalid');
    end if;
    if lower(normalized collate pg_catalog."unicode") =
       lower(instructor_name collate pg_catalog."unicode")
       or exists (
         select 1 from vibies_private.accounts
          where nickname is not null
            and lower(nickname collate pg_catalog."unicode") =
                lower(normalized collate pg_catalog."unicode")
            and github_id <> p_github_id
       ) then
      return jsonb_build_object('kind', 'duplicate');
    end if;
    -- ponytail: one singleton row serializes an eight-person community; use a
    -- dedicated capacity lock only if membership throughput ever matters.
    if (select count(*) from vibies_private.accounts where status = 'approved') >= 7 then
      return jsonb_build_object('kind', 'full');
    end if;
    update vibies_private.accounts
       set status = 'approved', nickname = normalized
     where github_id = p_github_id;
    return jsonb_build_object('kind', 'ok');
  end if;

  if p_nickname is not null then
    return jsonb_build_object('kind', 'invalid');
  end if;

  if p_action = 'reapprove' then
    if account_row.status = 'approved' then
      return jsonb_build_object('kind', 'ok');
    end if;
    if account_row.status <> 'revoked' then
      return jsonb_build_object('kind', 'invalid');
    end if;
    if (select count(*) from vibies_private.accounts where status = 'approved') >= 7 then
      return jsonb_build_object('kind', 'full');
    end if;
    update vibies_private.accounts set status = 'approved'
     where github_id = p_github_id;
    return jsonb_build_object('kind', 'ok');
  end if;

  if p_action = 'revoke' then
    if account_row.status = 'revoked' then
      return jsonb_build_object('kind', 'ok');
    end if;
    if account_row.status <> 'approved' then
      return jsonb_build_object('kind', 'invalid');
    end if;
    update vibies_private.accounts set status = 'revoked'
     where github_id = p_github_id;
    return jsonb_build_object('kind', 'ok');
  end if;

  if account_row.status <> 'unapproved' then
    return jsonb_build_object('kind', 'invalid');
  end if;
  delete from vibies_private.sessions where github_id = p_github_id;
  delete from vibies_private.accounts where github_id = p_github_id;
  return jsonb_build_object('kind', 'ok');
end;
$$;

create or replace function vibies_private.begin_sign_in(
  p_browser_hash text,
  p_state_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, vibies_private
as $$
begin
  if not exists (
    select 1 from vibies_private.community where instructor_github_id is not null
  ) then
    return jsonb_build_object('kind', 'unconfigured');
  end if;
  if not vibies_private._valid_hash(p_browser_hash)
     or not vibies_private._valid_hash(p_state_hash) then
    return jsonb_build_object('kind', 'limited');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_browser_hash, 0));
  -- ponytail: expired-row cleanup scans these tiny access tables; schedule a
  -- bounded cleanup job if sign-in traffic ever makes that measurable.
  delete from vibies_private.sign_in_attempts
   where created_at <= clock_timestamp() - interval '10 minutes';
  delete from vibies_private.sign_in_flows
   where created_at <= clock_timestamp() - interval '10 minutes';
  if (select count(*) from vibies_private.sign_in_attempts
       where browser_hash = p_browser_hash) >= 10 then
    return jsonb_build_object('kind', 'limited');
  end if;

  insert into vibies_private.sign_in_attempts (browser_hash)
  values (p_browser_hash);
  insert into vibies_private.sign_in_flows (state_hash, browser_hash)
  values (p_state_hash, p_browser_hash)
  on conflict (state_hash) do nothing;
  if not found then
    return jsonb_build_object('kind', 'limited');
  end if;
  return jsonb_build_object('kind', 'ok');
end;
$$;

create or replace function vibies_private.consume_sign_in(
  p_browser_hash text,
  p_state_hash text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, vibies_private
as $$
declare
  consumed boolean;
begin
  if not vibies_private._valid_hash(p_browser_hash)
     or not vibies_private._valid_hash(p_state_hash) then
    return false;
  end if;
  with deleted as (
    delete from vibies_private.sign_in_flows
     where browser_hash = p_browser_hash
       and state_hash = p_state_hash
       and created_at > clock_timestamp() - interval '10 minutes'
    returning 1
  )
  select exists(select 1 from deleted) into consumed;
  return consumed;
end;
$$;

create or replace function vibies_private.finish_sign_in(
  p_github_id text,
  p_username text,
  p_session_hash text,
  p_old_session_hash text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, vibies_private
as $$
declare
  instructor_id text;
begin
  if p_github_id is null or p_github_id !~ '^[1-9][0-9]{0,63}$'
     or p_username is null
     or p_username !~ '^[A-Za-z0-9]([A-Za-z0-9-]{0,37}[A-Za-z0-9])?$'
     or not vibies_private._valid_hash(p_session_hash)
     or (
       p_old_session_hash is not null
       and (
         not vibies_private._valid_hash(p_old_session_hash)
         or p_old_session_hash = p_session_hash
       )
     ) then
    raise exception 'Invalid sign-in result';
  end if;

  select instructor_github_id into instructor_id
    from vibies_private.community
   where singleton
   for update;
  if instructor_id is null then
    raise exception 'Instructor is not configured';
  end if;

  delete from vibies_private.sessions
   where created_at <= clock_timestamp() - interval '24 hours';
  if p_old_session_hash is not null then
    delete from vibies_private.sessions where session_hash = p_old_session_hash;
  end if;

  if p_github_id <> instructor_id then
    insert into vibies_private.accounts (github_id, github_username)
    values (p_github_id, p_username)
    on conflict (github_id) do update
      set github_username = excluded.github_username;
  end if;

  insert into vibies_private.sessions (session_hash, github_id)
  values (p_session_hash, p_github_id);
end;
$$;

create or replace function vibies_private.end_session(p_session_hash text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, vibies_private
as $$
begin
  if vibies_private._valid_hash(p_session_hash) then
    delete from vibies_private.sessions where session_hash = p_session_hash;
  end if;
end;
$$;

create or replace function vibies_private.project_actor(p_session_hash text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, vibies_private
as $$
declare
  result jsonb;
begin
  if not vibies_private._valid_hash(p_session_hash) then
    return jsonb_build_object('kind', 'forbidden');
  end if;
  select jsonb_build_object(
    'kind', 'ok',
    'githubId', a.github_id,
    'username', a.github_username
  ) into result
    from vibies_private.sessions s
    join vibies_private.accounts a on a.github_id = s.github_id
   where s.session_hash = p_session_hash
     and s.created_at > clock_timestamp() - interval '24 hours'
     and a.status = 'approved';
  return coalesce(result, jsonb_build_object('kind', 'forbidden'));
end;
$$;

create or replace function vibies_private.project_operation_context(
  p_session_hash text,
  p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, vibies_private
as $$
declare
  result jsonb;
begin
  if not vibies_private._valid_hash(p_session_hash) then
    return jsonb_build_object('kind', 'forbidden');
  end if;
  select jsonb_build_object(
    'kind', 'ok',
    'githubId', a.github_id,
    'username', a.github_username,
    'repositoryId', p.repository_id,
    'version', p.version::text,
    'publication', p.publication,
    'connection', p.connection,
    'moderation', p.moderation
  ) into result
    from vibies_private.sessions s
    join vibies_private.accounts a on a.github_id = s.github_id
    join vibies_private.personal_projects p on p.owner_account_id = a.internal_id
   where s.session_hash = p_session_hash
     and s.created_at > clock_timestamp() - interval '24 hours'
     and a.status = 'approved'
     and p.id = p_project_id;
  return coalesce(result, jsonb_build_object('kind', 'forbidden'));
end;
$$;

create or replace function vibies_private.connect_project(
  p_session_hash text,
  p_repository_id text,
  p_title text,
  p_summary text,
  p_demo_url text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, vibies_private
as $$
declare
  actor_id uuid;
  existing_owner uuid;
  existing_id uuid;
  existing_version bigint;
  created_id uuid;
begin
  if not vibies_private._valid_hash(p_session_hash)
     or p_repository_id is null or p_repository_id !~ '^[1-9][0-9]{0,15}$'
     or not coalesce(vibies_private._valid_project_text(p_title, 80, false), false)
     or not coalesce(vibies_private._valid_project_text(p_summary, 500, true), false)
     or not coalesce(vibies_private._valid_project_url(p_demo_url), false) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  perform 1 from vibies_private.community where singleton for update;
  select a.internal_id into actor_id
    from vibies_private.sessions s
    join vibies_private.accounts a on a.github_id = s.github_id
   where s.session_hash = p_session_hash
     and s.created_at > clock_timestamp() - interval '24 hours'
     and a.status = 'approved'
   for update of a;
  if not found then
    return jsonb_build_object('kind', 'forbidden');
  end if;

  select owner_account_id, id, version
    into existing_owner, existing_id, existing_version
    from vibies_private.personal_projects
   where repository_id = p_repository_id
   for update;
  if found then
    if existing_owner = actor_id then
      return jsonb_build_object(
        'kind', 'existing', 'id', existing_id, 'version', existing_version::text
      );
    end if;
    return jsonb_build_object('kind', 'conflict');
  end if;

  -- ponytail: the shared Community row serializes this tiny club. Use a
  -- per-Member capacity lock only if project creation throughput matters.
  if (select count(*) from vibies_private.personal_projects
       where owner_account_id = actor_id) >= 3 then
    return jsonb_build_object('kind', 'full');
  end if;

  insert into vibies_private.personal_projects (
    owner_account_id, repository_id, title, summary, demo_url, last_checked_at
  ) values (
    actor_id, p_repository_id, p_title, p_summary, p_demo_url, clock_timestamp()
  ) returning id into created_id;
  return jsonb_build_object('kind', 'created', 'id', created_id, 'version', '1');
end;
$$;

create or replace function vibies_private.publish_project(
  p_session_hash text,
  p_project_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, vibies_private
as $$
declare
  actor_id uuid;
  project_row vibies_private.personal_projects%rowtype;
begin
  if not vibies_private._valid_hash(p_session_hash)
     or p_expected_version is null or p_expected_version < 1 then
    return jsonb_build_object('kind', 'invalid');
  end if;

  perform 1 from vibies_private.community where singleton for update;
  select a.internal_id into actor_id
    from vibies_private.sessions s
    join vibies_private.accounts a on a.github_id = s.github_id
   where s.session_hash = p_session_hash
     and s.created_at > clock_timestamp() - interval '24 hours'
     and a.status = 'approved'
   for update of a;
  if not found then
    return jsonb_build_object('kind', 'forbidden');
  end if;

  select * into project_row
   from vibies_private.personal_projects
   where id = p_project_id and owner_account_id = actor_id
   for update;
  if not found then
    return jsonb_build_object('kind', 'forbidden');
  end if;
  if project_row.version <> p_expected_version then
    return jsonb_build_object('kind', 'stale');
  end if;
  if project_row.connection <> 'Connected'
     or project_row.publication = 'Archived' then
    return jsonb_build_object('kind', 'invalid');
  end if;
  if project_row.publication = 'Published' then
    return jsonb_build_object('kind', 'already_published');
  end if;

  -- The server route establishes fresh GitHub verification before this call.
  update vibies_private.personal_projects
     set publication = 'Published',
         updated_at = clock_timestamp(),
         version = version + 1
   where id = p_project_id;
  update vibies_private.accounts
     set onboarding_completed = true
   where internal_id = actor_id;
  return jsonb_build_object('kind', 'published');
end;
$$;

create or replace function vibies_private.record_project_connection(
  p_session_hash text,
  p_project_id uuid,
  p_expected_version bigint,
  p_connected boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, vibies_private
as $$
declare
  actor_id uuid;
  project_row vibies_private.personal_projects%rowtype;
begin
  if not vibies_private._valid_hash(p_session_hash)
     or p_expected_version is null or p_expected_version < 1
     or p_connected is null then
    return jsonb_build_object('kind', 'invalid');
  end if;

  perform 1 from vibies_private.community where singleton for update;
  select a.internal_id into actor_id
    from vibies_private.sessions s
    join vibies_private.accounts a on a.github_id = s.github_id
   where s.session_hash = p_session_hash
     and s.created_at > clock_timestamp() - interval '24 hours'
     and a.status = 'approved'
   for update of a;
  if not found then
    return jsonb_build_object('kind', 'forbidden');
  end if;

  select * into project_row
   from vibies_private.personal_projects
   where id = p_project_id and owner_account_id = actor_id
   for update;
  if not found then
    return jsonb_build_object('kind', 'forbidden');
  end if;
  if project_row.version <> p_expected_version then
    return jsonb_build_object('kind', 'stale');
  end if;

  update vibies_private.personal_projects
     set connection = case when p_connected then 'Connected' else 'Disconnected' end,
         last_checked_at = case when p_connected then clock_timestamp() else last_checked_at end,
         updated_at = clock_timestamp(),
         version = version + 1
   where id = p_project_id;
  return jsonb_build_object(
    'kind', case when p_connected then 'connected' else 'disconnected' end
  );
end;
$$;

create or replace function vibies_private.projects(p_session_hash text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, vibies_private
as $$
declare
  actor_account_id uuid;
  actor_nickname text;
  is_instructor boolean;
  mine jsonb := '[]'::jsonb;
  shared jsonb;
begin
  if not vibies_private._valid_hash(p_session_hash) then
    return jsonb_build_object('kind', 'forbidden');
  end if;
  select a.internal_id,
         s.github_id = c.instructor_github_id,
         a.nickname
    into actor_account_id, is_instructor, actor_nickname
    from vibies_private.sessions s
    cross join vibies_private.community c
    left join vibies_private.accounts a on a.github_id = s.github_id
   where s.session_hash = p_session_hash
     and s.created_at > clock_timestamp() - interval '24 hours'
     and (s.github_id = c.instructor_github_id or a.status = 'approved');
  if not found then
    return jsonb_build_object('kind', 'forbidden');
  end if;

  if not is_instructor then
    select coalesce(jsonb_agg(item order by created_at, id), '[]'::jsonb)
      into mine
      from (
        select p.created_at, p.id, jsonb_build_object(
          'id', p.id,
          'title', p.title,
          'summary', p.summary,
          'demoUrl', p.demo_url,
          'nickname', actor_nickname,
          'isOwner', true,
          'publication', p.publication,
          'connection', p.connection,
          'moderation', p.moderation,
          'version', p.version::text,
          'lastCheckedAt', p.last_checked_at
        ) as item
          from vibies_private.personal_projects p
         where p.owner_account_id = actor_account_id
      ) rows;
  end if;

  select coalesce(jsonb_agg(item order by created_at, id), '[]'::jsonb)
    into shared
    from (
      select p.created_at, p.id, jsonb_build_object(
        'id', p.id,
        'title', p.title,
        'summary', p.summary,
        'demoUrl', p.demo_url,
        'nickname', a.nickname,
        'isOwner', p.owner_account_id is not distinct from actor_account_id
      ) as item
        from vibies_private.personal_projects p
        join vibies_private.accounts a on a.internal_id = p.owner_account_id
       where p.publication = 'Published'
         and p.connection = 'Connected'
         and p.moderation = 'Visible'
    ) rows;
  return jsonb_build_object('kind', 'ok', 'mine', mine, 'community', shared);
end;
$$;

create or replace function vibies_private.project(
  p_session_hash text,
  p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, vibies_private
as $$
declare
  actor_account_id uuid;
  is_instructor boolean;
  project_row vibies_private.personal_projects%rowtype;
  owner_nickname text;
  details jsonb;
begin
  if not vibies_private._valid_hash(p_session_hash) then
    return jsonb_build_object('kind', 'forbidden');
  end if;
  select a.internal_id, s.github_id = c.instructor_github_id
    into actor_account_id, is_instructor
    from vibies_private.sessions s
    cross join vibies_private.community c
    left join vibies_private.accounts a on a.github_id = s.github_id
   where s.session_hash = p_session_hash
     and s.created_at > clock_timestamp() - interval '24 hours'
     and (s.github_id = c.instructor_github_id or a.status = 'approved');
  if not found then
    return jsonb_build_object('kind', 'forbidden');
  end if;

  select p.* into project_row
    from vibies_private.personal_projects p
   where p.id = p_project_id;
  if not found then
    return jsonb_build_object('kind', 'missing');
  end if;
  select nickname into owner_nickname
    from vibies_private.accounts
   where internal_id = project_row.owner_account_id;

  if project_row.owner_account_id is distinct from actor_account_id
     and not (
       project_row.publication = 'Published'
       and project_row.connection = 'Connected'
       and project_row.moderation = 'Visible'
     )
     and not (is_instructor and project_row.moderation = 'Hidden') then
    return jsonb_build_object('kind', 'missing');
  end if;

  details := jsonb_build_object(
    'id', project_row.id,
    'title', project_row.title,
    'summary', project_row.summary,
    'demoUrl', project_row.demo_url,
    'nickname', owner_nickname,
    'isOwner', project_row.owner_account_id is not distinct from actor_account_id
  );
  if project_row.owner_account_id is not distinct from actor_account_id
     or (is_instructor and project_row.moderation = 'Hidden') then
    details := details || jsonb_build_object(
      'publication', project_row.publication,
      'connection', project_row.connection,
      'moderation', project_row.moderation,
      'version', project_row.version::text,
      'lastCheckedAt', project_row.last_checked_at
    );
  end if;
  return jsonb_build_object('kind', 'ok', 'project', details);
end;
$$;

create or replace function vibies_private.designate_instructor(
  p_github_id text,
  p_nickname text,
  p_reason text
)
returns void
language plpgsql
set search_path = pg_catalog, vibies_private
as $$
declare
  normalized text := vibies_private._normalized_nickname(p_nickname);
  previous_id text;
  target_status text;
begin
  if p_github_id is null or p_github_id !~ '^[1-9][0-9]{0,63}$'
     or normalized is null
     or p_reason is null or char_length(btrim(p_reason, ' ')) not between 1 and 500 then
    raise exception 'Invalid Instructor designation';
  end if;

  select instructor_github_id into previous_id
    from vibies_private.community
   where singleton
   for update;
  select status into target_status from vibies_private.accounts
   where github_id = p_github_id;
  if target_status in ('approved', 'revoked') then
    raise exception 'An existing Member cannot be designated as Instructor';
  end if;
  if exists (
    select 1 from vibies_private.accounts
     where nickname is not null
       and lower(nickname collate pg_catalog."unicode") =
           lower(normalized collate pg_catalog."unicode")
       and github_id <> p_github_id
  ) then
    raise exception 'Instructor nickname is already reserved';
  end if;

  delete from vibies_private.sessions
   where github_id = previous_id or github_id = p_github_id;
  delete from vibies_private.accounts
   where github_id = p_github_id and status = 'unapproved';
  update vibies_private.community
     set instructor_github_id = p_github_id,
         instructor_nickname = normalized
   where singleton;
  insert into vibies_private.instructor_audit (
    previous_github_id, new_github_id, reason
  ) values (previous_id, p_github_id, btrim(p_reason, ' '));
end;
$$;

revoke all on all tables in schema vibies_private from public, vibies_runtime;
revoke all on all sequences in schema vibies_private from public, vibies_runtime;
revoke all on all functions in schema vibies_private from public, vibies_runtime;
grant usage on schema vibies_private to vibies_runtime;
grant execute on function vibies_private.access_state(text) to vibies_runtime;
grant execute on function vibies_private.members(text) to vibies_runtime;
grant execute on function vibies_private.change_member(text, text, text, text) to vibies_runtime;
grant execute on function vibies_private.begin_sign_in(text, text) to vibies_runtime;
grant execute on function vibies_private.consume_sign_in(text, text) to vibies_runtime;
grant execute on function vibies_private.finish_sign_in(text, text, text, text) to vibies_runtime;
grant execute on function vibies_private.end_session(text) to vibies_runtime;
grant execute on function vibies_private.project_actor(text) to vibies_runtime;
grant execute on function vibies_private.project_operation_context(text, uuid) to vibies_runtime;
grant execute on function vibies_private.connect_project(text, text, text, text, text) to vibies_runtime;
grant execute on function vibies_private.publish_project(text, uuid, bigint) to vibies_runtime;
grant execute on function vibies_private.record_project_connection(text, uuid, bigint, boolean) to vibies_runtime;
grant execute on function vibies_private.projects(text) to vibies_runtime;
grant execute on function vibies_private.project(text, uuid) to vibies_runtime;

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on schema vibies_private from %I', role_name);
      execute format(
        'revoke all on all tables in schema vibies_private from %I', role_name
      );
      execute format(
        'revoke all on all sequences in schema vibies_private from %I', role_name
      );
      execute format(
        'revoke all on all functions in schema vibies_private from %I', role_name
      );
    end if;
  end loop;
end;
$$;

alter default privileges in schema vibies_private revoke all on tables from public;
alter default privileges in schema vibies_private revoke all on sequences from public;
alter default privileges in schema vibies_private revoke all on functions from public;

commit;
