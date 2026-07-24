# Seguridad y despliegue

## Controles incluidos

- Las tablas con nombres, celulares, pagos, selecciones y auditoría no tienen lectura anónima directa.
- Las consultas públicas de datos sensibles pasan por funciones con una respuesta mínima y explícita.
- La consulta acepta un folio, celular completo o nombre exacto; limita los intentos, muestra el nombre solicitado y enmascara el teléfono.
- El registro público valida los datos en la base de datos y limita el abuso por origen.
- El historial administrativo ya no duplica nombres, celulares, referencias de pago ni notas.
- Las sesiones del administrador se conservan únicamente durante la sesión de la pestaña.
- Los archivos CSV neutralizan fórmulas y los enlaces a terceros no incluyen datos personales.
- La política CSP y `public/_headers` reducen XSS, clickjacking, filtración de referentes y permisos innecesarios.

## Despliegue obligatorio

La aplicación no queda protegida en el entorno real hasta completar estos pasos:

1. Haz un respaldo cifrado de la base de datos y limita su acceso al personal autorizado.
2. Ejecuta todas las migraciones en orden y, al final, `supabase/migrations/20260724000000_security_hardening.sql`.
3. Revisa el Security Advisor de Supabase y confirma que no existan tablas sensibles sin RLS ni funciones nuevas ejecutables por `PUBLIC`.
4. En Supabase Auth, activa protección contra contraseñas filtradas y límites de intentos.
5. Usa una contraseña única y larga para cada administrador; elimina o bloquea inmediatamente las cuentas que ya no deban tener acceso.
6. Publica exclusivamente por HTTPS. Configura en el proveedor de hosting las cabeceras de `public/_headers`; si el proveedor no admite ese archivo, copia las mismas cabeceras en su configuración.
7. Verifica después del despliegue que las páginas públicas no devuelvan celulares, referencias de pago, notas administrativas ni combinaciones privadas.
8. Conserva los respaldos, exportaciones CSV/PDF y archivos de soporte en almacenamiento cifrado, con acceso restringido y una política de eliminación.

## Secretos

`VITE_SUPABASE_PUBLISHABLE_KEY` es una llave pública diseñada para el navegador y su seguridad depende de RLS y de las funciones de base de datos. Nunca coloques una llave `service_role`, contraseña, token privado o llave de cifrado en:

- variables cuyo nombre empiece con `VITE_`;
- archivos versionados;
- código del navegador;
- mensajes de WhatsApp, URLs, registros o capturas de pantalla.

Los secretos de servidor deben almacenarse en el gestor de secretos del proveedor y rotarse si se sospecha una exposición.

## Cifrado y datos personales

La conexión a Supabase debe permanecer en HTTPS/TLS. El cifrado de discos y respaldos depende de la configuración del proveedor. El cifrado de campos dentro de la aplicación requiere un servicio de backend o KMS que mantenga la llave fuera del navegador; no debe implementarse colocando una llave simétrica en React.

Mientras los administradores necesiten buscar y gestionar los registros, la base de datos verá los valores autorizados en texto lógico. La protección aplicada se basa en cifrado de transporte/infraestructura, RLS, privilegio mínimo, respuestas enmascaradas y acceso administrativo autenticado.

## Verificación antes de cada publicación

```bash
npm audit
npm run lint
npm run typecheck
npm run test
npm run build
```

Repite además una prueba pública sin iniciar sesión y una prueba administrativa; si ya existe el flujo de segundo factor, valida también el reto MFA y la recuperación.

## Riesgo pendiente: MFA

La pantalla actual solo solicita correo y contraseña. Exigir AAL2/MFA en la base de datos sin agregar el flujo de inscripción, reto y recuperación impediría el acceso administrativo y cambiaría la funcionalidad solicitada. Por ello esta migración no simula ni declara MFA como activo. Antes de exigirlo se debe implementar el segundo paso de autenticación, probar una cuenta de recuperación y hacer que `public.is_admin()` requiera `aal2`.

## Incidentes

Si se filtra información o una credencial:

1. bloquea el acceso afectado y rota las credenciales;
2. conserva evidencias sin copiar más datos personales de los necesarios;
3. revisa Auth, auditoría, despliegues y accesos a Supabase;
4. determina el alcance y elimina exportaciones o enlaces compartidos;
5. notifica a las personas y autoridades que correspondan según la legislación aplicable.
