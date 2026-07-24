# Quinielas entre Cuates

Aplicación React + Vite para registrar quinielas, administrar partidos y mostrar resultados.

## Desarrollo

1. Copia `.env.example` a `.env.local` y agrega la URL y llave publicable de Supabase.
2. Ejecuta `supabase/schema.sql` en el SQL Editor de Supabase.
3. Ejecuta todas las migraciones de `supabase/migrations/` en orden. La última migración, `20260724000000_security_hardening.sql`, es obligatoria: restringe los datos personales, endurece las RPC públicas, agrega límites antiabuso y depura el historial de auditoría.
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

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Las quinielas públicas se registran mediante la función transaccional `register_quiniela`. Las operaciones de administración requieren una sesión de Supabase Auth con `app_metadata.role = "admin"`.

Antes de publicar, completa también la lista de despliegue de [SECURITY.md](SECURITY.md). Ningún secreto o llave `service_role` debe usar el prefijo `VITE_` ni incluirse en el navegador.
