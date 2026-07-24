-- Security hardening for public RPCs, personal data, audit records and abuse controls.
-- Apply after every earlier migration.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS private.request_rate_limits (
  action text NOT NULL,
  client_hash text NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  PRIMARY KEY (action, client_hash)
);

ALTER TABLE private.request_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.request_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.enforce_request_limit(
  p_action text,
  p_limit integer,
  p_window interval
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_headers jsonb := '{}'::jsonb;
  v_client_address text;
  v_client_hash text;
  v_request_count integer;
BEGIN
  IF p_limit < 1 OR p_window <= interval '0 seconds' THEN
    RAISE EXCEPTION 'Configuracion de limite invalida';
  END IF;

  BEGIN
    v_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_headers := '{}'::jsonb;
  END;

  v_client_address := split_part(
    coalesce(
      nullif(v_headers ->> 'cf-connecting-ip', ''),
      nullif(v_headers ->> 'x-forwarded-for', ''),
      nullif(v_headers ->> 'x-real-ip', ''),
      'unknown'
    ),
    ',',
    1
  );
  v_client_hash := md5('pronosticos-rate-limit-v1|' || trim(v_client_address));

  INSERT INTO private.request_rate_limits AS limits (
    action,
    client_hash,
    window_started_at,
    request_count
  )
  VALUES (p_action, v_client_hash, statement_timestamp(), 1)
  ON CONFLICT (action, client_hash) DO UPDATE
  SET
    request_count = CASE
      WHEN limits.window_started_at <= statement_timestamp() - p_window THEN 1
      ELSE limits.request_count + 1
    END,
    window_started_at = CASE
      WHEN limits.window_started_at <= statement_timestamp() - p_window THEN statement_timestamp()
      ELSE limits.window_started_at
    END
  RETURNING request_count INTO v_request_count;

  IF v_request_count > p_limit THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Demasiados intentos. Espera unos minutos antes de volver a intentar.';
  END IF;

  -- Opportunistic cleanup avoids retaining rate-limit identifiers indefinitely.
  IF random() < 0.02 THEN
    DELETE FROM private.request_rate_limits
    WHERE window_started_at < statement_timestamp() - interval '2 days';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_request_limit(text, integer, interval) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- Remove the original public read policies and make every administrative policy explicit.
DROP POLICY IF EXISTS public_select_quinielas ON public.quinielas;
DROP POLICY IF EXISTS public_select_selections ON public.selections;
DROP POLICY IF EXISTS public_select_combinations ON public.combinations;
DROP POLICY IF EXISTS public_select_jornadas ON public.jornadas;

DROP POLICY IF EXISTS admin_manage_quinielas ON public.quinielas;
CREATE POLICY admin_manage_quinielas ON public.quinielas
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS admin_manage_selections ON public.selections;
CREATE POLICY admin_manage_selections ON public.selections
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS admin_manage_combinations ON public.combinations;
CREATE POLICY admin_manage_combinations ON public.combinations
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS admin_manage_jornadas ON public.jornadas;
CREATE POLICY admin_manage_jornadas ON public.jornadas
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS admin_select_audit_log ON public.audit_log;
CREATE POLICY admin_select_audit_log ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE ALL ON TABLE public.quinielas, public.selections, public.combinations, public.audit_log FROM anon;
REVOKE ALL ON TABLE public.jornadas FROM anon;
REVOKE ALL ON TABLE public.audit_log FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.quinielas,
  public.selections,
  public.combinations,
  public.jornadas,
  public.matches,
  public.tournaments
TO authenticated;
GRANT SELECT ON TABLE public.audit_log TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Prevent accidental exposure of future objects created in the API schema.
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

-- This older administrator-only function remains part of the application, but must not
-- resolve attacker-controlled objects through the API schema.
ALTER FUNCTION public.distribute_jornada_prizes(integer) SET search_path = '';

-- Bound untrusted text so a public request cannot create oversized records.
ALTER TABLE public.quinielas DROP CONSTRAINT IF EXISTS quinielas_nombre_security_check;
ALTER TABLE public.quinielas ADD CONSTRAINT quinielas_nombre_security_check
  CHECK (char_length(trim(nombre)) BETWEEN 2 AND 100 AND nombre !~ '[[:cntrl:]]') NOT VALID;

ALTER TABLE public.quinielas DROP CONSTRAINT IF EXISTS quinielas_payment_reference_security_check;
ALTER TABLE public.quinielas ADD CONSTRAINT quinielas_payment_reference_security_check
  CHECK (char_length(payment_reference) <= 200 AND payment_reference !~ '[[:cntrl:]]') NOT VALID;

ALTER TABLE public.quinielas DROP CONSTRAINT IF EXISTS quinielas_admin_notes_security_check;
ALTER TABLE public.quinielas ADD CONSTRAINT quinielas_admin_notes_security_check
  CHECK (char_length(admin_notes) <= 1000) NOT VALID;

ALTER TABLE public.jornadas DROP CONSTRAINT IF EXISTS jornadas_text_security_check;
ALTER TABLE public.jornadas ADD CONSTRAINT jornadas_text_security_check
  CHECK (char_length(trim(nombre)) BETWEEN 2 AND 100 AND char_length(notes) <= 1000) NOT VALID;

-- Audit only operational changes. Never duplicate names, phones, payment references or notes.
CREATE OR REPLACE FUNCTION public.audit_admin_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
BEGIN
  v_old := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_new := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;

  IF TG_TABLE_NAME = 'quinielas' THEN
    v_old := v_old - ARRAY['nombre', 'celular', 'payment_reference', 'admin_notes'];
    v_new := v_new - ARRAY['nombre', 'celular', 'payment_reference', 'admin_notes'];
  ELSIF TG_TABLE_NAME = 'jornadas' THEN
    v_old := v_old - ARRAY['notes'];
    v_new := v_new - ARRAY['notes'];
  END IF;

  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, details)
  VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    coalesce(NEW.id::text, OLD.id::text),
    jsonb_build_object('old', v_old, 'new', v_new)
  );
  RETURN coalesce(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.audit_admin_change() FROM PUBLIC, anon, authenticated;

-- Scrub personal data copied by the previous audit trigger.
UPDATE public.audit_log
SET details = jsonb_build_object(
  'old',
  CASE
    WHEN jsonb_typeof(details -> 'old') = 'object'
      THEN (details -> 'old') - ARRAY['nombre', 'celular', 'payment_reference', 'admin_notes']
    ELSE details -> 'old'
  END,
  'new',
  CASE
    WHEN jsonb_typeof(details -> 'new') = 'object'
      THEN (details -> 'new') - ARRAY['nombre', 'celular', 'payment_reference', 'admin_notes']
    ELSE details -> 'new'
  END
)
WHERE entity = 'quinielas';

UPDATE public.audit_log
SET details = jsonb_build_object(
  'old',
  CASE WHEN jsonb_typeof(details -> 'old') = 'object' THEN (details -> 'old') - 'notes' ELSE details -> 'old' END,
  'new',
  CASE WHEN jsonb_typeof(details -> 'new') = 'object' THEN (details -> 'new') - 'notes' ELSE details -> 'new' END
)
WHERE entity = 'jornadas';

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at);

