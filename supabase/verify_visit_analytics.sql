BEGIN;
DO $$
DECLARE
  test_visitor uuid := gen_random_uuid();
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_table_privilege(role_name, 'public.site_visits', 'SELECT')
       OR has_table_privilege(role_name, 'public.site_visits', 'INSERT')
       OR has_table_privilege(role_name, 'public.site_visits', 'UPDATE')
       OR has_table_privilege(role_name, 'public.site_visits', 'DELETE') THEN
      RAISE EXCEPTION 'Unexpected table access for %', role_name;
    END IF;
    IF NOT has_function_privilege(role_name, 'public.record_site_visit(uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION 'Missing visit recording permission for %', role_name;
    END IF;
  END LOOP;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.site_visits'::regclass) THEN
    RAISE EXCEPTION 'RLS must be enabled';
  END IF;
  PERFORM public.record_site_visit(test_visitor);
  PERFORM public.record_site_visit(test_visitor);
  IF (SELECT count(*) FROM public.site_visits WHERE visitor_id = test_visitor) <> 1 THEN
    RAISE EXCEPTION 'Visit deduplication failed';
  END IF;
  UPDATE public.site_visits SET visited_at = now() - interval '31 minutes' WHERE visitor_id = test_visitor;
  PERFORM public.record_site_visit(test_visitor);
  IF (SELECT count(*) FROM public.site_visits WHERE visitor_id = test_visitor) <> 2 THEN
    RAISE EXCEPTION 'Return visit was not counted';
  END IF;
END;
$$;
ROLLBACK;
