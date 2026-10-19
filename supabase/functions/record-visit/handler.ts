import { isIP } from 'node:net'

type Config = { supabaseUrl: string; serviceKey: string; allowedOrigins: string[] }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function createVisitHandler(config: Config, send: typeof fetch = fetch) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin') ?? ''
    if (!config.allowedOrigins.includes(origin)) return new Response(null, { status: 403 })
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, traceparent, tracestate, baggage',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return new Response(null, { status: 405, headers })
    if (!config.supabaseUrl || !config.serviceKey) return new Response(null, { status: 503, headers })
    try {
      // Bound request size without trusting Content-Length.
      const reader = request.body?.getReader()
      if (!reader) return new Response(null, { status: 400, headers })
      let body = ''
      let size = 0
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 1024) {
          await reader.cancel()
          return new Response(null, { status: 413, headers })
        }
        body += decoder.decode(value, { stream: true })
      }
      body += decoder.decode()
      let payload: unknown
      try { payload = JSON.parse(body) } catch { return new Response(null, { status: 400, headers }) }
      const visitor = payload && typeof payload === 'object' && 'visitor_id' in payload ? payload.visitor_id : null
      if (typeof visitor !== 'string' || !UUID.test(visitor)) return new Response(null, { status: 400, headers })

      // Hosted Supabase forwards the client IP here. Never accept an IP in the body.
      // This is an analytics observation, not proof of identity or an authorization signal.
      const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
      const ip = isIP(forwarded) ? forwarded : null
      const result = await send(`${config.supabaseUrl}/rest/v1/rpc/record_site_visit_with_ip`, {
        method: 'POST',
        headers: {
          apikey: config.serviceKey,
          Authorization: `Bearer ${config.serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_visitor_id: visitor, p_ip_address: ip }),
        signal: AbortSignal.timeout(5000),
      })
      // No IP, credentials or database error details are returned to the browser.
      return new Response(null, { status: result.ok ? 204 : 503, headers })
    } catch {
      return new Response(null, { status: 503, headers })
    }
  }
}
