import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// NEW Supabase project only. Values come from .env — never hard-code a key here,
// never a service_role key, never an account/database password.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const isSupabaseConfigured =
  !!SUPABASE_URL &&
  !!SUPABASE_ANON_KEY &&
  SUPABASE_ANON_KEY !== 'PASTE_YOUR_PUBLISHABLE_KEY_HERE' &&
  !SUPABASE_ANON_KEY.startsWith('sb_secret_');

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL ?? 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY ?? 'placeholder',
);
