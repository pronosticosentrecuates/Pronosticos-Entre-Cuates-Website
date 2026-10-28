import { describe, expect, it, vi } from 'vitest'
import { createRefreshQueue } from './refreshQueue'

describe('refresh queue', () => {
  it('groups bursts and waits for changes arriving during a load', async () => {
    let release!: () => void
    const firstLoad = new Promise<void>((resolve) => { release = resolve })
    const load = vi.fn().mockImplementationOnce(() => firstLoad).mockResolvedValue(undefined)
    const refresh = createRefreshQueue(load)
    const first = refresh()
    expect(refresh()).toBe(first)
    await Promise.resolve()
    expect(load).toHaveBeenCalledTimes(1)
    const duringLoad = refresh()
    refresh()
    expect(load).toHaveBeenCalledTimes(1)
    release()
    await duringLoad
    expect(load).toHaveBeenCalledTimes(2)
    await refresh()
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('allows retry after a failed refresh', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    const refresh = createRefreshQueue(load)
    await expect(refresh()).rejects.toThrow('offline')
    await refresh()
    expect(load).toHaveBeenCalledTimes(2)
  })
})
