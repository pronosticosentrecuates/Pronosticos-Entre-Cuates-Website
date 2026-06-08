-- Rebuild completo para el proyecto nuevo de Supabase.
-- Uso: pega y ejecuta este archivo completo en SQL Editor.
-- No borra filas. Reconstruye tipos, defaults, relaciones, RLS, triggers y RPCs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

DROP FUNCTION IF EXISTS public.register_quiniela(jsonb, public.quiniela_status);
DROP FUNCTION IF EXISTS public.get_public_dashboard(integer);
DROP FUNCTION IF EXISTS public.get_public_approved_quinielas(integer);
DROP FUNCTION IF EXISTS public.lookup_quiniela(text, text);
DROP FUNCTION IF EXISTS public.lookup_quiniela(text, text, text);
DROP FUNCTION IF EXISTS public.distribute_jornada_prizes(integer);

DROP TRIGGER IF EXISTS audit_jornadas ON public.jornadas;
DROP TRIGGER IF EXISTS audit_matches ON public.matches;
DROP TRIGGER IF EXISTS audit_quinielas ON public.quinielas;
DROP FUNCTION IF EXISTS public.audit_admin_change();

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
  IF to_regclass('public.jornadas') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla public.jornadas';
  END IF;
  IF to_regclass('public.matches') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla public.matches';
  END IF;
  IF to_regclass('public.quinielas') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla public.quinielas';
  END IF;
  IF to_regclass('public.selections') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla public.selections';
  END IF;
  IF to_regclass('public.combinations') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla public.combinations';
  END IF;
END $$;

ALTER TABLE public.jornadas
  ADD COLUMN IF NOT EXISTS nombre text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS close_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_prize numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS second_prize numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS finished_at timestamptz;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS jornada_id bigint,
  ADD COLUMN IF NOT EXISTS local text,
  ADD COLUMN IF NOT EXISTS visitante text,
  ADD COLUMN IF NOT EXISTS time text,
  ADD COLUMN IF NOT EXISTS time_class text,
  ADD COLUMN IF NOT EXISTS local_img text,
  ADD COLUMN IF NOT EXISTS visitante_img text,
  ADD COLUMN IF NOT EXISTS local_score bigint,
  ADD COLUMN IF NOT EXISTS visitante_score bigint;

ALTER TABLE public.quinielas
  ADD COLUMN IF NOT EXISTS jornada_id bigint,
  ADD COLUMN IF NOT EXISTS folio text,
  ADD COLUMN IF NOT EXISTS nombre text,
  ADD COLUMN IF NOT EXISTS celular text,
  ADD COLUMN IF NOT EXISTS modalidad text DEFAULT '3 dobles',
  ADD COLUMN IF NOT EXISTS costo numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dobles_usados bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fecha_registro timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payment_reference text DEFAULT '',
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_notes text DEFAULT '',
  ADD COLUMN IF NOT EXISTS prize_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prize_paid_at timestamptz;

ALTER TABLE public.selections
  ADD COLUMN IF NOT EXISTS quiniela_id bigint,
  ADD COLUMN IF NOT EXISTS partido_id bigint,
  ADD COLUMN IF NOT EXISTS seleccion text[];

