-- Additive source-host prerequisite for VIBIES_READ_ONLY=1.
-- Apply before the cutover freeze; no source records are modified.
begin;

create or replace function vibies_private.access_state_read_only(p_session_hash text)
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

  select s.github_id, c.instructor_github_id, c.instructor_nickname
    into session_github_id, instructor_id, instructor_name
    from vibies_private.sessions s
    cross join vibies_private.community c
   where s.session_hash = p_session_hash
     and s.created_at > clock_timestamp() - interval '24 hours';

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

revoke all on function vibies_private.access_state_read_only(text) from public;
grant execute on function vibies_private.access_state_read_only(text) to vibies_runtime;

commit;
