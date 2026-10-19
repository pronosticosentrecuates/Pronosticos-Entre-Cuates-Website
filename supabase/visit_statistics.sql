-- Run in Supabase > SQL Editor. Never expose a service-role key in the website.
-- Period boundaries use Mexico City time. Week starts on Monday.
WITH periods AS (
  SELECT 'Hoy' AS periodo, date_trunc('day', now() AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'America/Mexico_City' AS desde, 1 AS orden
  UNION ALL
  SELECT 'Esta semana', date_trunc('week', now() AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'America/Mexico_City', 2
  UNION ALL
  SELECT 'Este mes', date_trunc('month', now() AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'America/Mexico_City', 3
  UNION ALL
  SELECT 'Total', '-infinity'::timestamptz, 4
)
SELECT p.periodo, count(v.id) AS visitas, count(DISTINCT v.visitor_id) AS visitantes_estimados
FROM periods p LEFT JOIN public.site_visits v ON v.visited_at >= p.desde
GROUP BY p.periodo, p.orden ORDER BY p.orden;

-- Daily history, including days with no visits.
WITH days AS (
  SELECT generate_series(
    (now() AT TIME ZONE 'America/Mexico_City')::date - 29,
    (now() AT TIME ZONE 'America/Mexico_City')::date,
    interval '1 day'
  )::date AS dia
)
SELECT d.dia, count(v.id) AS visitas, count(DISTINCT v.visitor_id) AS visitantes_estimados
FROM days d LEFT JOIN public.site_visits v
  ON v.visited_at >= (d.dia::timestamp AT TIME ZONE 'America/Mexico_City')
 AND v.visited_at < ((d.dia + 1)::timestamp AT TIME ZONE 'America/Mexico_City')
GROUP BY d.dia ORDER BY d.dia DESC;
