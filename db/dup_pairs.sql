-- ============================================================================
--  Persisted close-pair detection.
--
--  Instead of recomputing every distance in the browser each time, close pairs
--  are stored once. A "scan" only measures photos that haven't been scanned yet
--  (dup_scanned = false) against all existing photos, inserts any new pairs, and
--  marks them scanned — so old photos are never re-measured and resolved pairs
--  never come back. The open-pair count is therefore definitive and only grows
--  when genuinely new photos arrive.
--
--  Run once in the Supabase SQL editor.
-- ============================================================================

-- Spatial index so ST_DWithin scans are fast.
create index if not exists graffiti_location_gix on public.graffiti using gist (location);

-- Per-photo flag: has this point been measured for close pairs yet?
alter table public.graffiti
  add column if not exists dup_scanned boolean not null default false;

-- One row per close pair. status: 'open' (needs review) | 'ignored' (dismissed).
-- Merge/delete remove the row entirely.
create table if not exists public.dup_pairs (
  a uuid not null,
  b uuid not null,
  dist_m double precision,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  primary key (a, b)
);
alter table public.dup_pairs enable row level security;   -- backend (service_role) only

-- Carry over any pairs already dismissed via the old ignored_dup_pairs table.
insert into public.dup_pairs (a, b, status)
select a, b, 'ignored' from public.ignored_dup_pairs
on conflict (a, b) do nothing;

-- Incremental scan: measure only un-scanned photos, add new pairs, mark scanned.
create or replace function public.scan_dup_pairs()
 returns integer
 language plpgsql
 security definer
as $function$
declare open_count integer;
begin
  insert into public.dup_pairs (a, b, dist_m)
  select least(g1.id, g2.id), greatest(g1.id, g2.id),
         ST_Distance(g1.location, g2.location)
  from public.graffiti g1
  join public.graffiti g2
    on g2.id <> g1.id
   and g2.status in ('approved', 'pending_review')
   and ST_DWithin(g1.location, g2.location, 8)     -- geography → 8 metres
  where g1.status in ('approved', 'pending_review')
    and g1.dup_scanned = false
  on conflict (a, b) do nothing;

  update public.graffiti
     set dup_scanned = true
   where dup_scanned = false
     and status in ('approved', 'pending_review');

  select count(*) into open_count from public.dup_pairs where status = 'open';
  return open_count;
end;
$function$;

-- Open pairs joined to both points' coordinates + thumbnails, for the map.
create or replace function public.get_open_dup_pairs()
 returns table(
   a uuid, b uuid, dist_m double precision,
   a_lat double precision, a_lng double precision, a_key text, a_status text,
   b_lat double precision, b_lng double precision, b_key text, b_status text)
 language sql
 security definer
as $function$
  select p.a, p.b, p.dist_m,
    ST_Y(ga.location::geometry), ST_X(ga.location::geometry),
    (select coalesce(i.s3_key_thumb, i.s3_key_medium, i.s3_key_full) from public.images i
       where i.graffiti_id = ga.id order by i.s3_key_thumb nulls last limit 1),
    ga.status,
    ST_Y(gb.location::geometry), ST_X(gb.location::geometry),
    (select coalesce(i.s3_key_thumb, i.s3_key_medium, i.s3_key_full) from public.images i
       where i.graffiti_id = gb.id order by i.s3_key_thumb nulls last limit 1),
    gb.status
  from public.dup_pairs p
  join public.graffiti ga on ga.id = p.a
  join public.graffiti gb on gb.id = p.b
  where p.status = 'open'
    and ga.status in ('approved', 'pending_review')
    and gb.status in ('approved', 'pending_review')
  order by p.dist_m
$function$;
