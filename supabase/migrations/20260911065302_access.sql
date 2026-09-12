
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
  instructor_actor_id uuid not null default gen_random_uuid(),
  check ((instructor_github_id is null) = (instructor_nickname is null))
);
insert into vibies_private.community (singleton) values (true)
on conflict (singleton) do nothing;
alter table vibies_private.community
  add column if not exists instructor_actor_id uuid;
update vibies_private.community
   set instructor_actor_id = gen_random_uuid()
 where instructor_actor_id is null;
alter table vibies_private.community
  alter column instructor_actor_id set default gen_random_uuid(),
  alter column instructor_actor_id set not null;

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

create or replace function vibies_private._normalized_error_text(value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select btrim(replace(replace(value, E'\r\n', E'\n'), E'\r', E'\n'), ' ');
$$;

create or replace function vibies_private._valid_error_text(
  value text,
  p_min_length integer,
  p_max_length integer
)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog, vibies_private
as $$
  select char_length(value) between p_min_length and p_max_length
    and value = vibies_private._normalized_error_text(value)
    and vibies_private._valid_project_text(value, p_max_length, true);
$$;

create or replace function vibies_private._error_url_is_local(value text)
returns boolean
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  authority text;
  closing_bracket integer;
  host text;
  address inet;
begin
  for authority in
    select parts[1]
      from pg_catalog.regexp_matches(
        value, 'https?://([^/?#[:space:]]+)', 'gi'
      ) as matches(parts)
  loop
    host := authority;
    if left(host, 1) = '[' then
      closing_bracket := strpos(host, ']');
      if closing_bracket = 0
         or substr(host, closing_bracket + 1) !~ '^(:[0-9]+)?$' then
        return true;
      end if;
      host := substr(host, 2, closing_bracket - 2);
    elsif host ~ '^[^:]+:[0-9]+$' then
      host := regexp_replace(host, ':[0-9]+$', '');
    elsif strpos(host, ':') > 0 then
      return true;
    end if;

    if host ~* '(^|\.)(0x[0-9a-f]+|0[0-9]+)(\.|$)' then
      return true;
    end if;
    if host !~* '^(0x[0-9a-f]+|[0-9]+)(\.(0x[0-9a-f]+|[0-9]+)){0,3}\.?$'
       and strpos(host, ':') = 0 then
      continue;
    end if;

    begin
      address := host::inet;
    exception when invalid_text_representation then
      return true;
    end;
    if address <<= any(array[
      '0.0.0.0/8'::inet,
      '10.0.0.0/8'::inet,
      '127.0.0.0/8'::inet,
      '169.254.0.0/16'::inet,
      '172.16.0.0/12'::inet,
      '192.168.0.0/16'::inet,
      '::/128'::inet,
      '::1/128'::inet,
      'fc00::/7'::inet,
      'fe80::/10'::inet,
      '::ffff:0.0.0.0/104'::inet,
      '::ffff:10.0.0.0/104'::inet,
      '::ffff:127.0.0.0/104'::inet,
      '::ffff:169.254.0.0/112'::inet,
      '::ffff:172.16.0.0/108'::inet,
      '::ffff:192.168.0.0/112'::inet
    ]) then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

create or replace function vibies_private._error_privacy_category(p_values text[])
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  value text;
  without_https text;
begin
  foreach value in array p_values loop
    if value is null then
      continue;
    end if;
    if value ~* $pattern$-----BEGIN[[:space:]]+(RSA[[:space:]]+|EC[[:space:]]+|DSA[[:space:]]+|OPENSSH[[:space:]]+|ENCRYPTED[[:space:]]+)?PRIVATE KEY-----$pattern$ then
      return 'private_key';
    end if;
    if value ~* $pattern$(postgres(ql)?|mysql|mariadb|mongodb(\+srv)?|redis)://[^[:space:]@/:]+:[^[:space:]@/]+@$pattern$ then
      return 'database_url';
    end if;
    if value ~* $pattern$[a-z][a-z0-9+.-]*://[^/?#[:space:]]*@$pattern$ then
      return 'url_credentials';
    end if;
    if value ~* $pattern$https://[^[:space:]]*[?&](access_token|token|api_key|apikey|secret|password|passwd|auth|authorization)=[^&#[:space:]]+$pattern$
       or value ~* $pattern$https://[^[:space:]]*[?&][^=&#[:space:]]*%[0-9a-f]{2}[^=&#[:space:]]*=[^&#[:space:]]+$pattern$ then
      return 'url_token';
    end if;
    if vibies_private._error_url_is_local(value)
       or value ~* $pattern$https?://(localhost\.?|[^./:[:space:]]+\.localhost\.?|[^./:[:space:]]+\.(local|internal)\.?)(:[0-9]+)?([/?#[:space:]]|$)$pattern$
       or value ~* $pattern$https?://[^./:@[:space:]]+(:[0-9]+)?([/?#[:space:]]|$)$pattern$
       or value ~* $pattern$https?://[^/?#[:space:]]*%[0-9a-f]{2}[^/?#[:space:]]*$pattern$ then
      return 'local_url';
    end if;
    without_https := regexp_replace(value, 'https://', '', 'gi');
    if without_https ~* $pattern$[a-z][a-z0-9+.-]*://$pattern$ then
      return 'unsafe_url';
    end if;
    if value ~ $pattern$(github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|(AKIA|ASIA)[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|npm_[A-Za-z0-9]{20,}|[sr]k_(live|test)_[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{35}|sbp_[A-Za-z0-9]{30,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})$pattern$ then
      return 'known_token';
    end if;
    if value ~* $pattern$[[:alnum:]._%+-]+@[[:alnum:]-]+(\.[[:alnum:]-]+)+$pattern$ then
      return 'email';
    end if;
    if value ~* $pattern$(^|\n)[ ]*(export[ ]+)?(SECRET|TOKEN|PASSWORD|PASSWD|PWD|PRIVATE_KEY|API_KEY|DATABASE_URL|DB_URL|CONNECTION_STRING|[A-Za-z_][A-Za-z0-9_]*_(SECRET|TOKEN|PASSWORD|PASSWD|PWD|KEY|PRIVATE_KEY|API_KEY|DATABASE_URL|DB_URL|CONNECTION_STRING))[ ]*=$pattern$ then
      return 'env_secret';
    end if;
    if value ~* $pattern$(^|[[:space:]('"=])(~/|/(Users|home|root)/[^/[:space:]]+|[A-Za-z]:\\Users\\[^\\[:space:]]+)$pattern$ then
      return 'home_path';
    end if;
  end loop;
  return null;
end;
$$;

create table if not exists vibies_private.error_entries (
  id uuid primary key default gen_random_uuid(),
  author_actor_id uuid not null,
  author_nickname text not null
    check (coalesce(
      vibies_private._normalized_nickname(author_nickname) = author_nickname,
      false
    )),
  title text not null
    check (vibies_private._valid_error_text(title, 5, 120)),
  error_text text not null
    check (vibies_private._valid_error_text(error_text, 1, 2000)),
  location text not null
    check (vibies_private._valid_error_text(location, 2, 200)),
  cause text not null
    check (vibies_private._valid_error_text(cause, 1, 2000)),
  fix_steps text not null
    check (vibies_private._valid_error_text(fix_steps, 1, 5000)),
  success_confirmation text not null
    check (vibies_private._valid_error_text(success_confirmation, 1, 1000)),
  moderation text not null default 'Visible'
    check (moderation in ('Visible', 'Hidden')),
  keep_note text,
  improve_note text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  version bigint not null default 1 check (version > 0),
  check (created_at <= updated_at),
  check (
    (moderation = 'Visible' and keep_note is null and improve_note is null)
    or (
      moderation = 'Hidden'
      and coalesce(vibies_private._valid_error_text(keep_note, 1, 500), false)
      and coalesce(vibies_private._valid_error_text(improve_note, 1, 500), false)
    )
  ),
  check (vibies_private._error_privacy_category(array[
    title, error_text, location, cause, fix_steps, success_confirmation,
    keep_note, improve_note
  ]) is null)
);
create index if not exists error_entries_moderation_updated_idx
  on vibies_private.error_entries (moderation, updated_at desc, id desc);
create index if not exists error_entries_author_updated_idx
  on vibies_private.error_entries (author_actor_id, updated_at desc, id desc);

create table if not exists vibies_private.error_helpful_reactions (
  entry_id uuid not null references vibies_private.error_entries (id)
    on delete cascade,
  actor_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (entry_id, actor_id)
);

create or replace function vibies_private._error_actor(p_session_hash text)
returns table (actor_id uuid, actor_nickname text, actor_role text)
language sql
security definer
set search_path = pg_catalog, vibies_private
as $$
  select c.instructor_actor_id, c.instructor_nickname, 'instructor'::text
    from vibies_private.sessions s
    join vibies_private.community c on c.instructor_github_id = s.github_id
   where vibies_private._valid_hash(p_session_hash)
     and s.session_hash = p_session_hash
     and s.created_at > clock_timestamp() - interval '24 hours'
  union all
  select a.internal_id, a.nickname, 'member'::text
    from vibies_private.sessions s
    join vibies_private.accounts a on a.github_id = s.github_id
   where vibies_private._valid_hash(p_session_hash)
     and s.session_hash = p_session_hash
     and s.created_at > clock_timestamp() - interval '24 hours'
     and a.status = 'approved'
  limit 1;
$$;

create or replace function vibies_private._error_helpful_count(p_entry_id uuid)
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, vibies_private
as $$
  select count(*)
    from vibies_private.error_helpful_reactions r
   where r.entry_id = p_entry_id
     and (
       exists (
         select 1 from vibies_private.accounts a
          where a.internal_id = r.actor_id and a.status = 'approved'
       )
       or exists (
         select 1 from vibies_private.community c
          where c.instructor_github_id is not null
            and c.instructor_actor_id = r.actor_id
       )
     );
$$;

create or replace function vibies_private._error_segment(value text, p_query text)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  match_at integer;
begin
  if p_query = '' then
    return left(value, 160);
  end if;
  match_at := strpos(
    lower(value collate pg_catalog."unicode"),
    lower(p_query collate pg_catalog."unicode")
  );
  return substr(value, greatest(match_at - 60, 1), 160);
end;
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

create or replace function vibies_private.edit_project(
  p_session_hash text,
  p_project_id uuid,
  p_expected_version bigint,
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
  project_version bigint;
begin
  if not vibies_private._valid_hash(p_session_hash)
     or p_project_id is null
     or p_expected_version is null or p_expected_version < 1
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

  select version into project_version
    from vibies_private.personal_projects
   where id = p_project_id and owner_account_id = actor_id
   for update;
  if not found then
    return jsonb_build_object('kind', 'forbidden');
  end if;
  if project_version <> p_expected_version then
    return jsonb_build_object('kind', 'stale');
  end if;

  update vibies_private.personal_projects
     set title = p_title,
         summary = p_summary,
         demo_url = p_demo_url,
         updated_at = clock_timestamp(),
         version = version + 1
   where id = p_project_id;
  return jsonb_build_object('kind', 'edited');
end;
$$;

create or replace function vibies_private.delete_project(
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
  project_version bigint;
begin
  if not vibies_private._valid_hash(p_session_hash)
     or p_project_id is null
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

  select version into project_version
    from vibies_private.personal_projects
   where id = p_project_id and owner_account_id = actor_id
   for update;
  if not found then
    return jsonb_build_object('kind', 'forbidden');
  end if;
  if project_version <> p_expected_version then
    return jsonb_build_object('kind', 'stale');
  end if;

  delete from vibies_private.personal_projects where id = p_project_id;
  return jsonb_build_object('kind', 'deleted');
end;
$$;

drop function if exists vibies_private.moderate_project(text, uuid, boolean);

create or replace function vibies_private.moderate_project(
  p_session_hash text,
  p_project_id uuid,
  p_expected_version bigint,
  p_hidden boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, vibies_private
as $$
declare
  project_moderation text;
  project_version bigint;
begin
  if not vibies_private._valid_hash(p_session_hash)
     or p_project_id is null
     or p_expected_version is null or p_expected_version < 1
     or p_hidden is null then
    return jsonb_build_object('kind', 'invalid');
  end if;

  perform 1
    from vibies_private.community c
    join vibies_private.sessions s on s.github_id = c.instructor_github_id
   where c.singleton
     and s.session_hash = p_session_hash
     and s.created_at > clock_timestamp() - interval '24 hours'
   for update of c;
  if not found then
    return jsonb_build_object('kind', 'forbidden');
  end if;

  select moderation, version into project_moderation, project_version
    from vibies_private.personal_projects
   where id = p_project_id
     and (
       moderation = 'Hidden'
       or (
         publication = 'Published'
         and connection = 'Connected'
         and moderation = 'Visible'
       )
     )
   for update;
  if not found then
    return jsonb_build_object('kind', 'forbidden');
  end if;
  if project_version <> p_expected_version then
    return jsonb_build_object('kind', 'stale');
  end if;

  if (p_hidden and project_moderation = 'Hidden')
     or (not p_hidden and project_moderation = 'Visible') then
    return jsonb_build_object('kind', case when p_hidden then 'hidden' else 'restored' end);
  end if;

  update vibies_private.personal_projects
     set moderation = case when p_hidden then 'Hidden' else 'Visible' end,
         version = version + 1
   where id = p_project_id;
  return jsonb_build_object('kind', case when p_hidden then 'hidden' else 'restored' end);
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
  elsif is_instructor then
    details := details || jsonb_build_object('version', project_row.version::text);
  end if;
  return jsonb_build_object('kind', 'ok', 'project', details);
end;
$$;

create or replace function vibies_private.errors(
  p_session_hash text,
  p_scope text,
  p_query text,
  p_cursor_time timestamptz,
  p_cursor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, vibies_private
as $$
declare
  actor record;
  needle text;
  result jsonb;
begin
  if not vibies_private._valid_hash(p_session_hash) then
    return jsonb_build_object('kind', 'forbidden');
  end if;
  if p_scope is null or p_scope not in ('visible', 'mine', 'hidden')
     or p_query is null
     or ((p_cursor_time is null) <> (p_cursor_id is null)) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  select * into actor from vibies_private._error_actor(p_session_hash);
  if not found or (p_scope = 'hidden' and actor.actor_role <> 'instructor') then
    return jsonb_build_object('kind', 'forbidden');
  end if;
  needle := lower(p_query collate pg_catalog."unicode");

  -- ponytail: a sequential six-field scan fits this eight-person library;
  -- add pg_trgm only after measured data growth makes search slow.
  with eligible as materialized (
    select e.*
      from vibies_private.error_entries e
     where case p_scope
       when 'visible' then e.moderation = 'Visible'
       when 'mine' then e.author_actor_id = actor.actor_id
       when 'hidden' then e.moderation = 'Hidden'
     end
       and (
         p_cursor_time is null
         or (e.updated_at, e.id) < (p_cursor_time, p_cursor_id)
       )
  ), matched as (
    select e.*,
      case
        when p_query = '' then e.error_text
        when strpos(lower(e.title collate pg_catalog."unicode"), needle) > 0
          then e.title
        when strpos(lower(e.error_text collate pg_catalog."unicode"), needle) > 0
          then e.error_text
        when strpos(lower(e.location collate pg_catalog."unicode"), needle) > 0
          then e.location
        when strpos(lower(e.cause collate pg_catalog."unicode"), needle) > 0
          then e.cause
        when strpos(lower(e.fix_steps collate pg_catalog."unicode"), needle) > 0
          then e.fix_steps
        when strpos(lower(e.success_confirmation collate pg_catalog."unicode"), needle) > 0
          then e.success_confirmation
      end as segment_source
      from eligible e
     where p_query = ''
        or strpos(lower(e.title collate pg_catalog."unicode"), needle) > 0
        or strpos(lower(e.error_text collate pg_catalog."unicode"), needle) > 0
        or strpos(lower(e.location collate pg_catalog."unicode"), needle) > 0
        or strpos(lower(e.cause collate pg_catalog."unicode"), needle) > 0
        or strpos(lower(e.fix_steps collate pg_catalog."unicode"), needle) > 0
        or strpos(lower(e.success_confirmation collate pg_catalog."unicode"), needle) > 0
  ), page as materialized (
    select m.*,
           vibies_private._error_helpful_count(m.id) as helpful_count,
           vibies_private._error_segment(m.segment_source, p_query) as segment
      from matched m
     order by m.updated_at desc, m.id desc
     limit 21
  ), numbered as (
    select p.*,
           row_number() over (order by p.updated_at desc, p.id desc) as page_number
      from page p
  )
  select jsonb_build_object(
    'kind', 'ok',
    'entries', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', n.id,
          'title', n.title,
          'nickname', n.author_nickname,
          'updatedAt', n.updated_at,
          'helpfulCount', n.helpful_count,
          'segment', n.segment
        ) order by n.updated_at desc, n.id desc
      )
        from numbered n
       where n.page_number <= 20
    ), '[]'::jsonb),
    'nextCursor', case when exists (
      select 1 from numbered n where n.page_number = 21
    ) then (
      select jsonb_build_object('updatedAt', n.updated_at, 'id', n.id)
        from numbered n where n.page_number = 20
    ) else null end
  ) into result;
  return result;
end;
$$;

create or replace function vibies_private.error(
  p_session_hash text,
  p_entry_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, vibies_private
as $$
declare
  actor record;
  entry_row vibies_private.error_entries%rowtype;
  details jsonb;
begin
  if not vibies_private._valid_hash(p_session_hash) then
    return jsonb_build_object('kind', 'forbidden');
  end if;
  if p_entry_id is null then
    return jsonb_build_object('kind', 'invalid');
  end if;
  select * into actor from vibies_private._error_actor(p_session_hash);
  if not found then
    return jsonb_build_object('kind', 'forbidden');
  end if;

  select e.* into entry_row
    from vibies_private.error_entries e
   where e.id = p_entry_id
     and (
       e.moderation = 'Visible'
       or e.author_actor_id = actor.actor_id
       or actor.actor_role = 'instructor'
     );
  if not found then
    return jsonb_build_object('kind', 'missing');
  end if;

  details := jsonb_build_object(
    'id', entry_row.id,
    'title', entry_row.title,
    'errorText', entry_row.error_text,
    'location', entry_row.location,
    'cause', entry_row.cause,
    'fixSteps', entry_row.fix_steps,
    'successConfirmation', entry_row.success_confirmation,
    'nickname', entry_row.author_nickname,
    'createdAt', entry_row.created_at,
    'updatedAt', entry_row.updated_at,
    'version', entry_row.version::text,
    'isAuthor', entry_row.author_actor_id = actor.actor_id,
    'helpfulCount', vibies_private._error_helpful_count(entry_row.id),
    'helpfulByMe', exists (
      select 1 from vibies_private.error_helpful_reactions r
       where r.entry_id = entry_row.id and r.actor_id = actor.actor_id
    )
  );
  if entry_row.moderation = 'Hidden' then
    details := details || jsonb_build_object(
      'moderation', 'Hidden',
      'keep', entry_row.keep_note,
      'improve', entry_row.improve_note
    );
  end if;
  return jsonb_build_object('kind', 'ok', 'entry', details);
end;
$$;

create or replace function vibies_private.create_error(
  p_session_hash text,
  p_title text,
  p_error_text text,
  p_location text,
  p_cause text,
  p_fix_steps text,
  p_success_confirmation text,
  p_privacy_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, vibies_private
as $$
declare
  actor record;
  title_value text := vibies_private._normalized_error_text(p_title);
  error_value text := vibies_private._normalized_error_text(p_error_text);
  location_value text := vibies_private._normalized_error_text(p_location);
  cause_value text := vibies_private._normalized_error_text(p_cause);
  fix_value text := vibies_private._normalized_error_text(p_fix_steps);
  success_value text := vibies_private._normalized_error_text(p_success_confirmation);
  privacy_category text;
  created_id uuid;
begin
  if not vibies_private._valid_hash(p_session_hash) then
    return jsonb_build_object('kind', 'forbidden');
  end if;
  perform 1 from vibies_private.community where singleton for update;
  select * into actor from vibies_private._error_actor(p_session_hash);
  if not found then
    return jsonb_build_object('kind', 'forbidden');
  end if;
  if p_privacy_confirmed is distinct from true then
    return jsonb_build_object('kind', 'confirmation');
  end if;
  if not coalesce(vibies_private._valid_error_text(title_value, 5, 120), false)
     or not coalesce(vibies_private._valid_error_text(error_value, 1, 2000), false)
     or not coalesce(vibies_private._valid_error_text(location_value, 2, 200), false)
     or not coalesce(vibies_private._valid_error_text(cause_value, 1, 2000), false)
     or not coalesce(vibies_private._valid_error_text(fix_value, 1, 5000), false)
     or not coalesce(vibies_private._valid_error_text(success_value, 1, 1000), false) then
    return jsonb_build_object('kind', 'invalid');
  end if;
  privacy_category := vibies_private._error_privacy_category(array[
    title_value, error_value, location_value, cause_value, fix_value, success_value
  ]);
  if privacy_category is not null then
    return jsonb_build_object('kind', 'privacy', 'category', privacy_category);
  end if;

  insert into vibies_private.error_entries (
    author_actor_id, author_nickname, title, error_text, location, cause,
    fix_steps, success_confirmation
  ) values (
    actor.actor_id, actor.actor_nickname, title_value, error_value, location_value,
    cause_value, fix_value, success_value
  ) returning id into created_id;
  return jsonb_build_object('kind', 'created', 'id', created_id, 'version', '1');
end;
$$;

create or replace function vibies_private.edit_error(
  p_session_hash text,
  p_entry_id uuid,
  p_expected_version bigint,
  p_title text,
  p_error_text text,
  p_location text,
  p_cause text,
  p_fix_steps text,
  p_success_confirmation text,
  p_privacy_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, vibies_private
as $$
declare
  actor record;
  entry_version bigint;
  title_value text := vibies_private._normalized_error_text(p_title);
  error_value text := vibies_private._normalized_error_text(p_error_text);
  location_value text := vibies_private._normalized_error_text(p_location);
  cause_value text := vibies_private._normalized_error_text(p_cause);
  fix_value text := vibies_private._normalized_error_text(p_fix_steps);
  success_value text := vibies_private._normalized_error_text(p_success_confirmation);
  privacy_category text;
begin
  if not vibies_private._valid_hash(p_session_hash) then
    return jsonb_build_object('kind', 'forbidden');
  end if;
  if p_entry_id is null or p_expected_version is null or p_expected_version < 1 then
    return jsonb_build_object('kind', 'invalid');
  end if;
  perform 1 from vibies_private.community where singleton for update;
  select * into actor from vibies_private._error_actor(p_session_hash);
  if not found then
    return jsonb_build_object('kind', 'forbidden');
  end if;
  select e.version into entry_version
    from vibies_private.error_entries e
   where e.id = p_entry_id and e.author_actor_id = actor.actor_id
   for update;
  if not found then
    return jsonb_build_object('kind', 'forbidden');
  end if;
  if entry_version <> p_expected_version then
    return jsonb_build_object('kind', 'stale');
  end if;
  if p_privacy_confirmed is distinct from true then
    return jsonb_build_object('kind', 'confirmation');
  end if;
  if not coalesce(vibies_private._valid_error_text(title_value, 5, 120), false)
     or not coalesce(vibies_private._valid_error_text(error_value, 1, 2000), false)
     or not coalesce(vibies_private._valid_error_text(location_value, 2, 200), false)
     or not coalesce(vibies_private._valid_error_text(cause_value, 1, 2000), false)
     or not coalesce(vibies_private._valid_error_text(fix_value, 1, 5000), false)
     or not coalesce(vibies_private._valid_error_text(success_value, 1, 1000), false) then
    return jsonb_build_object('kind', 'invalid');
  end if;
  privacy_category := vibies_private._error_privacy_category(array[
    title_value, error_value, location_value, cause_value, fix_value, success_value
  ]);
  if privacy_category is not null then
    return jsonb_build_object('kind', 'privacy', 'category', privacy_category);
  end if;

  update vibies_private.error_entries
     set title = title_value,
         error_text = error_value,
         location = location_value,
         cause = cause_value,
         fix_steps = fix_value,
         success_confirmation = success_value,
         updated_at = clock_timestamp(),
         version = version + 1
   where id = p_entry_id;
  return jsonb_build_object('kind', 'edited', 'version', (entry_version + 1)::text);
end;
$$;

create or replace function vibies_private.delete_error(
  p_session_hash text,
  p_entry_id uuid,
  p_expected_version bigint,
  p_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, vibies_private
as $$
declare
  actor record;
  entry_version bigint;
begin
  if not vibies_private._valid_hash(p_session_hash) then
    return jsonb_build_object('kind', 'forbidden');
  end if;
  if p_entry_id is null or p_expected_version is null or p_expected_version < 1 then
    return jsonb_build_object('kind', 'invalid');
  end if;
  perform 1 from vibies_private.community where singleton for update;
  select * into actor from vibies_private._error_actor(p_session_hash);
  if not found then
    return jsonb_build_object('kind', 'forbidden');
  end if;
  select e.version into entry_version
    from vibies_private.error_entries e
   where e.id = p_entry_id and e.author_actor_id = actor.actor_id
   for update;
  if not found then
    return jsonb_build_object('kind', 'forbidden');
  end if;
  if entry_version <> p_expected_version then
    return jsonb_build_object('kind', 'stale');
  end if;
  if p_confirmed is distinct from true then
    return jsonb_build_object('kind', 'confirmation');
  end if;
  delete from vibies_private.error_entries where id = p_entry_id;
  return jsonb_build_object('kind', 'deleted');
end;
$$;

create or replace function vibies_private.moderate_error(
  p_session_hash text,
  p_entry_id uuid,
  p_expected_version bigint,
  p_hidden boolean,
  p_keep text,
  p_improve text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, vibies_private
as $$
declare
  actor record;
  entry_row vibies_private.error_entries%rowtype;
  keep_value text := vibies_private._normalized_error_text(p_keep);
  improve_value text := vibies_private._normalized_error_text(p_improve);
  privacy_category text;
begin
  if not vibies_private._valid_hash(p_session_hash) then
    return jsonb_build_object('kind', 'forbidden');
  end if;
  if p_entry_id is null or p_expected_version is null or p_expected_version < 1
     or p_hidden is null then
    return jsonb_build_object('kind', 'invalid');
  end if;
  perform 1 from vibies_private.community where singleton for update;
  select * into actor from vibies_private._error_actor(p_session_hash);
  if not found or actor.actor_role <> 'instructor' then
    return jsonb_build_object('kind', 'forbidden');
  end if;
  if p_hidden then
    if not coalesce(vibies_private._valid_error_text(keep_value, 1, 500), false)
       or not coalesce(vibies_private._valid_error_text(improve_value, 1, 500), false) then
      return jsonb_build_object('kind', 'invalid');
    end if;
    privacy_category := vibies_private._error_privacy_category(array[keep_value, improve_value]);
    if privacy_category is not null then
      return jsonb_build_object('kind', 'privacy', 'category', privacy_category);
    end if;
  elsif p_keep is not null or p_improve is not null then
    return jsonb_build_object('kind', 'invalid');
  end if;

  select e.* into entry_row
    from vibies_private.error_entries e
   where e.id = p_entry_id
   for update;
  if not found then
    return jsonb_build_object('kind', 'forbidden');
  end if;
  if entry_row.version <> p_expected_version then
    return jsonb_build_object('kind', 'stale');
  end if;
  if (p_hidden and entry_row.moderation = 'Hidden')
     or (not p_hidden and entry_row.moderation = 'Visible') then
    return jsonb_build_object(
      'kind', case when p_hidden then 'hidden' else 'restored' end,
      'version', entry_row.version::text
    );
  end if;

  update vibies_private.error_entries
     set moderation = case when p_hidden then 'Hidden' else 'Visible' end,
         keep_note = case when p_hidden then keep_value else null end,
         improve_note = case when p_hidden then improve_value else null end,
         version = version + 1
   where id = p_entry_id;
  return jsonb_build_object(
    'kind', case when p_hidden then 'hidden' else 'restored' end,
    'version', (entry_row.version + 1)::text
  );
end;
$$;

create or replace function vibies_private.set_error_helpful(
  p_session_hash text,
  p_entry_id uuid,
  p_helpful boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, vibies_private
as $$
declare
  actor record;
  found_entry uuid;
begin
  if not vibies_private._valid_hash(p_session_hash) then
    return jsonb_build_object('kind', 'forbidden');
  end if;
  if p_entry_id is null or p_helpful is null then
    return jsonb_build_object('kind', 'invalid');
  end if;
  perform 1 from vibies_private.community where singleton for update;
  select * into actor from vibies_private._error_actor(p_session_hash);
  if not found then
    return jsonb_build_object('kind', 'forbidden');
  end if;
  select e.id into found_entry
    from vibies_private.error_entries e
   where e.id = p_entry_id
     and (
       e.moderation = 'Visible'
       or e.author_actor_id = actor.actor_id
       or actor.actor_role = 'instructor'
     )
   for share;
  if not found then
    return jsonb_build_object('kind', 'missing');
  end if;

  if p_helpful then
    insert into vibies_private.error_helpful_reactions (entry_id, actor_id)
    values (p_entry_id, actor.actor_id)
    on conflict (entry_id, actor_id) do nothing;
  else
    delete from vibies_private.error_helpful_reactions
     where entry_id = p_entry_id and actor_id = actor.actor_id;
  end if;
  return jsonb_build_object(
    'kind', 'ok',
    'helpfulCount', vibies_private._error_helpful_count(p_entry_id)
  );
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
         instructor_nickname = normalized,
         instructor_actor_id = case
           when instructor_github_id = p_github_id then instructor_actor_id
           else gen_random_uuid()
         end
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
grant execute on function vibies_private.edit_project(text, uuid, bigint, text, text, text) to vibies_runtime;
grant execute on function vibies_private.delete_project(text, uuid, bigint) to vibies_runtime;
grant execute on function vibies_private.moderate_project(text, uuid, bigint, boolean) to vibies_runtime;
grant execute on function vibies_private.projects(text) to vibies_runtime;
grant execute on function vibies_private.project(text, uuid) to vibies_runtime;
grant execute on function vibies_private.errors(text, text, text, timestamptz, uuid) to vibies_runtime;
grant execute on function vibies_private.error(text, uuid) to vibies_runtime;
grant execute on function vibies_private.create_error(text, text, text, text, text, text, text, boolean) to vibies_runtime;
grant execute on function vibies_private.edit_error(text, uuid, bigint, text, text, text, text, text, text, boolean) to vibies_runtime;
grant execute on function vibies_private.delete_error(text, uuid, bigint, boolean) to vibies_runtime;
grant execute on function vibies_private.moderate_error(text, uuid, bigint, boolean, text, text) to vibies_runtime;
grant execute on function vibies_private.set_error_helpful(text, uuid, boolean) to vibies_runtime;

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
