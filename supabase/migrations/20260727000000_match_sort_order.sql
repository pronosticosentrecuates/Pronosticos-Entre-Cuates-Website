ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_sort_order_check;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_sort_order_check CHECK (sort_order >= 0);

WITH ordered_matches AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY jornada_id ORDER BY id)::integer AS next_sort_order
  FROM public.matches
)
UPDATE public.matches AS match
SET sort_order = ordered_matches.next_sort_order
FROM ordered_matches
WHERE ordered_matches.id = match.id
  AND match.sort_order = 0;

CREATE INDEX IF NOT EXISTS idx_matches_jornada_sort_order
  ON public.matches (jornada_id, sort_order, id);

CREATE OR REPLACE FUNCTION public.reorder_matches(
  p_jornada_id integer,
  p_match_ids integer[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing_ids integer[];
  v_requested_ids integer[];
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators can reorder matches.'
      USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(match.id ORDER BY match.id), '{}'::integer[])
  INTO v_existing_ids
  FROM public.matches AS match
  WHERE match.jornada_id = p_jornada_id;

  SELECT coalesce(array_agg(requested.match_id ORDER BY requested.match_id), '{}'::integer[])
  INTO v_requested_ids
  FROM unnest(coalesce(p_match_ids, '{}'::integer[])) AS requested(match_id);

  IF v_existing_ids IS DISTINCT FROM v_requested_ids THEN
    RAISE EXCEPTION 'The requested order must contain every match in the jornada exactly once.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.matches AS match
  SET sort_order = requested.position::integer
  FROM unnest(p_match_ids) WITH ORDINALITY AS requested(match_id, position)
  WHERE match.id = requested.match_id
    AND match.jornada_id = p_jornada_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_matches(integer, integer[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reorder_matches(integer, integer[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.reorder_matches(integer, integer[]) TO authenticated;

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
        SELECT jsonb_agg(to_jsonb(m) ORDER BY m.sort_order, m.id)
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