-- Transactional public registration with authoritative validation and abuse control.
DROP FUNCTION IF EXISTS public.register_quiniela(jsonb, public.quiniela_status);
CREATE FUNCTION public.register_quiniela(
  p_payload jsonb,
  p_status public.quiniela_status DEFAULT 'pending'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
  v_name text;
  v_phone text;
BEGIN
  IF jsonb_typeof(p_payload) <> 'object'
    OR jsonb_typeof(p_payload -> 'selecciones') <> 'array' THEN
    RAISE EXCEPTION 'La solicitud no tiene un formato valido';
  END IF;

  IF p_status <> 'pending' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede registrar quinielas aceptadas o canceladas';
  END IF;

  IF p_status = 'pending' THEN
    PERFORM private.enforce_request_limit('register_quiniela', 20, interval '1 hour');
  END IF;

  v_name := trim(coalesce(p_payload ->> 'nombre', ''));
  v_phone := regexp_replace(coalesce(p_payload ->> 'celular', ''), '\D', '', 'g');

  IF char_length(v_name) NOT BETWEEN 2 AND 100 OR v_name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'El nombre no es valido';
  END IF;
  IF v_phone !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'El celular debe tener 10 digitos';
  END IF;

  SELECT * INTO v_jornada
  FROM public.jornadas
  WHERE id = coalesce(
    (p_payload ->> 'jornada_id')::integer,
    (
      SELECT id
      FROM public.jornadas
      WHERE (status = 'open' OR (status = 'draft' AND open_at IS NOT NULL AND now() >= open_at))
        AND (close_at IS NULL OR now() < close_at)
      ORDER BY coalesce(open_at, created_at) DESC, id DESC
      LIMIT 1
    )
  );

  IF v_jornada.id IS NULL THEN
    RAISE EXCEPTION 'No hay una jornada disponible';
  END IF;

  v_opened := v_jornada.status = 'open'
    OR (v_jornada.status = 'draft' AND v_jornada.open_at IS NOT NULL AND now() >= v_jornada.open_at);
  v_closed := v_jornada.status IN ('closed', 'finished')
    OR (v_jornada.close_at IS NOT NULL AND now() >= v_jornada.close_at);

  IF p_status = 'pending' AND (NOT v_opened OR v_closed) THEN
    RAISE EXCEPTION 'Los registros de esta jornada ya estan cerrados';
  END IF;

  v_modalidad := (p_payload ->> 'modalidad')::public.modalidad_enum;
  v_max_dobles := CASE WHEN v_modalidad = '5 dobles' THEN 5 ELSE 3 END;
  v_cost := CASE WHEN v_modalidad = '5 dobles' THEN 50 ELSE 30 END;

  SELECT count(*) INTO v_pending_matches
  FROM public.matches
  WHERE jornada_id = v_jornada.id
    AND (p_status <> 'pending' OR local_score IS NULL OR visitante_score IS NULL);

  SELECT
    count(DISTINCT (selection ->> 'partidoId')::integer),
    count(*) FILTER (WHERE jsonb_array_length(selection -> 'seleccion') = 2)
  INTO v_selected_matches, v_dobles
  FROM jsonb_array_elements(p_payload -> 'selecciones') AS selection;

  IF v_pending_matches < 1 OR v_selected_matches <> v_pending_matches THEN
    RAISE EXCEPTION 'La quiniela debe incluir todos los partidos disponibles';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_payload -> 'selecciones') AS selection
    LEFT JOIN public.matches m ON m.id = (selection ->> 'partidoId')::integer
    WHERE m.id IS NULL
      OR m.jornada_id <> v_jornada.id
      OR (p_status = 'pending' AND m.local_score IS NOT NULL AND m.visitante_score IS NOT NULL)
      OR jsonb_typeof(selection -> 'seleccion') <> 'array'
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
    jornada_id,
    folio,
    nombre,
    celular,
    modalidad,
    costo,
    dobles_usados,
    fecha_registro,
    status
  )
  VALUES (
    v_jornada.id,
    'TEMP-' || gen_random_uuid()::text,
    v_name,
    v_phone,
    v_modalidad,
    v_cost,
    v_dobles,
    now(),
    p_status
  )
  RETURNING id INTO v_id;

  v_folio := 'Q' || v_jornada.id::text || '-' || lpad(v_id::text, 6, '0');
  UPDATE public.quinielas SET folio = v_folio WHERE id = v_id;

  FOR v_selection IN
    SELECT * FROM jsonb_array_elements(p_payload -> 'selecciones')
  LOOP
    INSERT INTO public.selections (quiniela_id, partido_id, seleccion)
    VALUES (
      v_id,
      (v_selection ->> 'partidoId')::integer,
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

REVOKE ALL ON FUNCTION public.register_quiniela(jsonb, public.quiniela_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_quiniela(jsonb, public.quiniela_status) TO anon, authenticated;

-- Public dashboard exposes only explicitly approved, non-personal fields.
CREATE OR REPLACE FUNCTION public.get_public_dashboard(p_jornada_id integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH selected_jornada AS (
    SELECT *
    FROM public.jornadas
    WHERE id = coalesce(
      (
        SELECT requested.id
        FROM public.jornadas requested
        WHERE requested.id = p_jornada_id AND requested.status <> 'draft'
      ),
      (
        SELECT id
        FROM public.jornadas
        WHERE status = 'open'
        ORDER BY coalesce(open_at, created_at) DESC, id DESC
        LIMIT 1
      ),
      (
        SELECT id
        FROM public.jornadas
        WHERE status = 'closed'
        ORDER BY id DESC
        LIMIT 1
      )
    )
  ), ranked AS (
    SELECT
      q.id,
      q.folio,
      q.nombre,
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
    GROUP BY q.id
  )
  SELECT jsonb_build_object(
    'jornada',
    jsonb_build_object(
      'id', j.id,
      'tournament_id', j.tournament_id,
      'nombre', j.nombre,
      'numero', j.numero,
      'status', j.status,
      'open_at', j.open_at,
      'close_at', j.close_at,
      'first_prize', j.first_prize,
      'second_prize', j.second_prize,
      'notes', '',
      'created_at', j.created_at,
      'finished_at', j.finished_at
    ),
    'matches',
    coalesce(
      (
        SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id)
        FROM public.matches m
        WHERE m.jornada_id = j.id
      ),
      '[]'::jsonb
    ),
    'stats',
    jsonb_build_object(
      'registered', (SELECT count(*) FROM public.quinielas q WHERE q.jornada_id = j.id),
      'accepted', (SELECT count(*) FROM public.quinielas q WHERE q.jornada_id = j.id AND q.status = 'accepted'),
      'pool', (
        SELECT coalesce(sum(q.costo), 0)
        FROM public.quinielas q
        WHERE q.jornada_id = j.id AND q.status = 'accepted'
      )
    ),
    'ranking',
    coalesce(
      (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.aciertos DESC, r.nombre) FROM ranked r),
      '[]'::jsonb
    )
  )
  FROM selected_jornada j;
$$;

REVOKE ALL ON FUNCTION public.get_public_dashboard(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_dashboard(integer) TO anon, authenticated;

-- The public table remains available immediately, without phone/payment/admin data.
CREATE OR REPLACE FUNCTION public.get_public_approved_quinielas(p_jornada_id integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'jornada_id', q.jornada_id,
        'folio', q.folio,
        'nombre', q.nombre,
        'celular', '',
        'modalidad', q.modalidad,
        'costo', q.costo,
        'dobles_usados', q.dobles_usados,
        'fecha_registro', q.fecha_registro,
        'status', q.status,
        'payment_status', 'pending',
        'payment_reference', '',
        'paid_at', NULL,
        'admin_notes', '',
        'prize_amount', 0,
        'prize_paid_at', NULL,
        'selections',
        coalesce(
          (
            SELECT jsonb_agg(
              jsonb_build_object('partido_id', s.partido_id, 'seleccion', s.seleccion)
              ORDER BY s.id
            )
            FROM public.selections s
            WHERE s.quiniela_id = q.id
          ),
          '[]'::jsonb
        ),
        'combinations', '[]'::jsonb
      )
      ORDER BY q.id
    ),
    '[]'::jsonb
  )
  FROM public.quinielas q
  WHERE q.status = 'accepted'
    AND (p_jornada_id IS NULL OR q.jornada_id = p_jornada_id);
$$;

REVOKE ALL ON FUNCTION public.get_public_approved_quinielas(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_approved_quinielas(integer) TO anon, authenticated;

-- The existing lookup accepts any one exact factor, with rate limiting and a minimized response.
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
