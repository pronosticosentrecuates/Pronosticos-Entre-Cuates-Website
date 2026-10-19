import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc, getSupabaseMock } = vi.hoisted(() => ({ rpc: vi.fn(), getSupabaseMock: vi.fn() }))
vi.mock('../../utils/supabase', () => ({ getSupabase: getSupabaseMock }))
import { recordVisit } from './analytics'

describe('private visit recording', () => {
  beforeEach(() => {
    vi.stubEnv('PROD', true)
    rpc.mockReset().mockResolvedValue({ error: null })
    getSupabaseMock.mockReset().mockReturnValue({ rpc })
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('reuses a browser identifier and sends no participant or URL data', async () => {
    await recordVisit()
    await recordVisit()
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc.mock.calls[0]).toEqual(['record_site_visit', { p_visitor_id: expect.any(String) }])
    expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0])
  })

  it('does not count development visits', async () => {
    vi.stubEnv('PROD', false)
    await recordVisit()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('does not interrupt the app when storage is blocked', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Blocked') } })
    await expect(recordVisit()).resolves.toBeUndefined()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('does not interrupt the app when the network fails', async () => {
    rpc.mockRejectedValue(new Error('Offline'))
    await expect(recordVisit()).resolves.toBeUndefined()
  })
})
