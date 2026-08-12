-- ============================================================================
--  Approved-graffiti bulk list, for re-classifying already-approved photos
--  (add multi-type + density to older data). Ordered by city so a paginated
--  walk keeps same-city photos together. Measurement (size_m2) is returned for
--  display only — the reclassify endpoint never writes it.
--  Run once in the Supabase SQL editor.
--
--  A "reclassified" flag keeps the list to the current backlog only:
--   • saving a photo marks it done → it won't reappear;
--   • photos approved through normal moderation are marked done automatically
--     → new photos never enter this list.
-- ============================================================================

-- Flag: false = still in the reclassify backlog. Existing approved photos start
-- at false (the backlog); everything approved from now on is set true on approve.
alter table public.graffiti
  add column if not exists reclassified boolean not null default false;

CREATE OR REPLACE FUNCTION public.get_approved_graffiti_bulk(
  p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(
   id uuid, city text, lat double precision, lng double precision,
   date_observed date, created_at timestamp with time zone,
   s3_key_thumb text, style text, surface_type text, images jsonb)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  WITH appr AS (
    SELECT g.id, g.city,
      ST_Y(g.location::geometry) AS lat,
      ST_X(g.location::geometry) AS lng,
      g.date_observed, g.created_at,
      -- Geohash clusters nearby photos next to each other, so duplicates of the
      -- same spot land adjacent in the list (easy to compare + delete).
      ST_GeoHash(g.location::geometry, 9) AS geohash
    FROM public.graffiti g
    WHERE g.status = 'approved' AND g.reclassified = false
    ORDER BY g.city NULLS LAST, ST_GeoHash(g.location::geometry, 9), g.id
    LIMIT p_limit OFFSET p_offset
  )
  SELECT a.id, a.city, a.lat, a.lng, a.date_observed, a.created_at,
    (SELECT COALESCE(i.s3_key_thumb, i.s3_key_medium, i.s3_key_full) FROM public.images i WHERE i.graffiti_id = a.id ORDER BY i.s3_key_thumb NULLS LAST LIMIT 1) AS s3_key_thumb,
    NULL::text AS style, NULL::text AS surface_type,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'key', COALESCE(i.s3_key_thumb, i.s3_key_medium, i.s3_key_full),
        'style',        (SELECT c.style        FROM public.classifications c WHERE c.image_id = i.id LIMIT 1),
        'styles',       (SELECT c.styles       FROM public.classifications c WHERE c.image_id = i.id LIMIT 1),
        'density',      (SELECT c.density      FROM public.classifications c WHERE c.image_id = i.id LIMIT 1),
        'surface_type', (SELECT c.surface_type FROM public.classifications c WHERE c.image_id = i.id LIMIT 1),
        'size_m2',      (SELECT c.size_m2      FROM public.classifications c WHERE c.image_id = i.id LIMIT 1)
      ) ORDER BY i.s3_key_thumb)
      FROM public.images i WHERE i.graffiti_id = a.id), '[]'::jsonb) AS images
  FROM appr a
  ORDER BY a.city NULLS LAST, a.geohash, a.id
$function$;
