-- ============================================================================
--  All map points (approved + pending) for the moderation map — lets a
--  moderator see the whole dataset at once and spot new photos landing on top
--  of already-published ones. Lightweight: id + coords + one thumbnail + status.
--  Run once in the Supabase SQL editor.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_all_points(
  p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, lat double precision, lng double precision,
               s3_key_thumb text, status text)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT g.id,
    ST_Y(g.location::geometry) AS lat,
    ST_X(g.location::geometry) AS lng,
    (SELECT COALESCE(i.s3_key_thumb, i.s3_key_medium, i.s3_key_full)
       FROM public.images i WHERE i.graffiti_id = g.id
       ORDER BY i.s3_key_thumb NULLS LAST LIMIT 1) AS s3_key_thumb,
    g.status
  FROM public.graffiti g
  WHERE g.status IN ('approved', 'pending_review')
  ORDER BY g.id
  LIMIT p_limit OFFSET p_offset
$function$;
