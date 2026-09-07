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
create unique index if not exists accounts_nickname_unique
  on vibies_private.accounts (lower(nickname))
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
     or normalized !~ '^[[:alnum:] _-]+$' then
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
    if lower(normalized) = lower(instructor_name)
       or exists (
         select 1 from vibies_private.accounts
          where nickname is not null
            and lower(nickname) = lower(normalized)
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
     where nickname is not null and lower(nickname) = lower(normalized)
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
