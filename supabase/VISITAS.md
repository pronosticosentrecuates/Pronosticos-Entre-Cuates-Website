# Estadísticas privadas de visitas

## Activación

1. En el SQL Editor del proyecto Supabase, ejecuta `migrations/20261019000000_private_visit_analytics.sql` una sola vez.
2. Publica la nueva versión de la página (`npm run build` y tu despliegue habitual).
3. Abre la página publicada y ejecuta `visit_statistics.sql` en el SQL Editor. Puedes guardar esa consulta en tu cuenta para consultarla después.

Solo quienes tengan acceso administrativo al proyecto Supabase o sus credenciales privilegiadas pueden consultar estas estadísticas. Los visitantes y los administradores que ingresan desde la página no tienen acceso, incluso si intentan consultar la API directamente. No existe un panel público de estadísticas.

## Cómo se cuentan

- Una visita al cargar la página, con un máximo de una visita por navegador cada 30 minutos. Recargar o abrir varias pestañas durante ese periodo no suma visitas.
- Visitantes estimados: identificadores aleatorios persistidos en el navegador. Borrar almacenamiento o cambiar de dispositivo puede contar a alguien nuevamente.
- Se muestran hoy, semana actual (desde el lunes), mes actual, total y últimos 30 días, con horario de Ciudad de México.
- No se registran nombres, teléfonos, URLs, IP ni información de las quinielas. Tampoco se vinculan visitas con registros de participantes.
- El desarrollo local no cuenta. Una pestaña que permanece abierta no genera visitas adicionales automáticamente. Las visitas del desarrollador a producción sí cuentan.
- Si el navegador bloquea el almacenamiento o falla la conexión, la página sigue funcionando y esa visita puede no registrarse.
- Los datos empiezan al activar y publicar. Son orientativos: los bloqueadores pueden reducirlos y un bot que cambie de identificador puede aumentarlos.

## Verificación de permisos

Ejecuta `verify_visit_analytics.sql` en el SQL Editor después de instalar la migración. Comprueba permisos de lectura y escritura, RLS y deduplicación; los datos de prueba se revierten al terminar.
