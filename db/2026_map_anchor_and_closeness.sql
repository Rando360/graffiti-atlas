-- ============================================================================
--  1) Map "which photo shows" is now deterministic by MERGE DIRECTION.
--     get_map_clusters picks one row per location_id. It used to pick the newest
--     by date, so dragging A onto B could leave A showing. Now it prefers the
--     ANCHOR — the row whose id == its own location_id — which is always the
--     point you dropped ONTO (the target keeps its own id as location_id; the
--     dragged point takes the target's). Date is only the tie-breaker.
--
--  2) Close-pair detection widened 8 m -> 10 m, and existing points are reset so
--     the next scan re-measures everything at the new radius.
--
--  Run once in the Supabase SQL editor, then run a pair scan (Moderation → Map,
--  or  select scan_dup_pairs();  ).
-- ============================================================================

-- ── 1) get_map_clusters: anchor-first representative ──
CREATE OR REPLACE FUNCTION public.get_map_clusters(
  min_lat double precision, min_lng double precision,
  max_lat double precision, max_lng double precision, zoom integer)
 RETURNS TABLE(
   is_cluster boolean, cluster_count integer, id uuid, location_id uuid,
   lat double precision, lng double precision, city text, style text,
   size_m2 double precision, surface_type text, description_fr text,
   s3_key_full text, source text, date_observed date, cleaned boolean,
   styles text[], density text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  detail_zoom CONSTANT int := 14;
  grid double precision;
BEGIN
  IF zoom >= detail_zoom THEN
    RETURN QUERY
    SELECT DISTINCT ON (g.location_id)
      false, 1, g.id, g.location_id,
      ST_Y(g.location::geometry), ST_X(g.location::geometry),
      g.city, c.style, c.size_m2, c.surface_type, c.description_fr,
      i.s3_key_full, g.source, g.date_observed,
      (g.removed_at IS NOT NULL),
      c.styles, c.density
    FROM public.graffiti g
    LEFT JOIN LATERAL (SELECT im.s3_key_full FROM public.images im WHERE im.graffiti_id = g.id LIMIT 1) i ON true
    LEFT JOIN LATERAL (SELECT cl.style, cl.size_m2, cl.surface_type, cl.description_fr, cl.styles, cl.density
                       FROM public.classifications cl WHERE cl.graffiti_id = g.id LIMIT 1) c ON true
    WHERE g.status = 'approved'
      AND g.location && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
    ORDER BY g.location_id, (g.id = g.location_id) DESC, g.date_observed DESC NULLS LAST, g.created_at DESC;
  ELSE
    grid := 360.0 / power(2, zoom + 2);
    RETURN QUERY
    WITH latest AS (
      SELECT DISTINCT ON (g.location_id)
        g.id AS gid, g.location_id AS loc,
        ST_Y(g.location::geometry) AS gy, ST_X(g.location::geometry) AS gx,
        g.city AS gcity, c.style AS gstyle, c.size_m2 AS gsize,
        c.surface_type AS gsurf, c.description_fr AS gdesc,
        i.s3_key_full AS gkey, g.source AS gsrc, g.date_observed AS gdate,
        (g.removed_at IS NOT NULL) AS gcleaned,
        c.styles AS gstyles, c.density AS gdensity
      FROM public.graffiti g
      LEFT JOIN LATERAL (SELECT im.s3_key_full FROM public.images im WHERE im.graffiti_id = g.id LIMIT 1) i ON true
      LEFT JOIN LATERAL (SELECT cl.style, cl.size_m2, cl.surface_type, cl.description_fr, cl.styles, cl.density
                         FROM public.classifications cl WHERE cl.graffiti_id = g.id LIMIT 1) c ON true
      WHERE g.status = 'approved'
        AND g.location && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
      ORDER BY g.location_id, (g.id = g.location_id) DESC, g.date_observed DESC NULLS LAST, g.created_at DESC
    ),
    celled AS (
      SELECT *, floor(gx / grid) AS cx, floor(gy / grid) AS cy FROM latest
    )
    SELECT false, 1, s.gid, s.loc, s.gy, s.gx, s.gcity, s.gstyle,
           s.gsize, s.gsurf, s.gdesc, s.gkey, s.gsrc, s.gdate, s.gcleaned,
           s.gstyles, s.gdensity
    FROM (SELECT *, count(*) OVER (PARTITION BY cx, cy) AS n FROM celled) s
    WHERE s.n = 1
    UNION ALL
    SELECT true, count(*)::int, NULL::uuid, NULL::uuid, avg(gy), avg(gx),
           NULL::text, mode() WITHIN GROUP (ORDER BY gstyle),
           NULL::double precision, NULL::text, NULL::text, NULL::text,
           NULL::text, NULL::date, false,
           NULL::text[], NULL::text
    FROM celled GROUP BY cx, cy HAVING count(*) >= 2;
  END IF;
END;
$function$;

-- ── 2) scan_dup_pairs: 8 m -> 10 m ──
CREATE OR REPLACE FUNCTION public.scan_dup_pairs()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare open_count integer;
begin
  insert into public.dup_pairs (a, b, dist_m)
  select least(g1.id, g2.id), greatest(g1.id, g2.id),
         ST_Distance(g1.location, g2.location)
  from public.graffiti g1
  join public.graffiti g2
    on g2.id <> g1.id
   and g2.status in ('approved', 'pending_review')
   and ST_DWithin(g1.location, g2.location, 10)     -- geography → 10 metres
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

-- Re-measure every existing point at the new 10 m radius (one-off).
-- 'ignored' pairs keep their status (ON CONFLICT DO NOTHING in the scan).
UPDATE public.graffiti SET dup_scanned = false
 WHERE status IN ('approved', 'pending_review');
