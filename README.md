# Quinielas entre Cuates

Aplicación React + Vite para registrar quinielas, administrar partidos y mostrar resultados.

## Desarrollo

1. Copia `.env.example` a `.env.local` y agrega la URL y llave publicable de Supabase.
2. Ejecuta `supabase/schema.sql` en el SQL Editor de Supabase.
3. Ejecuta todas las migraciones de `supabase/migrations/` en orden. La migración `20260724000000_security_hardening.sql` restringe los datos personales, endurece las RPC públicas, agrega límites antiabuso y depura el historial de auditoría. La migración más reciente, `20260727000000_match_sort_order.sql`, habilita el orden personalizable de los partidos.
4. Crea un usuario en Supabase Auth y asígnale el rol administrativo desde el SQL Editor:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where email = 'tu-admin@ejemplo.com';
```

5. Inicia la aplicación:

```bash
npm install
npm run dev
```

## Verificación

Las visitas se miden con la etiqueta directa de Google Analytics `G-3TBTEDP9J8`, instalada en el head de `index.html`. Esta sustituye al contenedor anterior de Tag Manager para evitar mediciones duplicadas. Consulta las estadísticas desde tu cuenta de Google Analytics; no se muestran en el panel de la web. El sitio ya no invoca el registro de visitas/IP de Supabase.

La CSP en `index.html` y `public/_headers` permite cargar Google Analytics. El script inicial está autorizado mediante SHA-256: si modificas su contenido, recalcula el hash en ambos archivos. Después de publicar la web, comprueba la etiqueta con Tag Assistant y el informe de tiempo real de Analytics. No envíes nombres, teléfonos ni datos de quinielas como parámetros de Analytics.

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Las quinielas públicas se registran mediante la función transaccional `register_quiniela`. Las operaciones de administración requieren una sesión de Supabase Auth con `app_metadata.role = "admin"`.

Antes de publicar, completa también la lista de despliegue de [SECURITY.md](SECURITY.md). Ningún secreto o llave `service_role` debe usar el prefijo `VITE_` ni incluirse en el navegador.
