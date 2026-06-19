ALTER TABLE public.jornadas ADD COLUMN IF NOT EXISTS open_at timestamptz;

DROP FUNCTION IF EXISTS public.register_quiniela(jsonb, public.quiniela_status);
CREATE FUNCTION public.register_quiniela(p_payload jsonb, p_status public.quiniela_status DEFAULT 'pending')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id integer;
  v_folio text;
  v_selection jsonb;
  v_modalidad public.modalidad_enum;
  v_max_dobles integer;
  v_cost numeric;
  v_dobles integer;
  v_pending_matches integer;
  v_selected_matches integer;
  v_jornada public.jornadas%ROWTYPE;
  v_opened boolean;
  v_closed boolean;
BEGIN
  IF p_status <> 'pending' AND NOT public.is_admin() THEN RAISE EXCEPTION 'Solo un administrador puede registrar quinielas aceptadas o canceladas'; END IF;

  SELECT * INTO v_jornada FROM public.jornadas
  WHERE id = coalesce(
    (p_payload ->> 'jornada_id')::integer,
    (
      SELECT id FROM public.jornadas
      WHERE (status = 'open' OR (status = 'draft' AND open_at IS NOT NULL AND now() >= open_at))
        AND (close_at IS NULL OR now() < close_at)
      ORDER BY coalesce(open_at, created_at) DESC, id DESC
      LIMIT 1
    )
  );

  IF v_jornada.id IS NULL THEN RAISE EXCEPTION 'No hay una jornada disponible'; END IF;

  v_opened := v_jornada.status = 'open' OR (v_jornada.status = 'draft' AND v_jornada.open_at IS NOT NULL AND now() >= v_jornada.open_at);
  v_closed := v_jornada.status IN ('closed', 'finished') OR (v_jornada.close_at IS NOT NULL AND now() >= v_jornada.close_at);

  IF p_status = 'pending' AND (NOT v_opened OR v_closed) THEN
    RAISE EXCEPTION 'Los registros de esta jornada ya estan cerrados';
  END IF;

  v_modalidad := (p_payload ->> 'modalidad')::public.modalidad_enum;
  v_max_dobles := CASE WHEN v_modalidad = '5 dobles' THEN 5 ELSE 3 END;
  v_cost := CASE WHEN v_modalidad = '5 dobles' THEN 50 ELSE 30 END;

  SELECT count(*) INTO v_pending_matches FROM public.matches
  WHERE jornada_id = v_jornada.id AND (p_status <> 'pending' OR local_score IS NULL OR visitante_score IS NULL);

  SELECT count(DISTINCT (selection ->> 'partidoId')::integer), count(*) FILTER (WHERE jsonb_array_length(selection -> 'seleccion') = 2)
  INTO v_selected_matches, v_dobles FROM jsonb_array_elements(p_payload -> 'selecciones') AS selection;

  IF v_selected_matches <> v_pending_matches THEN RAISE EXCEPTION 'La quiniela debe incluir todos los partidos disponibles'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_payload -> 'selecciones') AS selection
    LEFT JOIN public.matches m ON m.id = (selection ->> 'partidoId')::integer
    WHERE m.id IS NULL OR m.jornada_id <> v_jornada.id
      OR (p_status = 'pending' AND m.local_score IS NOT NULL AND m.visitante_score IS NOT NULL)
      OR jsonb_array_length(selection -> 'seleccion') NOT BETWEEN 1 AND 2
      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(selection -> 'seleccion') AS pick WHERE pick NOT IN ('L', 'E', 'V'))
  ) THEN RAISE EXCEPTION 'La quiniela contiene selecciones no validas'; END IF;

  IF v_dobles > v_max_dobles THEN RAISE EXCEPTION 'La modalidad excede el maximo de dobles'; END IF;

  INSERT INTO public.quinielas (jornada_id, folio, nombre, celular, modalidad, costo, dobles_usados, fecha_registro, status)
  VALUES (v_jornada.id, 'TEMP-' || gen_random_uuid()::text, trim(p_payload ->> 'nombre'), p_payload ->> 'celular', v_modalidad, v_cost, v_dobles, now(), p_status)
  RETURNING id INTO v_id;

  v_folio := 'Q' || v_jornada.id::text || '-' || lpad(v_id::text, 6, '0');
  UPDATE public.quinielas SET folio = v_folio WHERE id = v_id;

  FOR v_selection IN SELECT * FROM jsonb_array_elements(p_payload -> 'selecciones') LOOP
    INSERT INTO public.selections (quiniela_id, partido_id, seleccion)
    VALUES (v_id, (v_selection ->> 'partidoId')::integer, ARRAY(SELECT DISTINCT jsonb_array_elements_text(v_selection -> 'seleccion')));
  END LOOP;

  WITH RECURSIVE ordered AS (
    SELECT row_number() OVER (ORDER BY s.id) AS rn, s.seleccion FROM public.selections s WHERE s.quiniela_id = v_id
  ), combos AS (
    SELECT 0::bigint AS rn, ARRAY[]::text[] AS combination
    UNION ALL
    SELECT o.rn, c.combination || pick FROM combos c JOIN ordered o ON o.rn = c.rn + 1 CROSS JOIN LATERAL unnest(o.seleccion) AS pick
  )
  INSERT INTO public.combinations (quiniela_id, combination) SELECT v_id, combination FROM combos WHERE rn = v_pending_matches;

  RETURN v_folio;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_dashboard(p_jornada_id integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH selected_jornada AS (
    SELECT * FROM public.jornadas WHERE id = coalesce(
      p_jornada_id,
      (
        SELECT id FROM public.jornadas
        WHERE (status = 'open' OR (status = 'draft' AND open_at IS NOT NULL AND now() >= open_at))
          AND (close_at IS NULL OR now() < close_at)
        ORDER BY coalesce(open_at, created_at) DESC, id DESC
        LIMIT 1
      ),
      (
        SELECT id FROM public.jornadas
        WHERE status = 'draft' AND open_at IS NOT NULL AND now() < open_at
        ORDER BY open_at ASC, id DESC
        LIMIT 1
      ),
      (SELECT id FROM public.jornadas WHERE status = 'closed' ORDER BY id DESC LIMIT 1),
      (SELECT id FROM public.jornadas ORDER BY id DESC LIMIT 1)
    )
  ), ranked AS (
    SELECT q.id, q.folio, left(q.nombre, 1) || '***' AS nombre, q.modalidad, q.dobles_usados,
      count(*) FILTER (WHERE m.local_score IS NOT NULL AND m.visitante_score IS NOT NULL AND
        (CASE WHEN m.local_score > m.visitante_score THEN 'L' WHEN m.local_score < m.visitante_score THEN 'V' ELSE 'E' END) = ANY(s.seleccion)
      )::integer AS aciertos
    FROM public.quinielas q JOIN selected_jornada j ON j.id = q.jornada_id
    JOIN public.selections s ON s.quiniela_id = q.id JOIN public.matches m ON m.id = s.partido_id
    WHERE q.status = 'accepted' GROUP BY q.id
  )
  SELECT jsonb_build_object(
    'jornada', to_jsonb(j),
    'matches', coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.matches m WHERE m.jornada_id = j.id), '[]'::jsonb),
    'stats', jsonb_build_object(
      'registered', (SELECT count(*) FROM public.quinielas q WHERE q.jornada_id = j.id),
      'accepted', (SELECT count(*) FROM public.quinielas q WHERE q.jornada_id = j.id AND q.status = 'accepted'),
      'pool', (SELECT coalesce(sum(q.costo), 0) FROM public.quinielas q WHERE q.jornada_id = j.id AND q.status = 'accepted')
    ),
    'ranking', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.aciertos DESC, r.nombre) FROM ranked r), '[]'::jsonb)
  ) FROM selected_jornada j;
$$;

REVOKE ALL ON FUNCTION public.register_quiniela(jsonb, public.quiniela_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_dashboard(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_quiniela(jsonb, public.quiniela_status) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_dashboard(integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
