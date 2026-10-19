import { createVisitHandler } from './handler.ts'

Deno.serve(createVisitHandler({
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  allowedOrigins: (Deno.env.get('ANALYTICS_ALLOWED_ORIGINS') ?? '').split(',').map((value) => value.trim()).filter(Boolean),
}))
