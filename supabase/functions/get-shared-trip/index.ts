// Supabase Edge Function: get-shared-trip
// 
// This function validates a raw share token by:
// 1. Hashing it with SHA-256
// 2. Looking up the hash in trip_share_links (via service role)
// 3. Checking revocation and expiry
// 4. Returning only public-safe trip data
//
// Security guarantees:
// - The service role key never leaves this server environment
// - Raw tokens are never stored in the database
// - Anonymous users cannot query trip_share_links directly
// - Cross-trip access is impossible: the token is cryptographically bound to the trip

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  try {
    const body = await req.json()
    const rawToken: string = body?.token

    if (!rawToken || typeof rawToken !== "string" || rawToken.length !== 64) {
      return new Response(JSON.stringify({ error: "Invalid token format" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Hash the raw token with SHA-256
    const encoder = new TextEncoder()
    const data = encoder.encode(rawToken)
    const hashBuffer = await crypto.subtle.digest("SHA-256", data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const tokenHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("")

    // Use service role to bypass RLS for token validation
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Look up the share link by hash
    const { data: shareLink, error: linkError } = await supabaseAdmin
      .from("trip_share_links")
      .select("id, trip_id, revoked_at, expires_at, created_at")
      .eq("token_hash", tokenHash)
      .maybeSingle()

    if (linkError || !shareLink) {
      return new Response(JSON.stringify({ error: "Share link not found or invalid" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Check revocation
    if (shareLink.revoked_at) {
      return new Response(JSON.stringify({ error: "This share link has been revoked" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Check expiry
    if (shareLink.expires_at && new Date(shareLink.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "This share link has expired" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const tripId = shareLink.trip_id

    // Fetch all public trip data using service role
    // Only fields safe to expose to the public
    const [
      { data: trip },
      { data: members },
      { data: contributions },
      { data: expenses },
      { data: allocations },
      { data: fundTransactions },
    ] = await Promise.all([
      supabaseAdmin.from("trips").select(
        "id, name, description, location, start_date, end_date, currency, status"
      ).eq("id", tripId).single(),

      supabaseAdmin.from("trip_members").select(
        "id, name, status"
      ).eq("trip_id", tripId),

      supabaseAdmin.from("contributions").select(
        "id, member_id, amount, occurred_at, payment_method, note, status"
      ).eq("trip_id", tripId).order("occurred_at", { ascending: false }),

      supabaseAdmin.from("expenses").select(
        "id, title, category, amount, payment_source, payer_member_id, occurred_at, description, status"
      ).eq("trip_id", tripId).order("occurred_at", { ascending: false }),

      supabaseAdmin.from("expense_allocations").select(
        `id, expense_id, member_id, amount,
         expense:expenses!inner(trip_id)`
      ).eq("expense.trip_id", tripId),

      supabaseAdmin.from("fund_transactions").select(
        "id, member_id, transaction_type, direction, amount, occurred_at, note, status"
      ).eq("trip_id", tripId).order("occurred_at", { ascending: false }),
    ])

    if (!trip) {
      return new Response(JSON.stringify({ error: "Trip not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Strip the nested expense join from allocations before sending
    const cleanAllocations = (allocations ?? []).map(({ expense: _expense, ...rest }: Record<string, unknown>) => rest)

    return new Response(JSON.stringify({
      trip,
      members: members ?? [],
      contributions: contributions ?? [],
      expenses: expenses ?? [],
      allocations: cleanAllocations,
      fund_transactions: fundTransactions ?? [],
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  } catch (err) {
    console.error("get-shared-trip error:", err)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
