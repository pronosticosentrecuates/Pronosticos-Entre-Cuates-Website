-- Restore the full participant name in individual lookup results.
-- Phone, payment reference and administrative notes remain protected.

DROP FUNCTION IF EXISTS public.lookup_quiniela(text, text);

CREATE OR REPLACE FUNCTION public.lookup_quiniela(
  p_folio text,
  p_phone text,
  p_nombre text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_folio text := upper(trim(coalesce(p_folio, '')));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_name text := lower(regexp_replace(trim(coalesce(p_nombre, '')), '[[:space:]]+', ' ', 'g'));
  v_has_folio boolean;
  v_has_phone boolean;
  v_has_name boolean;
  v_result jsonb;
BEGIN
  PERFORM private.enforce_request_limit('lookup_quiniela', 10, interval '15 minutes');

  v_has_folio := v_folio ~ '^Q[0-9]+-[0-9]{6}$';
  v_has_phone := v_phone ~ '^[0-9]{10}$';
  v_has_name := char_length(v_name) BETWEEN 2 AND 100
    AND v_name !~ '[[:cntrl:]]';

  IF NOT (v_has_folio OR v_has_phone OR v_has_name) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', result.id,
        'jornada_id', result.jornada_id,
        'folio', result.folio,
        'nombre', result.nombre,
        'celular', repeat('*', 6) || right(result.celular, 4),
        'modalidad', result.modalidad,
        'costo', result.costo,
        'dobles_usados', result.dobles_usados,
        'fecha_registro', result.fecha_registro,
        'status', result.status,
        'payment_status', result.payment_status,
        'payment_reference', '',
        'prize_amount', result.prize_amount,
        'prize_paid_at', result.prize_paid_at,
        'selections',
        coalesce(
          (
            SELECT jsonb_agg(
              jsonb_build_object('partido_id', s.partido_id, 'seleccion', s.seleccion)
              ORDER BY s.id
            )
            FROM public.selections s
            WHERE s.quiniela_id = result.id
          ),
          '[]'::jsonb
        )
      )
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT q.*
    FROM public.quinielas q
    WHERE (v_has_folio AND upper(q.folio) = v_folio)
      OR (v_has_phone AND q.celular = v_phone)
      OR (
        v_has_name
        AND lower(regexp_replace(trim(q.nombre), '[[:space:]]+', ' ', 'g')) = v_name
      )
    ORDER BY q.id DESC
    LIMIT 25
  ) AS result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_quiniela(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_quiniela(text, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
