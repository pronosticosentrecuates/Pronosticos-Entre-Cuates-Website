-- Ejecuta este archivo en el SQL Editor del proyecto nuevo despues de importar CSVs.
-- Convierte los tipos inferidos por el importador al esquema que espera la app.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'modalidad_enum') THEN
    CREATE TYPE modalidad_enum AS ENUM ('3 dobles', '5 dobles');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quiniela_status') THEN
    CREATE TYPE quiniela_status AS ENUM ('pending', 'accepted', 'cancelled');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'jornada_status') THEN
    CREATE TYPE jornada_status AS ENUM ('draft', 'open', 'closed', 'finished');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'refunded');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._jsonb_to_text_array(value jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN value IS NULL THEN ARRAY[]::text[]
    WHEN jsonb_typeof(value) = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(value))
    WHEN jsonb_typeof(value) = 'string' THEN ARRAY[value #>> '{}']
    ELSE ARRAY[value::text]
  END;
$$;

DO $$
BEGIN
  IF to_regclass('public.quinielas') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'quinielas' AND column_name = 'celular'
        AND data_type <> 'text'
    ) THEN
      ALTER TABLE public.quinielas ALTER COLUMN celular TYPE text USING celular::text;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'quinielas' AND column_name = 'folio'
        AND data_type <> 'text'
    ) THEN
      ALTER TABLE public.quinielas ALTER COLUMN folio TYPE text USING folio::text;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'quinielas' AND column_name = 'nombre'
        AND data_type <> 'text'
    ) THEN
      ALTER TABLE public.quinielas ALTER COLUMN nombre TYPE text USING nombre::text;
    END IF;
  END IF;

  IF to_regclass('public.selections') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'selections' AND column_name = 'seleccion'
      AND udt_name <> '_text'
  ) THEN
    ALTER TABLE public.selections
      ALTER COLUMN seleccion TYPE text[]
      USING public._jsonb_to_text_array(to_jsonb(seleccion));
  END IF;

  IF to_regclass('public.combinations') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'combinations' AND column_name = 'combination'
      AND udt_name <> '_text'
  ) THEN
    ALTER TABLE public.combinations
      ALTER COLUMN combination TYPE text[]
      USING public._jsonb_to_text_array(to_jsonb(combination));
  END IF;
END $$;

ALTER TABLE public.quinielas
  ADD COLUMN IF NOT EXISTS payment_reference text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS admin_notes text NOT NULL DEFAULT '';

ALTER TABLE public.selections DROP CONSTRAINT IF EXISTS selections_seleccion_check;
ALTER TABLE public.selections ADD CONSTRAINT selections_seleccion_check CHECK (
  cardinality(seleccion) BETWEEN 1 AND 2
  AND seleccion <@ ARRAY['L', 'E', 'V']::text[]
);

ALTER TABLE public.combinations DROP CONSTRAINT IF EXISTS combinations_combination_check;
ALTER TABLE public.combinations ADD CONSTRAINT combinations_combination_check CHECK (
  combination <@ ARRAY['L', 'E', 'V']::text[]
);

DROP FUNCTION public._jsonb_to_text_array(jsonb);

SELECT
  table_name,
  column_name,
  data_type,
  udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'quinielas' AND column_name IN ('celular', 'folio', 'nombre'))
    OR (table_name = 'selections' AND column_name = 'seleccion')
    OR (table_name = 'combinations' AND column_name = 'combination')
  )
ORDER BY table_name, column_name;

NOTIFY pgrst, 'reload schema';
