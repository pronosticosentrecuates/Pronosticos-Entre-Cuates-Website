-- Private: run only in Supabase SQL Editor, after installing the IP migration.
SELECT visited_at AT TIME ZONE 'America/Mexico_City' AS fecha_mexico,
       host(ip_address) AS ip, visitor_id AS navegador
FROM public.site_visits
ORDER BY visited_at DESC
LIMIT 500;

SELECT host(ip_address) AS ip, count(*) AS visitas,
       count(DISTINCT visitor_id) AS navegadores_estimados,
       max(visited_at) AT TIME ZONE 'America/Mexico_City' AS ultima_visita
FROM public.site_visits
WHERE ip_address IS NOT NULL AND visited_at >= now() - interval '30 days'
GROUP BY ip_address ORDER BY visitas DESC LIMIT 500;
