-- ============================================================
-- Campus Bulkmart — Phase 3 Migration
-- Saved/favorited delivery addresses — lets a returning customer
-- skip re-typing + re-verifying their address every checkout.
-- Stores the already-resolved lat/lng + source (geocoded point or
-- picked landmark) so a saved address never needs re-geocoding —
-- it's replayed straight into delivery-fee.js's formula.
--
-- Run in Supabase Dashboard → SQL Editor, after Phase 2 migrations.
-- Safe to re-run: guards on table-not-exists.
-- ============================================================

create table if not exists public.saved_addresses (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,              -- Firebase Auth uid, same convention as orders/reviews
  label       text not null,              -- e.g. "Hostel", "Home" — customer's own name for it
  address     text not null,              -- the raw address text they typed
  lat         double precision not null,
  lng         double precision not null,
  source      text not null default 'geocoded',  -- 'geocoded' | 'landmark' — mirrors delivery-geo.js's resolveDeliveryLocation() shape
  landmark_id bigint references public.landmarks(id) on delete set null,  -- only set when source = 'landmark'
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index idx_saved_addresses_user_id on public.saved_addresses(user_id);

alter table public.saved_addresses enable row level security;

grant select, insert, update, delete on public.saved_addresses to authenticated;

-- A user can only ever see/edit their own saved addresses — matches
-- rls-policies.sql's exact pattern: (select auth.jwt()->>'sub'), including
-- the `select` wrapper (lets Postgres's planner evaluate it once per
-- statement instead of once per row).
create policy "saved_addresses_owner_select" on public.saved_addresses
  for select using (user_id = (select auth.jwt()->>'sub'));

create policy "saved_addresses_owner_insert" on public.saved_addresses
  for insert with check (user_id = (select auth.jwt()->>'sub'));

create policy "saved_addresses_owner_update" on public.saved_addresses
  for update using (user_id = (select auth.jwt()->>'sub')) with check (user_id = (select auth.jwt()->>'sub'));

create policy "saved_addresses_owner_delete" on public.saved_addresses
  for delete using (user_id = (select auth.jwt()->>'sub'));

comment on table public.saved_addresses is
  'Per-user favorited delivery addresses (Phase 3). Cap of 5 per user and default-address selection are enforced in cart-checkout.js, not here — DB has no hard limit.';