ALTER TABLE public.combinations
  ADD COLUMN IF NOT EXISTS quiniela_id bigint,
  ADD COLUMN IF NOT EXISTS combination text[];

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS actor_id uuid,
  ADD COLUMN IF NOT EXISTS action text,
  ADD COLUMN IF NOT EXISTS entity text,
  ADD COLUMN IF NOT EXISTS entity_id text,
  ADD COLUMN IF NOT EXISTS details jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'jornadas' AND column_name = 'status' AND data_type <> 'text') THEN
    ALTER TABLE public.jornadas ALTER COLUMN status TYPE text USING status::text;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'jornadas' AND column_name = 'notes' AND data_type <> 'text') THEN
    ALTER TABLE public.jornadas ALTER COLUMN notes TYPE text USING notes::text;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'jornadas' AND column_name = 'finished_at' AND data_type <> 'timestamp with time zone') THEN
    ALTER TABLE public.jornadas ALTER COLUMN finished_at TYPE timestamptz USING nullif(finished_at::text, '')::timestamptz;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'quinielas' AND column_name = 'celular' AND data_type <> 'text') THEN
    ALTER TABLE public.quinielas ALTER COLUMN celular TYPE text USING celular::text;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'quinielas' AND column_name = 'folio' AND data_type <> 'text') THEN
    ALTER TABLE public.quinielas ALTER COLUMN folio TYPE text USING folio::text;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'quinielas' AND column_name = 'modalidad' AND data_type <> 'text') THEN
    ALTER TABLE public.quinielas ALTER COLUMN modalidad TYPE text USING modalidad::text;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'quinielas' AND column_name = 'status' AND data_type <> 'text') THEN
    ALTER TABLE public.quinielas ALTER COLUMN status TYPE text USING status::text;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'quinielas' AND column_name = 'payment_status' AND data_type <> 'text') THEN
    ALTER TABLE public.quinielas ALTER COLUMN payment_status TYPE text USING payment_status::text;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'quinielas' AND column_name = 'payment_reference' AND data_type <> 'text') THEN
    ALTER TABLE public.quinielas ALTER COLUMN payment_reference TYPE text USING payment_reference::text;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'quinielas' AND column_name = 'admin_notes' AND data_type <> 'text') THEN
    ALTER TABLE public.quinielas ALTER COLUMN admin_notes TYPE text USING admin_notes::text;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'quinielas' AND column_name = 'prize_paid_at' AND data_type <> 'timestamp with time zone') THEN
    ALTER TABLE public.quinielas ALTER COLUMN prize_paid_at TYPE timestamptz USING nullif(prize_paid_at::text, '')::timestamptz;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'selections' AND column_name = 'seleccion' AND udt_name <> '_text') THEN
    ALTER TABLE public.selections ALTER COLUMN seleccion TYPE text[] USING public._jsonb_to_text_array(to_jsonb(seleccion));
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'combinations' AND column_name = 'combination' AND udt_name <> '_text') THEN
    ALTER TABLE public.combinations ALTER COLUMN combination TYPE text[] USING public._jsonb_to_text_array(to_jsonb(combination));
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'actor_id' AND data_type <> 'uuid') THEN
    ALTER TABLE public.audit_log ALTER COLUMN actor_id TYPE uuid USING nullif(actor_id::text, '')::uuid;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'entity_id' AND data_type <> 'text') THEN
    ALTER TABLE public.audit_log ALTER COLUMN entity_id TYPE text USING entity_id::text;
  END IF;
END $$;

DROP FUNCTION public._jsonb_to_text_array(jsonb);

UPDATE public.jornadas SET nombre = coalesce(nullif(trim(nombre), ''), 'Jornada ' || id::text);
UPDATE public.jornadas SET status = CASE WHEN status IN ('draft', 'open', 'closed', 'finished') THEN status ELSE 'draft' END;
UPDATE public.jornadas SET first_prize = coalesce(first_prize, 0), second_prize = coalesce(second_prize, 0), notes = coalesce(notes, ''), created_at = coalesce(created_at, now());

UPDATE public.quinielas SET nombre = coalesce(nullif(trim(nombre), ''), 'Sin nombre');
UPDATE public.quinielas SET celular = regexp_replace(coalesce(celular, ''), '\D', '', 'g');
UPDATE public.quinielas SET modalidad = CASE WHEN modalidad = '5 dobles' THEN '5 dobles' ELSE '3 dobles' END;
UPDATE public.quinielas SET status = CASE WHEN status IN ('pending', 'accepted', 'cancelled') THEN status ELSE 'pending' END;
UPDATE public.quinielas SET payment_status = CASE WHEN payment_status IN ('pending', 'paid', 'refunded') THEN payment_status ELSE 'pending' END;
UPDATE public.quinielas SET costo = coalesce(costo, CASE WHEN modalidad = '5 dobles' THEN 50 ELSE 30 END);
UPDATE public.quinielas SET dobles_usados = coalesce(dobles_usados, 0);
UPDATE public.quinielas SET fecha_registro = coalesce(fecha_registro, now());
UPDATE public.quinielas SET payment_reference = coalesce(payment_reference, ''), admin_notes = coalesce(admin_notes, ''), prize_amount = coalesce(prize_amount, 0);
UPDATE public.quinielas SET jornada_id = (SELECT id FROM public.jornadas ORDER BY id LIMIT 1) WHERE jornada_id IS NULL;
UPDATE public.quinielas SET folio = 'Q' || jornada_id::text || '-' || lpad(id::text, 6, '0') WHERE folio IS NULL OR trim(folio) = '';

