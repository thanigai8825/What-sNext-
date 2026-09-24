import type { SupabaseClient } from '@supabase/supabase-js'

export const supabaseUrl: string | undefined = import.meta.env.VITE_SUPABASE_URL || undefined
export const supabaseAnonKey: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY || undefined
export const supabaseConfigured = !!(supabaseUrl && supabaseAnonKey)

let client: Promise<SupabaseClient | null> | null = null

/** Lazily load Supabase so the local-first app never pays for it when it isn't configured. */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!supabaseConfigured) return Promise.resolve(null)
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(supabaseUrl!, supabaseAnonKey!, { auth: { persistSession: true, autoRefreshToken: true } }),
  )
  return client
}
