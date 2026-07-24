-- Read-only verification. Run after 20260724000000_security_hardening.sql.
-- Every row must report PASS.

WITH checks (check_name, passed) AS (
  VALUES
    (
      'RLS enabled on quinielas',
      coalesce((
        SELECT c.relrowsecurity
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'quinielas'
      ), false)
    ),
    (
      'RLS enabled on selections',
      coalesce((
        SELECT c.relrowsecurity
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'selections'
      ), false)
    ),
    (
      'RLS enabled on combinations',
      coalesce((
        SELECT c.relrowsecurity
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'combinations'
      ), false)
    ),
    (
      'Anonymous role cannot read quinielas directly',
      NOT has_table_privilege('anon', 'public.quinielas', 'SELECT')
    ),
    (
      'Anonymous role cannot modify quinielas directly',
      NOT has_table_privilege('anon', 'public.quinielas', 'INSERT,UPDATE,DELETE')
    ),
    (
      'Anonymous role cannot read selections directly',
      NOT has_table_privilege('anon', 'public.selections', 'SELECT')
    ),
    (
      'Anonymous role cannot read combinations directly',
      NOT has_table_privilege('anon', 'public.combinations', 'SELECT')
    ),
    (
      'Anonymous role cannot read audit log',
      NOT has_table_privilege('anon', 'public.audit_log', 'SELECT')
    ),
    (
      'Anonymous role cannot use private schema',
      NOT has_schema_privilege('anon', 'private', 'USAGE')
    ),
    (
      'Anonymous role cannot create public objects',
      NOT has_schema_privilege('anon', 'public', 'CREATE')
    ),
    (
      'Legacy two-factor lookup was removed',
      to_regprocedure('public.lookup_quiniela(text,text)') IS NULL
    ),
    (
      'Current minimized lookup exists',
      to_regprocedure('public.lookup_quiniela(text,text,text)') IS NOT NULL
    ),
    (
      'Audit trigger cannot be called from the API',
      NOT has_function_privilege('anon', 'public.audit_admin_change()', 'EXECUTE')
    ),
    (
      'Public approved response contains no restricted fields',
      coalesce((
        SELECT bool_and(
          coalesce(item ->> 'celular', '') = ''
          AND coalesce(item ->> 'payment_reference', '') = ''
          AND coalesce(item ->> 'admin_notes', '') = ''
          AND coalesce(jsonb_array_length(item -> 'combinations'), 0) = 0
          AND coalesce(item ->> 'nombre', '') <> ''
        )
        FROM jsonb_array_elements(public.get_public_approved_quinielas(NULL)) AS item
      ), true)
    )
)
SELECT
  check_name,
  CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result
FROM checks
ORDER BY check_name;
