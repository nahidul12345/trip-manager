# 🌴 Friends Trip Expense Manager

A production-ready, mobile-first web application designed for groups of friends traveling together. Accurately manages group funds, records multi-category expenses, divides costs evenly or proportionally, tracks real-time member balances in Bangladeshi Taka (৳ BDT) and other currencies, provides settlement suggestions, and offers secure, read-only public links for trip members.

---

## ✨ Features

- **🔐 Secure Authentication**: Email/password authentication powered by Supabase Auth with Row-Level Security (RLS) guaranteeing data isolation between trip administrators.
- **🗺️ Trip Lifecycle Management**: Create trips, specify travel dates, location, default currency, and add participating friends with custom notes. Archive completed trips into read-only records.
- **💰 Money Collected (Contributions)**: Log group pool payments with payment method tracking (`cash`, `bkash`, `nagad`, `bank`, `other`), transaction references, and notes.
- **🧾 Multi-Method Expense Splitting**:
  - **Equal Split**: Even division among all or selected trip members with remainder distribution (e.g. ৳1,000 ÷ 3 = ৳334, ৳333, ৳333).
  - **Custom Amount Split**: Specify exact amounts per member with real-time validation against total.
  - **Percentage Split**: Custom percentage allocations (e.g. 50% / 30% / 20%) with strict 100% total validation.
- **💳 Dual Payment Sources**:
  - **Group Fund**: Deducts directly from the pooled trip wallet.
  - **Personal Out-of-Pocket**: Paid by an individual friend and credited toward their balance.
- **🏷️ Expense Categorization & Receipts**: Categorize by Transport, Food, Accommodation, Tickets, Shopping, or Other, with receipt image attachment support via Supabase Storage.
- **🛡️ Immutable Ledger & Voiding**: Append-only transaction design with soft-void audit logging to prevent silent deletions or financial discrepancies.
- **⚖️ Real-Time Balance & Settlement Engine**:
  - Displays each friend's total contributed, personal outlays, allocated expense share, and net balance.
  - Greedy settlement algorithm generates the minimal number of transfers to balance the books.
  - Group fund refund handling when a surplus remains.
- **🔗 Secure Public Read-Only Sharing**:
  - Token-based URL sharing (`/share/:token`) for trip friends who don't need admin accounts.
  - Raw token is **never stored directly in the database**; verified using SHA-256 hash lookup via server-side Supabase Edge Function (`get-shared-trip`).
  - Supports one-click link generation, instant revocation, and 30-day expiration.
- **📊 Reports & Data Export**:
  - Comprehensive financial summary.
  - One-click CSV export containing full transaction log and member settlement statements.
  - Printer-optimized clean report layout.
- **📱 Mobile-First Responsive Design**: Tailored for smartphones during active travel with desktop enhancements, smooth transitions, toast alerts, and dark-accented modern aesthetics.

---

## 🏗️ Architecture & Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend Framework** | React 19 + TypeScript 5 |
| **Build & Tooling** | Vite 6 |
| **Styling** | Tailwind CSS v4 + Custom Glassmorphism & Micro-animations |
| **Routing** | React Router DOM v7 |
| **Forms & Validation** | React Hook Form + Zod Schema Validation |
| **Icons & UI** | Lucide React, React Hot Toast |
| **Database & Auth** | Supabase (PostgreSQL 15+, Row-Level Security, Storage, Edge Functions) |
| **Testing** | Vitest + Testing Library (32 automated unit tests for financial calculations) |

---

## 🧮 Financial Calculation Engine & Invariants

