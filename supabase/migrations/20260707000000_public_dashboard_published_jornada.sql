CREATE OR REPLACE FUNCTION public.get_public_dashboard(p_jornada_id integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH selected_jornada AS (
    SELECT * FROM public.jornadas WHERE id = coalesce(
      (SELECT requested.id FROM public.jornadas requested WHERE requested.id = p_jornada_id AND requested.status <> 'draft'),
      (
        SELECT id FROM public.jornadas
        WHERE status = 'open'
          AND (close_at IS NULL OR now() < close_at)
        ORDER BY coalesce(open_at, created_at) DESC, id DESC
        LIMIT 1
      ),
      (SELECT id FROM public.jornadas WHERE status = 'closed' ORDER BY id DESC LIMIT 1),
      (SELECT id FROM public.jornadas WHERE status = 'finished' ORDER BY id DESC LIMIT 1)
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

REVOKE ALL ON FUNCTION public.get_public_dashboard(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_dashboard(integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