UPDATE public.matches SET jornada_id = (SELECT id FROM public.jornadas ORDER BY id LIMIT 1) WHERE jornada_id IS NULL;
UPDATE public.matches SET time = coalesce(time, ''), time_class = coalesce(time_class, ''), local_img = coalesce(local_img, ''), visitante_img = coalesce(visitante_img, '');

DROP POLICY IF EXISTS public_select_jornadas ON public.jornadas;
DROP POLICY IF EXISTS admin_manage_jornadas ON public.jornadas;
DROP POLICY IF EXISTS public_select_matches ON public.matches;
DROP POLICY IF EXISTS admin_manage_matches ON public.matches;
DROP POLICY IF EXISTS public_select_quinielas ON public.quinielas;
DROP POLICY IF EXISTS admin_manage_quinielas ON public.quinielas;
DROP POLICY IF EXISTS public_select_selections ON public.selections;
DROP POLICY IF EXISTS admin_manage_selections ON public.selections;
DROP POLICY IF EXISTS public_select_combinations ON public.combinations;
DROP POLICY IF EXISTS admin_manage_combinations ON public.combinations;
DROP POLICY IF EXISTS admin_select_audit_log ON public.audit_log;

ALTER TABLE public.jornadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quinielas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

CREATE POLICY public_select_jornadas ON public.jornadas FOR SELECT USING (true);
CREATE POLICY admin_manage_jornadas ON public.jornadas FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY public_select_matches ON public.matches FOR SELECT USING (true);
CREATE POLICY admin_manage_matches ON public.matches FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY public_select_quinielas ON public.quinielas FOR SELECT USING (true);
CREATE POLICY admin_manage_quinielas ON public.quinielas FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY public_select_selections ON public.selections FOR SELECT USING (true);
CREATE POLICY admin_manage_selections ON public.selections FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY public_select_combinations ON public.combinations FOR SELECT USING (true);
CREATE POLICY admin_manage_combinations ON public.combinations FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_select_audit_log ON public.audit_log FOR SELECT USING (public.is_admin());

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jornadas_pkey') THEN
    ALTER TABLE public.jornadas ADD CONSTRAINT jornadas_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matches_pkey') THEN
    ALTER TABLE public.matches ADD CONSTRAINT matches_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quinielas_pkey') THEN
    ALTER TABLE public.quinielas ADD CONSTRAINT quinielas_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'selections_pkey') THEN
    ALTER TABLE public.selections ADD CONSTRAINT selections_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'combinations_pkey') THEN
    ALTER TABLE public.combinations ADD CONSTRAINT combinations_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_log_pkey') THEN
    ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matches_jornada_id_fkey') THEN
    ALTER TABLE public.matches ADD CONSTRAINT matches_jornada_id_fkey FOREIGN KEY (jornada_id) REFERENCES public.jornadas(id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quinielas_jornada_id_fkey') THEN
    ALTER TABLE public.quinielas ADD CONSTRAINT quinielas_jornada_id_fkey FOREIGN KEY (jornada_id) REFERENCES public.jornadas(id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'selections_quiniela_id_fkey') THEN
    ALTER TABLE public.selections ADD CONSTRAINT selections_quiniela_id_fkey FOREIGN KEY (quiniela_id) REFERENCES public.quinielas(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'selections_partido_id_fkey') THEN
    ALTER TABLE public.selections ADD CONSTRAINT selections_partido_id_fkey FOREIGN KEY (partido_id) REFERENCES public.matches(id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'combinations_quiniela_id_fkey') THEN
    ALTER TABLE public.combinations ADD CONSTRAINT combinations_quiniela_id_fkey FOREIGN KEY (quiniela_id) REFERENCES public.quinielas(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_quinielas_folio ON public.quinielas(folio);
CREATE INDEX IF NOT EXISTS idx_matches_jornada_id ON public.matches(jornada_id);
CREATE INDEX IF NOT EXISTS idx_quinielas_jornada_id ON public.quinielas(jornada_id);
CREATE INDEX IF NOT EXISTS idx_quinielas_payment_status ON public.quinielas(payment_status);
CREATE INDEX IF NOT EXISTS idx_selections_quiniela_id ON public.selections(quiniela_id);
CREATE INDEX IF NOT EXISTS idx_combinations_quiniela_id ON public.combinations(quiniela_id);

ALTER TABLE public.selections DROP CONSTRAINT IF EXISTS selections_seleccion_check;
ALTER TABLE public.selections ADD CONSTRAINT selections_seleccion_check CHECK (
  cardinality(seleccion) BETWEEN 1 AND 2
  AND seleccion <@ ARRAY['L', 'E', 'V']::text[]
);

ALTER TABLE public.combinations DROP CONSTRAINT IF EXISTS combinations_combination_check;
ALTER TABLE public.combinations ADD CONSTRAINT combinations_combination_check CHECK (
  combination <@ ARRAY['L', 'E', 'V']::text[]
);

CREATE OR REPLACE FUNCTION public.audit_admin_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, details)
  VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, coalesce(NEW.id::text, OLD.id::text), jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)));
  RETURN coalesce(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_jornadas AFTER INSERT OR UPDATE OR DELETE ON public.jornadas FOR EACH ROW EXECUTE FUNCTION public.audit_admin_change();
CREATE TRIGGER audit_matches AFTER INSERT OR UPDATE OR DELETE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.audit_admin_change();
CREATE TRIGGER audit_quinielas AFTER UPDATE OR DELETE ON public.quinielas FOR EACH ROW EXECUTE FUNCTION public.audit_admin_change();

CREATE FUNCTION public.register_quiniela(p_payload jsonb, p_status public.quiniela_status DEFAULT 'pending')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
  v_folio text;
  v_selection jsonb;
  v_modalidad text;
  v_max_dobles integer;
  v_cost numeric;
  v_dobles integer;
  v_pending_matches integer;
  v_selected_matches integer;
  v_jornada public.jornadas%ROWTYPE;
BEGIN
  IF p_status::text <> 'pending' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede registrar quinielas aceptadas o canceladas';
  END IF;

  SELECT * INTO v_jornada
  FROM public.jornadas
  WHERE id = coalesce(
    (p_payload ->> 'jornada_id')::bigint,
    (SELECT id FROM public.jornadas WHERE status = 'open' ORDER BY id DESC LIMIT 1)
  );

  IF v_jornada.id IS NULL THEN
    RAISE EXCEPTION 'No hay una jornada disponible';
  END IF;

  IF p_status::text = 'pending'
     AND (v_jornada.status <> 'open' OR (v_jornada.close_at IS NOT NULL AND now() >= v_jornada.close_at)) THEN
    RAISE EXCEPTION 'Los registros de esta jornada ya estan cerrados';
  END IF;

  v_modalidad := CASE WHEN p_payload ->> 'modalidad' = '5 dobles' THEN '5 dobles' ELSE '3 dobles' END;
  v_max_dobles := CASE WHEN v_modalidad = '5 dobles' THEN 5 ELSE 3 END;
  v_cost := CASE WHEN v_modalidad = '5 dobles' THEN 50 ELSE 30 END;

  SELECT count(*) INTO v_pending_matches
  FROM public.matches
  WHERE jornada_id = v_jornada.id
    AND (p_status::text <> 'pending' OR local_score IS NULL OR visitante_score IS NULL);

  SELECT
    count(DISTINCT (selection ->> 'partidoId')::bigint),
    count(*) FILTER (WHERE jsonb_array_length(selection -> 'seleccion') = 2)
  INTO v_selected_matches, v_dobles
  FROM jsonb_array_elements(p_payload -> 'selecciones') AS selection;

  IF v_selected_matches <> v_pending_matches THEN
    RAISE EXCEPTION 'La quiniela debe incluir todos los partidos disponibles';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_payload -> 'selecciones') AS selection
    LEFT JOIN public.matches m ON m.id = (selection ->> 'partidoId')::bigint
    WHERE m.id IS NULL
      OR m.jornada_id <> v_jornada.id
      OR (p_status::text = 'pending' AND m.local_score IS NOT NULL AND m.visitante_score IS NOT NULL)
      OR jsonb_array_length(selection -> 'seleccion') NOT BETWEEN 1 AND 2
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(selection -> 'seleccion') AS pick
        WHERE pick NOT IN ('L', 'E', 'V')
      )
  ) THEN
    RAISE EXCEPTION 'La quiniela contiene selecciones no validas';
  END IF;

  IF v_dobles > v_max_dobles THEN
    RAISE EXCEPTION 'La modalidad excede el maximo de dobles';
  END IF;

  INSERT INTO public.quinielas (
    jornada_id, folio, nombre, celular, modalidad, costo, dobles_usados,
    fecha_registro, status, payment_status, payment_reference, admin_notes, prize_amount
  )
  VALUES (
    v_jornada.id, 'TEMP-' || gen_random_uuid()::text, trim(p_payload ->> 'nombre'),
    regexp_replace(p_payload ->> 'celular', '\D', '', 'g'), v_modalidad, v_cost, v_dobles,
    now(), p_status::text, 'pending', '', '', 0
  )
  RETURNING id INTO v_id;

  v_folio := 'Q' || v_jornada.id::text || '-' || lpad(v_id::text, 6, '0');
  UPDATE public.quinielas SET folio = v_folio WHERE id = v_id;

  FOR v_selection IN SELECT * FROM jsonb_array_elements(p_payload -> 'selecciones')
  LOOP
    INSERT INTO public.selections (quiniela_id, partido_id, seleccion)
    VALUES (
      v_id,
      (v_selection ->> 'partidoId')::bigint,
      ARRAY(SELECT DISTINCT jsonb_array_elements_text(v_selection -> 'seleccion'))
    );
  END LOOP;

  WITH RECURSIVE ordered AS (
    SELECT row_number() OVER (ORDER BY s.id) AS rn, s.seleccion
    FROM public.selections s
    WHERE s.quiniela_id = v_id
  ), combos AS (
    SELECT 0::bigint AS rn, ARRAY[]::text[] AS combination
    UNION ALL
    SELECT o.rn, c.combination || pick
    FROM combos c
    JOIN ordered o ON o.rn = c.rn + 1
    CROSS JOIN LATERAL unnest(o.seleccion) AS pick
  )
  INSERT INTO public.combinations (quiniela_id, combination)
  SELECT v_id, combination FROM combos WHERE rn = v_pending_matches;

  RETURN v_folio;
