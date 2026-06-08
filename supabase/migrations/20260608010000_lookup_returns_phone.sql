CREATE OR REPLACE FUNCTION public.lookup_quiniela(p_folio text, p_phone text, p_nombre text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id, 'jornada_id', q.jornada_id, 'folio', q.folio, 'nombre', q.nombre, 'celular', q.celular, 'modalidad', q.modalidad, 'costo', q.costo,
      'dobles_usados', q.dobles_usados, 'fecha_registro', q.fecha_registro, 'status', q.status,
      'payment_status', q.payment_status, 'payment_reference', q.payment_reference, 'prize_amount', q.prize_amount,
      'prize_paid_at', q.prize_paid_at, 'jornada', to_jsonb(j),
      'selections', coalesce((SELECT jsonb_agg(jsonb_build_object('partido_id', s.partido_id, 'seleccion', s.seleccion) ORDER BY s.id) FROM public.selections s WHERE s.quiniela_id = q.id), '[]'::jsonb)
    )
    ORDER BY q.id
  ), '[]'::jsonb)
  FROM public.quinielas q JOIN public.jornadas j ON j.id = q.jornada_id
  WHERE (
    (trim(coalesce(p_folio, '')) <> '' AND upper(q.folio) = upper(trim(p_folio)))
    OR (length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) = 10 AND q.celular = regexp_replace(p_phone, '\D', '', 'g'))
    OR (
      length(trim(coalesce(p_nombre, ''))) >= 2
      AND lower(regexp_replace(trim(q.nombre), '[[:space:]]+', ' ', 'g')) = lower(regexp_replace(trim(p_nombre), '[[:space:]]+', ' ', 'g'))
    )
  );
$$;

REVOKE ALL ON FUNCTION public.lookup_quiniela(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_quiniela(text, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
