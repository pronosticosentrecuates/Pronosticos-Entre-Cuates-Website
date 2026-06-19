DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tournament_status') THEN
    CREATE TYPE tournament_status AS ENUM ('draft', 'active', 'finished');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.tournaments (
  id serial PRIMARY KEY,
  nombre text NOT NULL CHECK (char_length(trim(nombre)) >= 2),
  liga text NOT NULL DEFAULT 'Liga MX',
  temporada text NOT NULL DEFAULT '2026-2027',
  status public.tournament_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

ALTER TABLE public.jornadas ADD COLUMN IF NOT EXISTS tournament_id integer REFERENCES public.tournaments(id) ON DELETE SET NULL;
ALTER TABLE public.jornadas ADD COLUMN IF NOT EXISTS numero integer CHECK (numero IS NULL OR numero > 0);
CREATE INDEX IF NOT EXISTS idx_jornadas_tournament_id ON public.jornadas(tournament_id);

INSERT INTO public.tournaments (nombre, liga, temporada, status)
SELECT 'Liga MX 2026-2027', 'Liga MX', '2026-2027', 'active'
WHERE NOT EXISTS (SELECT 1 FROM public.tournaments);

UPDATE public.jornadas
SET tournament_id = (SELECT id FROM public.tournaments ORDER BY id LIMIT 1)
WHERE tournament_id IS NULL;

WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY id)::integer AS rn
  FROM public.jornadas
  WHERE numero IS NULL
)
UPDATE public.jornadas j
SET numero = numbered.rn
FROM numbered
WHERE numbered.id = j.id;

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_select_tournaments ON public.tournaments;
DROP POLICY IF EXISTS admin_manage_tournaments ON public.tournaments;
CREATE POLICY public_select_tournaments ON public.tournaments FOR SELECT USING (true);
CREATE POLICY admin_manage_tournaments ON public.tournaments FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS audit_tournaments ON public.tournaments;
CREATE TRIGGER audit_tournaments AFTER INSERT OR UPDATE OR DELETE ON public.tournaments FOR EACH ROW EXECUTE FUNCTION public.audit_admin_change();

NOTIFY pgrst, 'reload schema';