END;
$$;

CREATE FUNCTION public.get_public_dashboard(p_jornada_id integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH selected_jornada AS (
    SELECT *
    FROM public.jornadas
    WHERE id = coalesce(
      p_jornada_id,
      (SELECT id FROM public.jornadas WHERE status = 'open' ORDER BY id DESC LIMIT 1),
      (SELECT id FROM public.jornadas WHERE status = 'closed' ORDER BY id DESC LIMIT 1),
      (SELECT id FROM public.jornadas WHERE status = 'finished' ORDER BY id DESC LIMIT 1),
      (SELECT id FROM public.jornadas ORDER BY id DESC LIMIT 1)
    )
  ), ranked AS (
    SELECT
      q.id,
      q.folio,
      left(q.nombre, 1) || '***' AS nombre,
      q.modalidad,
      q.dobles_usados,
      count(*) FILTER (
        WHERE m.local_score IS NOT NULL
          AND m.visitante_score IS NOT NULL
          AND (
            CASE
              WHEN m.local_score > m.visitante_score THEN 'L'
              WHEN m.local_score < m.visitante_score THEN 'V'
              ELSE 'E'
            END
          ) = ANY(s.seleccion)
      )::integer AS aciertos
    FROM public.quinielas q
    JOIN selected_jornada j ON j.id = q.jornada_id
    JOIN public.selections s ON s.quiniela_id = q.id
    JOIN public.matches m ON m.id = s.partido_id
    WHERE q.status = 'accepted'
    GROUP BY q.id, q.folio, q.nombre, q.modalidad, q.dobles_usados
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
  )
  FROM selected_jornada j;
$$;

CREATE FUNCTION public.get_public_approved_quinielas(p_jornada_id integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'jornada_id', q.jornada_id,
      'folio', q.folio,
      'nombre', q.nombre,
      'celular', q.celular,
      'modalidad', q.modalidad,
      'costo', q.costo,
      'dobles_usados', q.dobles_usados,
      'fecha_registro', q.fecha_registro,
      'status', q.status,
      'payment_status', q.payment_status,
      'payment_reference', q.payment_reference,
      'paid_at', q.paid_at,
      'admin_notes', q.admin_notes,
      'prize_amount', q.prize_amount,
      'prize_paid_at', q.prize_paid_at,
      'selections', coalesce((
        SELECT jsonb_agg(jsonb_build_object('partido_id', s.partido_id, 'seleccion', s.seleccion) ORDER BY s.id)
        FROM public.selections s
        WHERE s.quiniela_id = q.id
      ), '[]'::jsonb),
      'combinations', coalesce((
        SELECT jsonb_agg(jsonb_build_object('combination', c.combination) ORDER BY c.id)
        FROM public.combinations c
        WHERE c.quiniela_id = q.id
      ), '[]'::jsonb)
    )
    ORDER BY q.id
  ), '[]'::jsonb)
  FROM public.quinielas q
  WHERE q.status = 'accepted'
    AND (p_jornada_id IS NULL OR q.jornada_id = p_jornada_id);
