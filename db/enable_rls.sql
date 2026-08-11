-- ============================================================================
--  Enable Row-Level Security (RLS) on all app tables.
--
--  Why this is safe:
--   • The FastAPI backend uses the SERVICE_ROLE key, which has BYPASSRLS —
--     every server route (map, moderation, uploads) keeps working unchanged.
--   • The browser (anon / authenticated key) only reads its OWN profile row
--     directly; all other data goes through the backend.
--   • With RLS ON and no anon/authenticated policies, the public anon key can
--     no longer read, edit, or delete your tables directly.
--
--  Run this whole file once in the Supabase SQL editor.
-- ============================================================================

-- 1) Turn RLS on for every public table (except the PostGIS reference table,
--    handled separately below).
do $$
declare r record;
begin
  for r in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename <> 'spatial_ref_sys'
  loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end$$;

-- 2) Let a logged-in user read their OWN profile row (role + language).
--    No insert/update/delete policy → users can't change their own role;
--    the backend (service_role) still manages profiles freely.
drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- Note: public.spatial_ref_sys (a PostGIS system table) is intentionally left
-- alone — it's owned by a superuser and can't be altered from the SQL editor.
-- It holds only SRID reference data, not your app data, so it's low risk. The
-- advisor may keep flagging it; that's expected for PostGIS on Supabase.
