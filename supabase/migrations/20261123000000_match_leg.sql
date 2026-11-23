-- Etiqueta opcional de eliminatoria. NULL conserva los partidos sin especificar.
-- get_public_dashboard ya devuelve to_jsonb(m), por lo que incluye esta columna.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS leg text CHECK (leg IN ('ida', 'vuelta'));

COMMENT ON COLUMN public.matches.leg IS 'Tramo de la eliminatoria: ida, vuelta o NULL sin especificar.';

NOTIFY pgrst, 'reload schema';
