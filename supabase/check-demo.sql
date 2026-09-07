-- Stop if this query returns a row before or after setup.
select schemaname, tablename
  from pg_tables
 where schemaname = 'public'
   and not rowsecurity
 order by tablename;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  obj_description(c.oid, 'pg_class') as ownership_comment
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'demo_projects';

select
  column_name,
  ordinal_position,
  data_type,
  is_nullable,
  column_default,
  identity_generation,
  identity_start
from information_schema.columns
where table_schema = 'public'
  and table_name = 'demo_projects'
order by ordinal_position;

select constraint_name, constraint_type
from information_schema.table_constraints
where table_schema = 'public'
  and table_name = 'demo_projects'
order by constraint_name;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'demo_projects'
order by grantee, privilege_type;

select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'demo_projects'
order by policyname;

select
  has_table_privilege('anon', to_regclass('public.demo_projects'), 'SELECT') as anon_select,
  has_table_privilege('anon', to_regclass('public.demo_projects'), 'INSERT') as anon_insert,
  has_table_privilege('anon', to_regclass('public.demo_projects'), 'UPDATE') as anon_update,
  has_table_privilege('anon', to_regclass('public.demo_projects'), 'DELETE') as anon_delete,
  has_sequence_privilege('anon', to_regclass('public.demo_projects_id_seq'), 'USAGE') as anon_sequence_usage,
  has_sequence_privilege('anon', to_regclass('public.demo_projects_id_seq'), 'UPDATE') as anon_sequence_update;

select id, title, summary, created_at
from public.demo_projects
where id = 1;

select count(*) as demo_project_count
from public.demo_projects;
