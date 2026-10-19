import { describe, expect, it, vi } from 'vitest'
import { createVisitHandler } from './handler'

const visitor = '12345678-1234-4234-8234-123456789abc'
const config = { supabaseUrl: 'https://example.supabase.co', serviceKey: 'server-only', allowedOrigins: ['https://example.com'] }
function request(ip?: string, body = JSON.stringify({ visitor_id: visitor, ip_address: '1.1.1.1' })) {
  return new Request('https://example.supabase.co/functions/v1/record-visit', {
    method: 'POST', body,
    headers: { origin: 'https://example.com', ...(ip ? { 'x-forwarded-for': ip } : {}) },
  })
}

describe('private IP collection', () => {
  it.each(['203.0.113.5', '2001:db8::1'])('records gateway IPv4/IPv6 and ignores body IP: %s', async (ip) => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }))
    const response = await createVisitHandler(config, send)(request(`${ip}, 10.0.0.1`))
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(JSON.parse(send.mock.calls[0][1]!.body as string)).toEqual({ p_visitor_id: visitor, p_ip_address: ip })
  })
  it.each([undefined, 'invalid', '203.0.113.0/24'])('still counts a visit without a valid IP: %s', async (ip) => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }))
    await createVisitHandler(config, send)(request(ip))
    expect(JSON.parse(send.mock.calls[0][1]!.body as string).p_ip_address).toBeNull()
  })
  it('rejects invalid payloads and oversized bodies without calling the database', async () => {
    const send = vi.fn<typeof fetch>()
    const handler = createVisitHandler(config, send)
    expect((await handler(request(undefined, '{}'))).status).toBe(400)
    expect((await handler(request(undefined, '{'))).status).toBe(400)
    expect((await handler(request(undefined, 'x'.repeat(1025)))).status).toBe(413)
    expect(send).not.toHaveBeenCalled()
  })
  it('handles allowed preflight and refuses other origins', async () => {
    const send = vi.fn<typeof fetch>()
    const handler = createVisitHandler(config, send)
    const preflight = await handler(new Request('https://example.com', { method: 'OPTIONS', headers: { origin: 'https://example.com' } }))
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://example.com')
    expect((await handler(new Request('https://example.com', { headers: { origin: 'https://other.example' } }))).status).toBe(403)
    expect(send).not.toHaveBeenCalled()
  })
  it('does not expose database errors or secrets', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response('sensitive error', { status: 500 }))
    const response = await createVisitHandler(config, send)(request())
    expect(response.status).toBe(503)
    expect(await response.text()).toBe('')
  })
})
