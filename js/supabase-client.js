// Creates one shared Supabase client for all pages.
// Requires: supabase-js CDN loaded before this file, and config.js loaded first.
if (typeof SUPABASE_URL === "undefined" || typeof SUPABASE_PUBLISHABLE_KEY === "undefined") {
  throw new Error("config.js is missing. Load js/config.js before js/supabase-client.js");
}
if (!SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY === "PASTE_YOUR_PUBLISHABLE_KEY_HERE") {
  console.warn("Supabase publishable key is not set yet. Edit js/config.js and paste your publishable key.");
}
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
