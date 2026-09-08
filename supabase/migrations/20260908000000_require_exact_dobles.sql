-- Require the exact number of doubles selected by the modalidad.
CREATE OR REPLACE FUNCTION public.validate_quiniela_exact_dobles()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_required_dobles integer;
BEGIN
  v_required_dobles := CASE NEW.modalidad
    WHEN '3 dobles' THEN 3
    WHEN '5 dobles' THEN 5
    ELSE NULL
  END;

  IF v_required_dobles IS NULL OR NEW.dobles_usados <> v_required_dobles THEN
    RAISE EXCEPTION 'La modalidad % requiere exactamente % dobles', NEW.modalidad, v_required_dobles;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quinielas_require_exact_dobles ON public.quinielas;

CREATE TRIGGER quinielas_require_exact_dobles
BEFORE INSERT OR UPDATE OF modalidad, dobles_usados ON public.quinielas
FOR EACH ROW
EXECUTE FUNCTION public.validate_quiniela_exact_dobles();
