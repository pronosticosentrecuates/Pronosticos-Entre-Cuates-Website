# Estadísticas privadas de visitas

> Sistema anterior, desactivado en la web. La integración actual utiliza la etiqueta directa de Google Analytics `G-3TBTEDP9J8` (ver README). No ejecutes estos pasos para activar Google Analytics. Se conserva esta documentación como referencia de la implementación anterior; los datos que ya existan en Supabase no se eliminan.

## Activación

1. En el SQL Editor del proyecto Supabase, ejecuta `migrations/20261019000000_private_visit_analytics.sql` una sola vez.
2. Ejecuta también `migrations/20261019010000_private_visit_ips.sql` una sola vez para habilitar las IP.
3. Configura y despliega la función `record-visit` (instrucciones abajo).
4. Publica la nueva versión de la página (`npm run build` y tu despliegue habitual).
5. Abre la página publicada y ejecuta `visit_statistics.sql` o `visit_ip_statistics.sql` en el SQL Editor. Puedes guardar esas consultas en tu cuenta para consultarlas después.

Solo quienes tengan acceso administrativo al proyecto Supabase o sus credenciales privilegiadas pueden consultar estas estadísticas. Los visitantes y los administradores que ingresan desde la página no tienen acceso, incluso si intentan consultar la API directamente. No existe un panel público de estadísticas.

## Cómo se cuentan

- Una visita al cargar la página, con un máximo de una visita por navegador cada 30 minutos. Recargar o abrir varias pestañas durante ese periodo no suma visitas.
- Visitantes estimados: identificadores aleatorios persistidos en el navegador. Borrar almacenamiento o cambiar de dispositivo puede contar a alguien nuevamente.
- Se muestran hoy, semana actual (desde el lunes), mes actual, total y últimos 30 días, con horario de Ciudad de México.
- Se registra la IP observada por el servidor (IPv4 o IPv6). No se registran nombres, teléfonos, URLs ni información de las quinielas. Tampoco se vinculan visitas con registros de participantes.
- El desarrollo local no cuenta. Una pestaña que permanece abierta no genera visitas adicionales automáticamente. Las visitas del desarrollador a producción sí cuentan.
- Si el navegador bloquea el almacenamiento o falla la conexión, la página sigue funcionando y esa visita puede no registrarse.
- Los datos empiezan al activar y publicar. Son orientativos: los bloqueadores pueden reducirlos y un bot que cambie de identificador puede aumentarlos.

## Verificación de permisos

Ejecuta `verify_visit_analytics.sql` en el SQL Editor después de instalar la migración. Comprueba permisos de lectura y escritura, RLS y deduplicación; los datos de prueba se revierten al terminar.

## Desplegar la captura de IP

Desde la carpeta del proyecto, con tu cuenta de Supabase autenticada, sustituye los valores de ejemplo por tu proyecto y el origen exacto de tu página (sin barra final):

```powershell
npx supabase login
npx supabase secrets set ANALYTICS_ALLOWED_ORIGINS=https://tu-dominio.com --project-ref TU_PROJECT_REF
npx supabase functions deploy record-visit --no-verify-jwt --project-ref TU_PROJECT_REF
```

Si utilizas varios dominios, sepáralos con comas. La función usa `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` del entorno del servidor; nunca copies esta llave al navegador. `--no-verify-jwt` permite registrar visitantes sin sesión. El endpoint no devuelve estadísticas ni IP. La lista de orígenes limita navegadores, pero no autentica a clientes externos ni sustituye protección contra bots.

La IP se lee de `X-Forwarded-For` en el gateway alojado de Supabase, siguiendo [el ejemplo de Supabase](https://github.com/orgs/supabase/discussions/7884). No se acepta una IP enviada en el cuerpo del navegador. Si falta o es inválida, la visita queda con IP nula. Verifica con una visita real tras el despliegue; si agregas proxies propios, revisa su tratamiento de cabeceras. No uses este dato para autenticar, identificar inequívocamente o autorizar personas.

La web muestra un aviso breve de esta recopilación en el pie de página. Las IP permanecen guardadas hasta que las elimines; para retirarlas sin perder los conteos, puedes ejecutar `UPDATE public.site_visits SET ip_address = NULL WHERE visited_at < now() - interval '30 days';` en SQL Editor. Esto es una limpieza manual, no una tarea automática.

Las visitas antiguas no permiten recuperar IP retroactivamente. La IP puede ser compartida, dinámica o corresponder a una VPN.
