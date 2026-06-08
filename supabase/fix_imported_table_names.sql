-- Ejecuta este archivo en el SQL Editor del proyecto nuevo de Supabase.
-- Renombra las tablas que se importaron con el prefijo "tabla " para que
-- coincidan con los nombres que usa la app.

DO $$
BEGIN
  IF to_regclass('public."tabla jornadas"') IS NOT NULL
     AND to_regclass('public.jornadas') IS NULL THEN
    ALTER TABLE public."tabla jornadas" RENAME TO jornadas;
  END IF;

  IF to_regclass('public."tabla matches"') IS NOT NULL
     AND to_regclass('public.matches') IS NULL THEN
    ALTER TABLE public."tabla matches" RENAME TO matches;
  END IF;

  IF to_regclass('public."tabla quinielas"') IS NOT NULL
     AND to_regclass('public.quinielas') IS NULL THEN
    ALTER TABLE public."tabla quinielas" RENAME TO quinielas;
  END IF;

  IF to_regclass('public."tabla selections"') IS NOT NULL
     AND to_regclass('public.selections') IS NULL THEN
    ALTER TABLE public."tabla selections" RENAME TO selections;
  END IF;

  IF to_regclass('public."tabla combinations"') IS NOT NULL
     AND to_regclass('public.combinations') IS NULL THEN
    ALTER TABLE public."tabla combinations" RENAME TO combinations;
  END IF;

  IF to_regclass('public."Auditorias"') IS NOT NULL
     AND to_regclass('public.audit_log') IS NULL THEN
    ALTER TABLE public."Auditorias" RENAME TO audit_log;
  END IF;
END $$;

-- Corrige los autoincrementos para que los siguientes registros no choquen
-- con los IDs que importaste desde CSV.
SELECT setval(pg_get_serial_sequence('public.jornadas', 'id'), coalesce((SELECT max(id) FROM public.jornadas), 1), true)
WHERE to_regclass('public.jornadas') IS NOT NULL;

SELECT setval(pg_get_serial_sequence('public.matches', 'id'), coalesce((SELECT max(id) FROM public.matches), 1), true)
WHERE to_regclass('public.matches') IS NOT NULL
  AND pg_get_serial_sequence('public.matches', 'id') IS NOT NULL;

SELECT setval(pg_get_serial_sequence('public.quinielas', 'id'), coalesce((SELECT max(id) FROM public.quinielas), 1), true)
WHERE to_regclass('public.quinielas') IS NOT NULL;

SELECT setval(pg_get_serial_sequence('public.selections', 'id'), coalesce((SELECT max(id) FROM public.selections), 1), true)
WHERE to_regclass('public.selections') IS NOT NULL;

SELECT setval(pg_get_serial_sequence('public.combinations', 'id'), coalesce((SELECT max(id) FROM public.combinations), 1), true)
WHERE to_regclass('public.combinations') IS NOT NULL;

-- Comprueba que los nombres ya quedaron como los espera la app.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

NOTIFY pgrst, 'reload schema';
