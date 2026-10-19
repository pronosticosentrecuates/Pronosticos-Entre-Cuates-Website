import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { invoke, getSupabaseMock } = vi.hoisted(() => ({ invoke: vi.fn(), getSupabaseMock: vi.fn() }))
vi.mock('../../utils/supabase', () => ({ getSupabase: getSupabaseMock }))
import { recordVisit } from './analytics'

describe('private visit recording', () => {
  beforeEach(() => {
    vi.stubEnv('PROD', true)
    invoke.mockReset().mockResolvedValue({ error: null })
    getSupabaseMock.mockReset().mockReturnValue({ functions: { invoke } })
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
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(invoke.mock.calls[0]).toEqual(['record-visit', { body: { visitor_id: expect.any(String) } }])
    expect(invoke.mock.calls[1]).toEqual(invoke.mock.calls[0])
  })

  it('does not count development visits', async () => {
    vi.stubEnv('PROD', false)
    await recordVisit()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('does not interrupt the app when storage is blocked', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Blocked') } })
    await expect(recordVisit()).resolves.toBeUndefined()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('does not interrupt the app when the network fails', async () => {
    invoke.mockRejectedValue(new Error('Offline'))
    await expect(recordVisit()).resolves.toBeUndefined()
  })
})
