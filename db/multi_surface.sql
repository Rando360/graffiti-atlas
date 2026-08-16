-- ============================================================================
--  Multi-surface: let a photo carry MORE THAN ONE surface (text[]), like types.
--  classifications.surface_type stays as the primary (back-compat); surfaces[]
--  holds all selected. Run once in the Supabase SQL editor.
-- ============================================================================
alter table public.classifications
  add column if not exists surfaces text[];

update public.classifications
   set surfaces = array[surface_type]
 where surface_type is not null
   and (surfaces is null or cardinality(surfaces) = 0);

-- Pending bulk RPC — now also returns surfaces[] per image.
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
        'surfaces',     (SELECT c.surfaces     FROM public.classifications c WHERE c.image_id = i.id LIMIT 1),
        'size_m2',      (SELECT c.size_m2      FROM public.classifications c WHERE c.image_id = i.id LIMIT 1)
      ) ORDER BY i.s3_key_thumb)
      FROM public.images i WHERE i.graffiti_id = p.id), '[]'::jsonb) AS images
  FROM pend p
  ORDER BY p.seqkey NULLS LAST, p.captured_at NULLS LAST, p.namekey NULLS LAST, p.id
$function$;

-- Approved (reclassify) bulk RPC — now also returns surfaces[] per image.
CREATE OR REPLACE FUNCTION public.get_approved_graffiti_bulk(
  p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(
   id uuid, city text, lat double precision, lng double precision,
   date_observed date, created_at timestamp with time zone,
   s3_key_thumb text, style text, surface_type text, images jsonb)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  WITH clustered AS (
    SELECT g.id, g.city, g.location, g.date_observed, g.created_at,
      COALESCE(g.captured_at, g.created_at) AS seq_ts,
      ST_ClusterDBSCAN(g.location::geometry, eps := 0.00008, minpoints := 2) OVER () AS cid
    FROM public.graffiti g
    WHERE g.status = 'approved' AND g.reclassified = false
  ),
  keyed AS (
    SELECT c.*,
      CASE WHEN c.cid IS NULL THEN c.seq_ts
           ELSE MIN(c.seq_ts) OVER (PARTITION BY c.cid) END AS cluster_ts
    FROM clustered c
  ),
  appr AS (
    SELECT k.id, k.city,
      ST_Y(k.location::geometry) AS lat,
      ST_X(k.location::geometry) AS lng,
      k.date_observed, k.created_at,
      k.cid, k.seq_ts, k.cluster_ts
    FROM keyed k
    ORDER BY k.cluster_ts, k.cid NULLS LAST, k.seq_ts, k.id
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
        'surfaces',     (SELECT c.surfaces     FROM public.classifications c WHERE c.image_id = i.id LIMIT 1),
        'size_m2',      (SELECT c.size_m2      FROM public.classifications c WHERE c.image_id = i.id LIMIT 1)
      ) ORDER BY i.s3_key_thumb)
      FROM public.images i WHERE i.graffiti_id = a.id), '[]'::jsonb) AS images
  FROM appr a
  ORDER BY a.cluster_ts, a.cid NULLS LAST, a.seq_ts, a.id
$function$;
