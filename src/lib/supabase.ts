import { createClient } from '@supabase/supabase-js'

// Both values are PUBLIC by design: they end up in the browser bundle.
// Data is protected by Row Level Security in the database, not by hiding these.
// NEVER put the service_role / secret key here.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey)

if (supabaseKey?.startsWith('sb_secret_') || supabaseKey?.includes('service_role')) {
  throw new Error('A SECRET Supabase key was configured. Use the publishable (anon) key only.')
}

export const supabase = createClient(supabaseUrl ?? 'http://localhost', supabaseKey ?? 'missing-key', {
  auth: {
    persistSession: true,      // stay signed in on the phone between visits
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// Lightweight reachability check used by the setup page.
export async function checkSupabaseConnection(): Promise<{ ok: boolean; message: string }> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: 'VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY is missing.' }
  }
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: { apikey: supabaseKey! },
    })
    if (res.ok) return { ok: true, message: 'Supabase is reachable.' }
    if (res.status === 401) return { ok: false, message: 'Supabase rejected the key (401). Check the publishable key.' }
    return { ok: false, message: `Supabase answered with HTTP ${res.status}.` }
  } catch {
    return { ok: false, message: 'Could not reach Supabase. Check the project URL and your connection.' }
  }
}
