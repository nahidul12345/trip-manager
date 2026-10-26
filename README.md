# Friends Trip Manager — React version

React + Vite + Tailwind rebuild of Friends Trip Manager, copying the old
React app's design faithfully: Inter font (Google Fonts, 300–800), brand
blues #3b82f6 / #2563eb / #1d4ed8, white cards, white form inputs with a
blue focus ring, and the dark login gradient (slate-900 via blue-950 to
slate-900) with the 64px blue wallet icon and white sign-in card.

This is **not** the plain HTML version's design. It replaces the HTML
version's `index.html` and `README.md` on the `trip-manager` branch when
pushed — that overwrite was user-approved for those two files only.

## What it does

- Signup / Login first, then Role Choose: Manager or Group Member.
  Role is per trip, not a global lock — a person can separately become
  a Manager anew by creating their own trip.
- Manager: Create Trip (no join code shown at creation; the code is
  shown on the trip page, to the Manager only), add/remove members,
  manage all contributions/expenses, create a 30-day read-only share
  link, archive a trip, and promote a Member to Manager (the old
  Manager then becomes a Member).
- Member: Join Trip with the Manager's Join Code, see only their own
  joined trip, add their own contributions/expenses, cannot
  delete/archive a trip, cannot remove others, cannot view other
  trips, and can leave voluntarily. A sole Manager must promote
  someone first before leaving.
- Contributions: cash / bkash / nagad / bank / other, note, reference.
- Expenses: transport / food / accommodation / tickets / shopping /
  other, group_fund / personal + payer, splits equal / custom amount /
  custom percentage with validation (custom amounts must sum to the
  expense, custom percentages must sum to 100).
- Balances + greedy settlement + group-fund refund display, CSV download.
- Language selector: Bangla (default) / English, saved in localStorage
  as `ftm_lang`.
- Public share page at `/share/:token` (no login) via the
  `get_shared_trip` RPC from `sql/02_full_tables.sql`.

## Setup — do these in order

### 1. Install

```bash
npm install
npm run dev
```

### 2. Environment — NEW Supabase project only

```bash
cp .env.example .env
```

Edit `.env` and fill in **your** publishable / anon key:

```text
VITE_SUPABASE_URL=https://rnsxesihyetlspicrwlo.supabase.co
VITE_SUPABASE_ANON_KEY=PASTE_YOUR_PUBLISHABLE_KEY_HERE
```

Never put a `service_role` key, an account password, or a database
password in `.env` or in any frontend file. `.env` is git-ignored.
The shipped `.env.example` contains placeholders only.

### 3. Database — run in this order, new project only

In Supabase Dashboard → SQL Editor, on the **new** project only:

1. Run `sql/01_setup.sql` first.
2. Then run `sql/02_full_tables.sql`.

Order matters: `01_setup.sql` creates the tables (`profiles`,
`trips`, `trip_members`, `trip_join_codes`) **before** the helper
functions `is_trip_member` / `is_trip_manager` that query
`trip_members`. The old order (helpers first) failed in Postgres with
`ERROR 42P01: relation "public.trip_members" does not exist`.
`01_setup.sql` drops and recreates those four tables, so run it only
on a new project, never on a project with live data.

For testing, you may turn email confirmation OFF in Supabase
Auth → Providers → Email, or confirm a test user manually in
Authentication → Users. Supabase Auth has email rate limits; repeated
signup attempts can hit "email rate limit exceeded" — wait, then log
in with an already-created account instead of signing up again.

### 4. Test flow

1. Account 1: Signup → Manager → Create Trip → trip page shows Join Code.
2. Account 2: Signup → Member → Join Trip with that code.
3. Add contributions, add expenses (equal, custom amount, custom
   percentage), check Balance / Settlement, download CSV.
4. Promote a Member to Manager (old Manager becomes Member), leave,
   archive, and open a share link in incognito.

## Deploy

Build with `npm run build` (output: `dist/`).

- **Netlify:** set Build command `npm run build`, Publish directory
  `dist`, and add `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in
  Site settings → Environment variables. Add a `_redirects` file or
  SPA fallback (`/* /index.html 200`) so `/trips/:id` and
  `/share/:token` work on refresh.
- **Vercel:** import the repo, framework preset Vite, same two env
  vars. Vercel handles SPA routing automatically.

Important: pushing only the source files to a static host does **not**
serve the app — the built `dist/` output is what must be published.
If a host is publishing the repo root as static files, the React
`index.html` (which loads `/src/main.tsx`) will not run unbuilt.

## Files

- `index.html` — Inter font links, title Friends Trip Manager
- `src/index.css` — Tailwind 4 + old brand tokens, `.card`,
  `.form-input`, `.btn` styles copied from the old app
- `src/lib/supabase.ts` — env-only Supabase client
- `src/lib/calculations.ts` — balances, greedy settlement, splits
- `src/lib/i18n.ts` — Bangla / English dictionary
- `src/contexts/AuthContext.tsx`, `src/contexts/LangContext.tsx`
- `src/components/ui.tsx`, `src/components/Layout.tsx`
- `src/pages/` — Login, Role, Dashboard, CreateTrip, JoinTrip,
  TripDetail, Share
- `sql/01_setup.sql`, `sql/02_full_tables.sql` — fixed order, run
  in that order (see §3)

## Limitations (honest)

- No receipt image upload (the old React app had Supabase Storage
  receipts; this rebuild has no receipt field yet).
- Share token is stored in plain text in `trip_share_links` (as in
  the HTML version), not SHA-256 + Edge Function as in the old app.
  Revoke a link via `revoked_at` or let it expire after 30 days.
- No separate fund-transaction table; group-fund refund is shown in
  settlement only.
- Email confirmation behaviour depends on Supabase Auth settings.
- After pushing to `trip-manager` main, the old HTML files
  (`auth.html`, `dashboard.html`, `css/`, `js/`, etc.) remain on the
  branch — this push does not delete them. The React `index.html`
  replaces the HTML `index.html` at the root, so the old HTML site
  is no longer the root page until those files are cleaned up
  deliberately.