$$;

CREATE FUNCTION public.lookup_quiniela(p_folio text, p_phone text, p_nombre text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'jornada_id', q.jornada_id,
      'folio', q.folio,
      'nombre', q.nombre,
      'modalidad', q.modalidad,
      'costo', q.costo,
      'dobles_usados', q.dobles_usados,
      'fecha_registro', q.fecha_registro,
      'status', q.status,
      'payment_status', q.payment_status,
      'payment_reference', q.payment_reference,
      'prize_amount', q.prize_amount,
      'prize_paid_at', q.prize_paid_at,
      'jornada', to_jsonb(j),
      'selections', coalesce((
        SELECT jsonb_agg(jsonb_build_object('partido_id', s.partido_id, 'seleccion', s.seleccion) ORDER BY s.id)
        FROM public.selections s
        WHERE s.quiniela_id = q.id
      ), '[]'::jsonb)
    )
    ORDER BY q.id
  ), '[]'::jsonb)
  FROM public.quinielas q
  JOIN public.jornadas j ON j.id = q.jornada_id
  WHERE (
    (trim(coalesce(p_folio, '')) <> '' AND upper(q.folio) = upper(trim(p_folio)))
    OR (length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) = 10 AND q.celular = regexp_replace(p_phone, '\D', '', 'g'))
    OR (
      length(trim(coalesce(p_nombre, ''))) >= 2
      AND lower(regexp_replace(trim(q.nombre), '[[:space:]]+', ' ', 'g')) = lower(regexp_replace(trim(p_nombre), '[[:space:]]+', ' ', 'g'))
    )
  );
