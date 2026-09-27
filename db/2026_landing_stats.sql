-- ============================================================================
--  Aggregates for the landing-page "by the numbers" section, in one round trip.
--  SECURITY DEFINER so it runs past RLS; the API calls it with the service key.
--  Run once in the Supabase SQL editor.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_landing_stats()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 STABLE
AS $function$
  SELECT jsonb_build_object(
    'works',  (SELECT count(DISTINCT coalesce(location_id, id)) FROM public.graffiti WHERE status='approved'),
    'photos', (SELECT count(*) FROM public.images i JOIN public.graffiti g ON g.id=i.graffiti_id WHERE g.status='approved'),
    'cities', (SELECT count(DISTINCT city) FROM public.graffiti WHERE status='approved' AND city IS NOT NULL),

    'by_type', (SELECT coalesce(jsonb_agg(jsonb_build_object('key',k,'count',n) ORDER BY n DESC),'[]'::jsonb)
      FROM (SELECT cl.style k, count(*) n FROM public.classifications cl
              JOIN public.graffiti g ON g.id=cl.graffiti_id
             WHERE g.status='approved' AND cl.style IS NOT NULL GROUP BY 1) t),

    'by_density', (SELECT coalesce(jsonb_agg(jsonb_build_object('key',k,'count',n) ORDER BY n DESC),'[]'::jsonb)
      FROM (SELECT cl.density k, count(*) n FROM public.classifications cl
              JOIN public.graffiti g ON g.id=cl.graffiti_id
             WHERE g.status='approved' AND cl.density IS NOT NULL GROUP BY 1) t),

    'by_surface', (SELECT coalesce(jsonb_agg(jsonb_build_object('key',k,'count',n) ORDER BY n DESC),'[]'::jsonb)
      FROM (SELECT cl.surface_type k, count(*) n FROM public.classifications cl
              JOIN public.graffiti g ON g.id=cl.graffiti_id
             WHERE g.status='approved' AND cl.surface_type IS NOT NULL GROUP BY 1) t),

    'by_city', (SELECT coalesce(jsonb_agg(jsonb_build_object('key',city,'count',n) ORDER BY n DESC),'[]'::jsonb)
      FROM (SELECT city, count(*) n FROM public.graffiti
             WHERE status='approved' AND city IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 8) t),

    'by_year', (SELECT coalesce(jsonb_agg(jsonb_build_object('key',yr::text,'count',n) ORDER BY yr),'[]'::jsonb)
      FROM (SELECT extract(year FROM date_observed)::int yr, count(*) n FROM public.graffiti
             WHERE status='approved' AND date_observed IS NOT NULL GROUP BY 1) t)
  );
$function$;

GRANT EXECUTE ON FUNCTION public.get_landing_stats() TO anon, authenticated, service_role;
