-- Allow any number of public quiniela registrations from the same network.
-- Other public actions, such as private lookups, remain rate limited.
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

  IF p_action = 'register_quiniela' THEN
    RETURN;
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

  IF random() < 0.02 THEN
    DELETE FROM private.request_rate_limits
    WHERE window_started_at < statement_timestamp() - interval '2 days';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_request_limit(text, integer, interval) FROM PUBLIC, anon, authenticated;