All calculations are encapsulated in [`src/lib/financial-calculations.ts`](file:///c:/projects/friends%20trip%20expense%20tracker/src/lib/financial-calculations.ts) and tested in [`src/tests/financial-calculations.test.ts`](file:///c:/projects/friends%20trip%20expense%20tracker/src/tests/financial-calculations.test.ts).

### Core Invariants:
1. **Remainder Integrity**: When dividing amounts that don't divide evenly into integers, the remainder is allocated to the first $N$ members so that:
   $$\sum \text{Allocations} \equiv \text{Total Expense}$$
2. **Group Cash Balance**:
   $$\text{Cash Balance} = \sum \text{Contributions} - \sum \text{Group Fund Expenses} - \sum \text{Refunds} + \sum \text{Other Inflows} - \sum \text{Other Outflows}$$
3. **Individual Net Balance**:
   $$\text{Net Balance} = (\text{Contributions} + \text{Personally Paid}) - \text{Allocated Expenses} - \text{Refunds Received}$$
   - **Positive (+) Net Balance**: Friend has paid more than their share and is owed money / refund.
   - **Negative (−) Net Balance**: Friend owes money to the group or other friends.
4. **Reconciliation Conservation**:
   $$\sum \text{Net Balances} \equiv \text{Group Cash Balance}$$

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- [Node.js](https://nodejs.org/) v18 or later
- [Git](https://git-scm.com/)
- A free [Supabase](https://supabase.com/) project

### 2. Installation
```bash
# Clone the repository
git clone <repository-url>
cd "friends trip expense tracker"

# Install dependencies
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Update `.env` with your Supabase credentials:
```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

### 4. Database Schema Setup

> **Manager / Member roles (branch `feature/manager-member`):** after 001 and 002, also run
> `supabase/migrations/003_manager_member_roles.sql` on the SAME project database.
> It is additive only (new `trip_members.user_id`/`role` columns, a `trip_join_codes`
> table, and three RPC functions). Until it is run, join codes, joining, promoting
> and leaving will fail with a clear error, and the app keeps its old owner-only
> behaviour. Existing trips are not redesigned or re-styled by this change.
1. Log in to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Open the **SQL Editor**.
3. Copy the entire contents of [`supabase/migrations/001_initial_schema.sql`](file:///c:/projects/friends%20trip%20expense%20tracker/supabase/migrations/001_initial_schema.sql).
4. Click **Run**. This creates:
   - All tables (`trips`, `trip_members`, `contributions`, `expenses`, `expense_allocations`, `fund_transactions`, `trip_share_links`, `audit_logs`)
   - Foreign key constraints, check constraints, and performance indexes
   - Row-Level Security (RLS) policies
   - Automatic triggers for timestamps and fund transactions

### 5. Supabase Storage Setup (Optional for Receipts)
1. Go to **Storage** in your Supabase dashboard.
2. Create a new bucket named `receipts`.
3. Set bucket access to **Public** (or configure authenticated RLS download policies).

### 6. Deploy Supabase Edge Function (For Secure Public Links)
The public share feature uses a secure SHA-256 token verification edge function:
```bash
supabase functions deploy get-shared-trip --no-verify-jwt
```

### 7. Run Locally
```bash
# Start local development server
npm run dev

# Run unit tests
npm run test

# Type check
npm run build
```
Visit `http://localhost:5173` in your browser.

---

## 🧪 Testing

Run the test suite with Vitest:
```bash
npm run test
```
The test suite validates:
- Equal splitting with integer remainders
- Percentage splitting and boundary edge cases
- Group cash balance accounting
- Voided transaction exclusions
- Out-of-pocket vs. group fund expenses
- Refund calculations and reconciliation conservation
- Settlement transfers minimization

---

## 📦 Deployment

### Deploy to Vercel
1. Push your repository to GitHub.
2. Import the repository in [Vercel](https://vercel.com).
3. Set the build command to `npm run build` and output directory to `dist`.
4. Add the environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy!

### Deploy to Netlify
1. Create a `_redirects` file in `public/`:
   ```
   /*    /index.html   200
   ```
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Add environment variables in Netlify site settings.

---

## 🔒 Security & Privacy

- **Row Level Security (RLS)**: Enforced on all tables. Authenticated users only have access to trips they created.
- **Zero Raw Tokens in Database**: Trip share links store only the SHA-256 digest of the token. An attacker with database read access cannot generate or guess valid share URLs.
- **Service Role Isolation**: High-privilege service keys are kept strictly within server-side Edge Functions and are never bundled into the client bundle.
- **Input Sanitization**: All numeric and string inputs are validated using Zod schemas with constraint checks.

---

## 📄 License
MIT License. Built for seamless group travel and transparent expense sharing among friends.
