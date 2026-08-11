-- ============================================================================
--  Multi-type + density for graffiti classifications
--  Run this whole file once in the Supabase SQL editor.
--
--  Model:
--   • classifications.styles  text[]  → every type present in the photo
--                                       (e.g. {'tag','throwup'})
--   • classifications.density text     → 'light' | 'medium' | 'heavy'
--   • classifications.style   text     → PRIMARY / most-significant type,
--                                       kept for map pin colour + back-compat.
--  Density is one value per photo (not per type).
-- ============================================================================

-- 1) Columns ---------------------------------------------------------------
alter table public.classifications
  add column if not exists styles  text[],
  add column if not exists density text;

-- 2) Backfill styles[] from the existing single style ----------------------
update public.classifications
   set styles = array[style]
 where style is not null
   and (styles is null or cardinality(styles) = 0);

-- 3) Guard density values (added NOT VALID so existing rows aren't checked) -
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'classifications_density_chk') then
    alter table public.classifications
      add constraint classifications_density_chk
      check (density in ('light','medium','heavy')) not valid;
  end if;
end$$;

-- 4) Map RPC — now returns styles[] + density on each point ----------------
-- Return type changed (added columns), so the old function must be dropped first.
DROP FUNCTION IF EXISTS public.get_map_clusters(double precision, double precision, double precision, double precision, integer);

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
    ORDER BY g.location_id, g.date_observed DESC NULLS LAST, g.created_at DESC;
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
      ORDER BY g.location_id, g.date_observed DESC NULLS LAST, g.created_at DESC
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

-- 5) Pending bulk RPC — expose styles[] + density per image ----------------
CREATE OR REPLACE FUNCTION public.get_pending_graffiti_bulk(
  p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(
   id uuid, city text, lat double precision, lng double precision,
   date_observed date, created_at timestamp with time zone,
   s3_key_thumb text, style text, surface_type text, images jsonb)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  WITH pend AS (
    SELECT g.id, g.city,
      ST_Y(g.location::geometry) AS lat,
      ST_X(g.location::geometry) AS lng,
      g.date_observed, g.created_at, g.captured_at,
      (SELECT min(i.source_sequence_id) FROM public.images i WHERE i.graffiti_id = g.id) AS seqkey,
      (SELECT min(i.s3_key_thumb)       FROM public.images i WHERE i.graffiti_id = g.id) AS namekey
    FROM public.graffiti g
    WHERE g.status = 'pending_review' AND g.source <> 'community'
    ORDER BY seqkey NULLS LAST, g.captured_at NULLS LAST, namekey NULLS LAST, g.id
    LIMIT p_limit OFFSET p_offset
  )
  SELECT p.id, p.city, p.lat, p.lng, p.date_observed, p.created_at,
    (SELECT i.s3_key_thumb FROM public.images i WHERE i.graffiti_id = p.id ORDER BY i.s3_key_thumb LIMIT 1) AS s3_key_thumb,
    NULL::text AS style, NULL::text AS surface_type,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'key', i.s3_key_thumb,
        'style',        (SELECT c.style        FROM public.classifications c WHERE c.image_id = i.id LIMIT 1),
        'styles',       (SELECT c.styles       FROM public.classifications c WHERE c.image_id = i.id LIMIT 1),
        'density',      (SELECT c.density      FROM public.classifications c WHERE c.image_id = i.id LIMIT 1),
        'surface_type', (SELECT c.surface_type FROM public.classifications c WHERE c.image_id = i.id LIMIT 1),
        'size_m2',      (SELECT c.size_m2      FROM public.classifications c WHERE c.image_id = i.id LIMIT 1)
      ) ORDER BY i.s3_key_thumb)
      FROM public.images i WHERE i.graffiti_id = p.id), '[]'::jsonb) AS images
  FROM pend p
  ORDER BY p.seqkey NULLS LAST, p.captured_at NULLS LAST, p.namekey NULLS LAST, p.id
$function$;
