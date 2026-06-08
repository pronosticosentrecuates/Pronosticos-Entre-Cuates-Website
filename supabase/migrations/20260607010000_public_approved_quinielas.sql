CREATE OR REPLACE FUNCTION public.get_public_approved_quinielas(p_jornada_id integer DEFAULT NULL)
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
      'admin_notes', '',
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

REVOKE ALL ON FUNCTION public.get_public_approved_quinielas(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_approved_quinielas(integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
