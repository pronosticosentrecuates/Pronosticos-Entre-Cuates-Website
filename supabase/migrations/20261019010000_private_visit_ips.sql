BEGIN;
ALTER TABLE public.site_visits ADD COLUMN ip_address inet;

-- Keep the older RPC for compatibility with an already published client.
-- Only the server can supply an IP; browser roles cannot execute this function.
CREATE FUNCTION public.record_site_visit_with_ip(p_visitor_id uuid, p_ip_address inet)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  recent_id bigint;
BEGIN
  IF p_visitor_id IS NULL THEN RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_visitor_id::text, 0));
  SELECT id INTO recent_id FROM public.site_visits
  WHERE visitor_id = p_visitor_id AND visited_at > now() - interval '30 minutes'
  ORDER BY visited_at DESC LIMIT 1;
  IF recent_id IS NULL THEN
    INSERT INTO public.site_visits (visitor_id, ip_address) VALUES (p_visitor_id, p_ip_address);
  ELSE
    -- Backfill only the current visit if the old client recorded it without an IP.
    UPDATE public.site_visits SET ip_address = p_ip_address
    WHERE id = recent_id AND ip_address IS NULL AND p_ip_address IS NOT NULL;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.record_site_visit_with_ip(uuid, inet) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_site_visit_with_ip(uuid, inet) TO service_role;
COMMIT;
