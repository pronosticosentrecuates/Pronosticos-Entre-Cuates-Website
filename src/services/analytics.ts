import { getSupabase } from '../../utils/supabase'

const VISITOR_KEY = 'pec-analytics-visitor'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Called once per page load, outside React effects. Analytics must never block the app.
export async function recordVisit(): Promise<void> {
  if (!import.meta.env.PROD) return

  try {
    const supabase = getSupabase()
    if (!supabase) return
    let visitorId = localStorage.getItem(VISITOR_KEY)
    if (!visitorId || !UUID.test(visitorId)) {
      visitorId = crypto.randomUUID()
      localStorage.setItem(VISITOR_KEY, visitorId)
    }
    await supabase.rpc('record_site_visit', { p_visitor_id: visitorId })
  } catch {
    // Storage restrictions or connectivity failures do not affect registration.
  }
}
