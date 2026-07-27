-- ============================================================
-- Campus Bulkmart — Transactions table (Phase 8 addition)
-- Run in Supabase SQL Editor. Purely additive — safe on your
-- existing populated database (creates a new table only).
--
-- Why this exists: wallet.html reads a Firestore sub-collection
-- (users/{uid}/transactions) for deposit/payment history, written
-- by the Render backend — never in the original schema.sql since
-- that backend is currently suspended (Paystack paused). Adding
-- this now so the feature has a real home in Supabase and works
-- immediately if/when that backend comes back online.
-- ============================================================

create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null references public.users(uid) on delete cascade,
  type         text not null,   -- 'credit' | 'debit'
  amount       numeric not null,
  description  text,
  created_at   timestamptz default now()
);

create index if not exists idx_transactions_user_id on public.transactions(user_id);

alter table public.transactions enable row level security;

grant select on public.transactions to authenticated;
grant insert on public.transactions to authenticated; -- real writes will come from the backend via service_role, which bypasses RLS anyway

create policy "transactions_own_or_admin_read" on public.transactions
  for select using (
    user_id = (select auth.jwt()->>'sub') or public.is_admin()
  );
