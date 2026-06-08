import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
	if (cachedClient) return cachedClient

	const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
	const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

	if (!supabaseUrl || !supabaseKey) {
		// No env configured — return null so the app can start without DB
		return null
	}

	cachedClient = createClient(supabaseUrl, supabaseKey)
	return cachedClient
}
