// A request arriving during a load requires a fresh pass after that load.
// All callers await the drain, including that trailing pass.
export function createRefreshQueue(refresh: () => Promise<void>) {
  let running: Promise<void> | null = null
  let pending = false
  return () => {
    pending = true
    if (!running) {
      running = Promise.resolve().then(async () => {
        try {
          while (pending) {
            pending = false
            await refresh()
          }
        } finally {
          running = null
        }
      })
    }
    return running
  }
}
