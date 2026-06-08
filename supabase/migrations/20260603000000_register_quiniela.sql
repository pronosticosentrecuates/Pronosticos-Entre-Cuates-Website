CREATE OR REPLACE FUNCTION public.register_quiniela(
  p_payload jsonb,
  p_status public.quiniela_status DEFAULT 'pending'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id integer;
  v_selection jsonb;
  v_combination jsonb;
  v_modalidad public.modalidad_enum;
  v_max_dobles integer;
  v_cost numeric;
  v_dobles integer;
  v_pending_matches integer;
  v_selected_matches integer;
BEGIN
  v_modalidad := (p_payload ->> 'modalidad')::public.modalidad_enum;
  v_max_dobles := CASE WHEN v_modalidad = '5 dobles' THEN 5 ELSE 3 END;
  v_cost := CASE WHEN v_modalidad = '5 dobles' THEN 50 ELSE 30 END;

  SELECT count(*)
  INTO v_pending_matches
  FROM public.matches
  WHERE p_status <> 'pending'
    OR local_score IS NULL
    OR visitante_score IS NULL;

  SELECT
    count(DISTINCT (selection ->> 'partidoId')::integer),
    count(*) FILTER (WHERE jsonb_array_length(selection -> 'seleccion') = 2)
  INTO v_selected_matches, v_dobles
  FROM jsonb_array_elements(p_payload -> 'selecciones') AS selection;

  IF p_status <> 'pending' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede registrar quinielas aceptadas o canceladas';
  END IF;

  IF v_selected_matches <> v_pending_matches THEN
    RAISE EXCEPTION 'La quiniela debe incluir todos los partidos pendientes';
  END IF;

  IF p_status = 'pending' AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_payload -> 'selecciones') AS selection
    LEFT JOIN public.matches m
      ON m.id = (selection ->> 'partidoId')::integer
    WHERE m.id IS NULL
      OR (m.local_score IS NOT NULL AND m.visitante_score IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'La quiniela contiene partidos no disponibles';
  END IF;

  IF v_dobles > v_max_dobles THEN
    RAISE EXCEPTION 'La modalidad excede el máximo de dobles';
  END IF;

  INSERT INTO public.quinielas (
    nombre,
    celular,
    modalidad,
    costo,
    dobles_usados,
    fecha_registro,
    status
  )
  VALUES (
    trim(p_payload ->> 'nombre'),
    p_payload ->> 'celular',
    v_modalidad,
    v_cost,
    v_dobles,
    coalesce((p_payload ->> 'fecha_registro')::timestamptz, now()),
    p_status
  )
  RETURNING id INTO v_id;

  FOR v_selection IN SELECT * FROM jsonb_array_elements(p_payload -> 'selecciones')
  LOOP
    INSERT INTO public.selections (quiniela_id, partido_id, seleccion)
    VALUES (
      v_id,
      (v_selection ->> 'partidoId')::integer,
      ARRAY(SELECT jsonb_array_elements_text(v_selection -> 'seleccion'))
    );
  END LOOP;

  FOR v_combination IN SELECT * FROM jsonb_array_elements(p_payload -> 'combinaciones')
  LOOP
    INSERT INTO public.combinations (quiniela_id, combination)
    VALUES (
      v_id,
      ARRAY(SELECT jsonb_array_elements_text(v_combination))
    );
  END LOOP;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_quiniela(jsonb, public.quiniela_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_quiniela(jsonb, public.quiniela_status) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
