-- Jornadas, privacidad, pagos, premios, auditoria y validacion autoritativa.

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

CREATE TABLE IF NOT EXISTS public.jornadas (
  id serial PRIMARY KEY,
  nombre text NOT NULL CHECK (char_length(trim(nombre)) >= 2),
  status jornada_status NOT NULL DEFAULT 'draft',
  close_at timestamptz,
  first_prize numeric NOT NULL DEFAULT 0 CHECK (first_prize >= 0),
  second_prize numeric NOT NULL DEFAULT 0 CHECK (second_prize >= 0),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

INSERT INTO public.jornadas (nombre, status, close_at)
SELECT 'Jornada inicial', 'open', now() + interval '7 days'
WHERE NOT EXISTS (SELECT 1 FROM public.jornadas);

ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS jornada_id integer REFERENCES public.jornadas(id) ON DELETE RESTRICT;
ALTER TABLE public.quinielas ADD COLUMN IF NOT EXISTS jornada_id integer REFERENCES public.jornadas(id) ON DELETE RESTRICT;
ALTER TABLE public.quinielas ADD COLUMN IF NOT EXISTS folio text;
ALTER TABLE public.quinielas ADD COLUMN IF NOT EXISTS payment_status payment_status NOT NULL DEFAULT 'pending';
ALTER TABLE public.quinielas ADD COLUMN IF NOT EXISTS payment_reference text NOT NULL DEFAULT '';
ALTER TABLE public.quinielas ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE public.quinielas ADD COLUMN IF NOT EXISTS admin_notes text NOT NULL DEFAULT '';
ALTER TABLE public.quinielas ADD COLUMN IF NOT EXISTS prize_amount numeric NOT NULL DEFAULT 0 CHECK (prize_amount >= 0);
ALTER TABLE public.quinielas ADD COLUMN IF NOT EXISTS prize_paid_at timestamptz;

UPDATE public.matches SET jornada_id = (SELECT id FROM public.jornadas ORDER BY id LIMIT 1) WHERE jornada_id IS NULL;
UPDATE public.quinielas SET jornada_id = (SELECT id FROM public.jornadas ORDER BY id LIMIT 1) WHERE jornada_id IS NULL;
UPDATE public.quinielas SET folio = 'Q-' || lpad(id::text, 6, '0') WHERE folio IS NULL OR folio = '';

ALTER TABLE public.matches ALTER COLUMN jornada_id SET NOT NULL;
ALTER TABLE public.quinielas ALTER COLUMN jornada_id SET NOT NULL;
ALTER TABLE public.quinielas ALTER COLUMN folio SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_quinielas_folio ON public.quinielas(folio);
CREATE UNIQUE INDEX IF NOT EXISTS idx_jornadas_single_open ON public.jornadas(status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_matches_jornada_id ON public.matches(jornada_id);
CREATE INDEX IF NOT EXISTS idx_quinielas_jornada_id ON public.quinielas(jornada_id);
CREATE INDEX IF NOT EXISTS idx_quinielas_payment_status ON public.quinielas(payment_status);

ALTER TABLE public.selections DROP CONSTRAINT IF EXISTS selections_seleccion_check;
ALTER TABLE public.selections ADD CONSTRAINT selections_seleccion_check CHECK (
  cardinality(seleccion) BETWEEN 1 AND 2
  AND seleccion <@ ARRAY['L', 'E', 'V']::text[]
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id bigserial PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
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

DROP TRIGGER IF EXISTS audit_jornadas ON public.jornadas;
CREATE TRIGGER audit_jornadas AFTER INSERT OR UPDATE OR DELETE ON public.jornadas FOR EACH ROW EXECUTE FUNCTION public.audit_admin_change();
DROP TRIGGER IF EXISTS audit_matches ON public.matches;
CREATE TRIGGER audit_matches AFTER INSERT OR UPDATE OR DELETE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.audit_admin_change();
DROP TRIGGER IF EXISTS audit_quinielas ON public.quinielas;
CREATE TRIGGER audit_quinielas AFTER UPDATE OR DELETE ON public.quinielas FOR EACH ROW EXECUTE FUNCTION public.audit_admin_change();

DROP POLICY IF EXISTS public_select_quinielas ON public.quinielas;
DROP POLICY IF EXISTS public_select_selections ON public.selections;
DROP POLICY IF EXISTS public_select_combinations ON public.combinations;

ALTER TABLE public.jornadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS public_select_jornadas ON public.jornadas;
DROP POLICY IF EXISTS admin_manage_jornadas ON public.jornadas;
CREATE POLICY public_select_jornadas ON public.jornadas FOR SELECT USING (true);
CREATE POLICY admin_manage_jornadas ON public.jornadas FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS admin_select_audit_log ON public.audit_log;
CREATE POLICY admin_select_audit_log ON public.audit_log FOR SELECT USING (public.is_admin());

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
BEGIN
  IF p_status <> 'pending' AND NOT public.is_admin() THEN RAISE EXCEPTION 'Solo un administrador puede registrar quinielas aceptadas o canceladas'; END IF;

  SELECT * INTO v_jornada FROM public.jornadas
  WHERE id = coalesce((p_payload ->> 'jornada_id')::integer, (SELECT id FROM public.jornadas WHERE status = 'open' ORDER BY id DESC LIMIT 1));

  IF v_jornada.id IS NULL THEN RAISE EXCEPTION 'No hay una jornada disponible'; END IF;
  IF p_status = 'pending' AND (v_jornada.status <> 'open' OR (v_jornada.close_at IS NOT NULL AND now() >= v_jornada.close_at)) THEN
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
      (SELECT id FROM public.jornadas WHERE status IN ('open', 'closed') ORDER BY id DESC LIMIT 1),
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

CREATE OR REPLACE FUNCTION public.lookup_quiniela(p_folio text, p_phone_last4 text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', q.id, 'folio', q.folio, 'nombre', q.nombre, 'modalidad', q.modalidad, 'costo', q.costo,
    'dobles_usados', q.dobles_usados, 'fecha_registro', q.fecha_registro, 'status', q.status,
    'payment_status', q.payment_status, 'payment_reference', q.payment_reference, 'prize_amount', q.prize_amount,
    'prize_paid_at', q.prize_paid_at, 'jornada', to_jsonb(j),
    'selections', coalesce((SELECT jsonb_agg(jsonb_build_object('partido_id', s.partido_id, 'seleccion', s.seleccion) ORDER BY s.id) FROM public.selections s WHERE s.quiniela_id = q.id), '[]'::jsonb)
  )
  FROM public.quinielas q JOIN public.jornadas j ON j.id = q.jornada_id
  WHERE upper(q.folio) = upper(trim(p_folio)) AND right(q.celular, 4) = regexp_replace(p_phone_last4, '\D', '', 'g')
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.distribute_jornada_prizes(p_jornada_id integer)
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
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Solo un administrador puede repartir premios'; END IF;

  SELECT first_prize, second_prize INTO v_first_prize, v_second_prize FROM public.jornadas WHERE id = p_jornada_id;
  UPDATE public.quinielas SET prize_amount = 0, prize_paid_at = NULL WHERE jornada_id = p_jornada_id;

  WITH scores AS (
    SELECT q.id, count(*) FILTER (WHERE m.local_score IS NOT NULL AND m.visitante_score IS NOT NULL AND
      (CASE WHEN m.local_score > m.visitante_score THEN 'L' WHEN m.local_score < m.visitante_score THEN 'V' ELSE 'E' END) = ANY(s.seleccion)
    )::integer AS aciertos
    FROM public.quinielas q JOIN public.selections s ON s.quiniela_id = q.id JOIN public.matches m ON m.id = s.partido_id
    WHERE q.jornada_id = p_jornada_id AND q.status = 'accepted'
    GROUP BY q.id
  )
  SELECT max(aciertos) INTO v_first_score FROM scores;

  WITH scores AS (
    SELECT q.id, count(*) FILTER (WHERE m.local_score IS NOT NULL AND m.visitante_score IS NOT NULL AND
      (CASE WHEN m.local_score > m.visitante_score THEN 'L' WHEN m.local_score < m.visitante_score THEN 'V' ELSE 'E' END) = ANY(s.seleccion)
    )::integer AS aciertos
    FROM public.quinielas q JOIN public.selections s ON s.quiniela_id = q.id JOIN public.matches m ON m.id = s.partido_id
    WHERE q.jornada_id = p_jornada_id AND q.status = 'accepted'
    GROUP BY q.id
  )
  SELECT max(aciertos) INTO v_second_score FROM scores WHERE aciertos < v_first_score;

  WITH scores AS (
    SELECT q.id, count(*) FILTER (WHERE m.local_score IS NOT NULL AND m.visitante_score IS NOT NULL AND
      (CASE WHEN m.local_score > m.visitante_score THEN 'L' WHEN m.local_score < m.visitante_score THEN 'V' ELSE 'E' END) = ANY(s.seleccion)
    )::integer AS aciertos
    FROM public.quinielas q JOIN public.selections s ON s.quiniela_id = q.id JOIN public.matches m ON m.id = s.partido_id
    WHERE q.jornada_id = p_jornada_id AND q.status = 'accepted'
    GROUP BY q.id
  )
  SELECT count(*) FILTER (WHERE aciertos = v_first_score), count(*) FILTER (WHERE aciertos = v_second_score)
  INTO v_first_count, v_second_count FROM scores;

  WITH scores AS (
    SELECT q.id, count(*) FILTER (WHERE m.local_score IS NOT NULL AND m.visitante_score IS NOT NULL AND
      (CASE WHEN m.local_score > m.visitante_score THEN 'L' WHEN m.local_score < m.visitante_score THEN 'V' ELSE 'E' END) = ANY(s.seleccion)
    )::integer AS aciertos
    FROM public.quinielas q JOIN public.selections s ON s.quiniela_id = q.id JOIN public.matches m ON m.id = s.partido_id
    WHERE q.jornada_id = p_jornada_id AND q.status = 'accepted'
    GROUP BY q.id
  )
  UPDATE public.quinielas q SET prize_amount = CASE
    WHEN scores.aciertos = v_first_score AND v_first_count > 0 THEN v_first_prize / v_first_count
    WHEN scores.aciertos = v_second_score AND v_second_count > 0 THEN v_second_prize / v_second_count
    ELSE 0
  END
  FROM scores WHERE q.id = scores.id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_quiniela(jsonb, public.quiniela_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_dashboard(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lookup_quiniela(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.distribute_jornada_prizes(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_quiniela(jsonb, public.quiniela_status) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_dashboard(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_quiniela(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_jornada_prizes(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
