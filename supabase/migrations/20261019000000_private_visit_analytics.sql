-- Statistics are accessible only through the developer's Supabase SQL editor.
-- No website role (including administrators) can read or mutate this table.
BEGIN;

CREATE TABLE public.site_visits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visitor_id uuid NOT NULL,
  visited_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX site_visits_visitor_time_idx ON public.site_visits (visitor_id, visited_at DESC);
CREATE INDEX site_visits_time_idx ON public.site_visits (visited_at);
ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_visits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.site_visits_id_seq FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.record_site_visit(p_visitor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_visitor_id IS NULL THEN
    RETURN;
  END IF;
  -- Serialize requests from the same browser so refreshes and concurrent tabs
  -- cannot inflate counts. The server supplies the time, never the browser.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_visitor_id::text, 0));
  IF NOT EXISTS (
    SELECT 1 FROM public.site_visits
    WHERE visitor_id = p_visitor_id AND visited_at > now() - interval '30 minutes'
  ) THEN
    INSERT INTO public.site_visits (visitor_id) VALUES (p_visitor_id);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.record_site_visit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_site_visit(uuid) TO anon, authenticated;

COMMIT;
