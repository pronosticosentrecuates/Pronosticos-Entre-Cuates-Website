-- Esquema de Supabase para Quinielas entre Cuates.
-- Ejecuta este archivo en el SQL Editor después de crear al usuario administrador.
-- Asigna el rol con app_metadata: {"role":"admin"} desde un entorno seguro.

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

CREATE TABLE IF NOT EXISTS public.matches (
  id integer PRIMARY KEY,
  local text NOT NULL,
  visitante text NOT NULL,
  time text,
  time_class text,
  local_img text,
  visitante_img text,
  local_score integer CHECK (local_score IS NULL OR local_score >= 0),
  visitante_score integer CHECK (visitante_score IS NULL OR visitante_score >= 0)
);

CREATE TABLE IF NOT EXISTS public.quinielas (
  id serial PRIMARY KEY,
  nombre text NOT NULL CHECK (char_length(trim(nombre)) >= 2),
  celular text NOT NULL CHECK (celular ~ '^[0-9]{10}$'),
  modalidad modalidad_enum NOT NULL DEFAULT '3 dobles',
  costo numeric NOT NULL CHECK (costo >= 0),
  dobles_usados integer NOT NULL DEFAULT 0 CHECK (dobles_usados >= 0),
  fecha_registro timestamptz NOT NULL DEFAULT now(),
  status quiniela_status NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS public.selections (
  id serial PRIMARY KEY,
  quiniela_id integer NOT NULL REFERENCES public.quinielas(id) ON DELETE CASCADE,
  partido_id integer NOT NULL REFERENCES public.matches(id) ON DELETE RESTRICT,
  seleccion text[] NOT NULL CHECK (
    cardinality(seleccion) BETWEEN 1 AND 2
    AND seleccion <@ ARRAY['L', 'E', 'V']::text[]
  ),
  UNIQUE (quiniela_id, partido_id)
);

CREATE TABLE IF NOT EXISTS public.combinations (
  id serial PRIMARY KEY,
  quiniela_id integer NOT NULL REFERENCES public.quinielas(id) ON DELETE CASCADE,
  combination text[] NOT NULL CHECK (combination <@ ARRAY['L', 'E', 'V']::text[])
);

CREATE INDEX IF NOT EXISTS idx_selections_quiniela_id ON public.selections(quiniela_id);
CREATE INDEX IF NOT EXISTS idx_combinations_quiniela_id ON public.combinations(quiniela_id);

CREATE SEQUENCE IF NOT EXISTS public.quinielas_id_seq;
ALTER SEQUENCE public.quinielas_id_seq OWNED BY public.quinielas.id;
ALTER TABLE public.quinielas ALTER COLUMN id SET DEFAULT nextval('public.quinielas_id_seq'::regclass);
SELECT setval('public.quinielas_id_seq', greatest(coalesce((SELECT max(id) FROM public.quinielas), 0) + 1, 1), false);

CREATE SEQUENCE IF NOT EXISTS public.selections_id_seq;
ALTER SEQUENCE public.selections_id_seq OWNED BY public.selections.id;
ALTER TABLE public.selections ALTER COLUMN id SET DEFAULT nextval('public.selections_id_seq'::regclass);
SELECT setval('public.selections_id_seq', greatest(coalesce((SELECT max(id) FROM public.selections), 0) + 1, 1), false);

CREATE SEQUENCE IF NOT EXISTS public.combinations_id_seq;
ALTER SEQUENCE public.combinations_id_seq OWNED BY public.combinations.id;
ALTER TABLE public.combinations ALTER COLUMN id SET DEFAULT nextval('public.combinations_id_seq'::regclass);
SELECT setval('public.combinations_id_seq', greatest(coalesce((SELECT max(id) FROM public.combinations), 0) + 1, 1), false);

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

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

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quinielas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combinations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_select_matches ON public.matches;
DROP POLICY IF EXISTS public_insert_matches ON public.matches;
DROP POLICY IF EXISTS public_update_matches ON public.matches;
DROP POLICY IF EXISTS public_delete_matches ON public.matches;
DROP POLICY IF EXISTS admin_manage_matches ON public.matches;
CREATE POLICY public_select_matches ON public.matches FOR SELECT USING (true);
CREATE POLICY admin_manage_matches ON public.matches FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS public_select_quinielas ON public.quinielas;
DROP POLICY IF EXISTS admin_manage_quinielas ON public.quinielas;
CREATE POLICY public_select_quinielas ON public.quinielas FOR SELECT USING (true);
CREATE POLICY admin_manage_quinielas ON public.quinielas FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS public_select_selections ON public.selections;
DROP POLICY IF EXISTS public_insert_selections ON public.selections;
DROP POLICY IF EXISTS public_delete_selections ON public.selections;
DROP POLICY IF EXISTS admin_manage_selections ON public.selections;
CREATE POLICY public_select_selections ON public.selections FOR SELECT USING (true);
CREATE POLICY admin_manage_selections ON public.selections FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS public_select_combinations ON public.combinations;
DROP POLICY IF EXISTS admin_manage_combinations ON public.combinations;
CREATE POLICY public_select_combinations ON public.combinations FOR SELECT USING (true);
CREATE POLICY admin_manage_combinations ON public.combinations FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON FUNCTION public.register_quiniela(jsonb, public.quiniela_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_quiniela(jsonb, public.quiniela_status) TO anon, authenticated;