$$;

CREATE FUNCTION public.lookup_quiniela(p_folio text, p_phone_last4 text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    SELECT item
    FROM jsonb_array_elements(public.lookup_quiniela(p_folio, p_phone_last4, '')) AS item
    LIMIT 1
  );
$$;

CREATE FUNCTION public.distribute_jornada_prizes(p_jornada_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_score integer;
  v_second_score integer;
  v_first_count integer;
  v_second_count integer;
  v_first_prize numeric;
  v_second_prize numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede repartir premios';
  END IF;

  SELECT first_prize, second_prize INTO v_first_prize, v_second_prize
  FROM public.jornadas
  WHERE id = p_jornada_id;

  UPDATE public.quinielas
  SET prize_amount = 0, prize_paid_at = NULL
  WHERE jornada_id = p_jornada_id;

  WITH scores AS (
    SELECT q.id,
      count(*) FILTER (
        WHERE m.local_score IS NOT NULL
          AND m.visitante_score IS NOT NULL
          AND (
            CASE
              WHEN m.local_score > m.visitante_score THEN 'L'
              WHEN m.local_score < m.visitante_score THEN 'V'
              ELSE 'E'
            END
          ) = ANY(s.seleccion)
      )::integer AS aciertos
    FROM public.quinielas q
    JOIN public.selections s ON s.quiniela_id = q.id
    JOIN public.matches m ON m.id = s.partido_id
    WHERE q.jornada_id = p_jornada_id AND q.status = 'accepted'
    GROUP BY q.id
  )
  SELECT max(aciertos) INTO v_first_score FROM scores;

  WITH scores AS (
    SELECT q.id,
      count(*) FILTER (
        WHERE m.local_score IS NOT NULL
          AND m.visitante_score IS NOT NULL
          AND (
            CASE
              WHEN m.local_score > m.visitante_score THEN 'L'
              WHEN m.local_score < m.visitante_score THEN 'V'
              ELSE 'E'
            END
          ) = ANY(s.seleccion)
      )::integer AS aciertos
    FROM public.quinielas q
    JOIN public.selections s ON s.quiniela_id = q.id
    JOIN public.matches m ON m.id = s.partido_id
    WHERE q.jornada_id = p_jornada_id AND q.status = 'accepted'
    GROUP BY q.id
  )
  SELECT max(aciertos) INTO v_second_score FROM scores WHERE aciertos < v_first_score;

  WITH scores AS (
    SELECT q.id,
      count(*) FILTER (
        WHERE m.local_score IS NOT NULL
          AND m.visitante_score IS NOT NULL
          AND (
            CASE
              WHEN m.local_score > m.visitante_score THEN 'L'
              WHEN m.local_score < m.visitante_score THEN 'V'
              ELSE 'E'
            END
          ) = ANY(s.seleccion)
      )::integer AS aciertos
    FROM public.quinielas q
    JOIN public.selections s ON s.quiniela_id = q.id
    JOIN public.matches m ON m.id = s.partido_id
    WHERE q.jornada_id = p_jornada_id AND q.status = 'accepted'
    GROUP BY q.id
  )
  SELECT
    count(*) FILTER (WHERE aciertos = v_first_score),
    count(*) FILTER (WHERE aciertos = v_second_score)
  INTO v_first_count, v_second_count
  FROM scores;

  WITH scores AS (
    SELECT q.id,
      count(*) FILTER (
        WHERE m.local_score IS NOT NULL
          AND m.visitante_score IS NOT NULL
          AND (
            CASE
              WHEN m.local_score > m.visitante_score THEN 'L'
              WHEN m.local_score < m.visitante_score THEN 'V'
              ELSE 'E'
            END
          ) = ANY(s.seleccion)
      )::integer AS aciertos
    FROM public.quinielas q
    JOIN public.selections s ON s.quiniela_id = q.id
    JOIN public.matches m ON m.id = s.partido_id
    WHERE q.jornada_id = p_jornada_id AND q.status = 'accepted'
    GROUP BY q.id
  )
  UPDATE public.quinielas q
  SET prize_amount = CASE
    WHEN scores.aciertos = v_first_score AND v_first_count > 0 THEN coalesce(v_first_prize, 0) / v_first_count
    WHEN scores.aciertos = v_second_score AND v_second_count > 0 THEN coalesce(v_second_prize, 0) / v_second_count
    ELSE 0
  END
  FROM scores
  WHERE q.id = scores.id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_quiniela(jsonb, public.quiniela_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_dashboard(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_approved_quinielas(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lookup_quiniela(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lookup_quiniela(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.distribute_jornada_prizes(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.register_quiniela(jsonb, public.quiniela_status) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_dashboard(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_approved_quinielas(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_quiniela(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_quiniela(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_jornada_prizes(integer) TO authenticated;

SELECT setval(pg_get_serial_sequence('public.jornadas', 'id'), coalesce((SELECT max(id) FROM public.jornadas), 1), true)
WHERE pg_get_serial_sequence('public.jornadas', 'id') IS NOT NULL;
SELECT setval(pg_get_serial_sequence('public.quinielas', 'id'), coalesce((SELECT max(id) FROM public.quinielas), 1), true)
WHERE pg_get_serial_sequence('public.quinielas', 'id') IS NOT NULL;
SELECT setval(pg_get_serial_sequence('public.selections', 'id'), coalesce((SELECT max(id) FROM public.selections), 1), true)
WHERE pg_get_serial_sequence('public.selections', 'id') IS NOT NULL;
SELECT setval(pg_get_serial_sequence('public.combinations', 'id'), coalesce((SELECT max(id) FROM public.combinations), 1), true)
WHERE pg_get_serial_sequence('public.combinations', 'id') IS NOT NULL;

NOTIFY pgrst, 'reload schema';

SELECT
  'ok' AS status,
  (SELECT count(*) FROM public.jornadas) AS jornadas,
  (SELECT count(*) FROM public.matches) AS matches,
  (SELECT count(*) FROM public.quinielas) AS quinielas,
  (SELECT count(*) FROM public.selections) AS selections,
  (SELECT count(*) FROM public.combinations) AS combinations;
