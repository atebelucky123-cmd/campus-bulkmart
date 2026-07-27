-- ============================================================
-- Campus Bulkmart — Row Level Security (Phase 4)
-- Direct translation of firestore.rules, table by table.
-- Run this AFTER schema.sql, in the same sitting — schema.sql's
-- tables have no RLS protection until this file runs.
--
-- Requires: Firebase registered as a Third-Party Auth provider
-- (Phase 2) so auth.jwt()->>'sub' resolves to the Firebase uid.
-- ============================================================

-- ============================================================
-- 0. HELPER — equivalent to firestore.rules' isAdmin() function.
-- Uses SECURITY DEFINER so checking admin status doesn't trigger
-- infinite recursion against users' own RLS policies.
-- (Old rule: hardcoded to uid 'aq0QC7De1GNIOYVH7qtCDwBEH1I2'.
--  New rule: checks the role column from Phase 3's schema —
--  set your own row's role to 'admin' after Phase 5's data migration.)
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.users
    where uid = (select auth.jwt()->>'sub')
    and role = 'admin'
  );
$$;

-- ============================================================
-- ENABLE RLS on every table (belt-and-suspenders — should already
-- be on if you enabled "Enable RLS on new tables" in Phase 2)
-- ============================================================
alter table public.products   enable row level security;
alter table public.categories enable row level security;
alter table public.settings   enable row level security;
alter table public.reviews    enable row level security;
alter table public.orders     enable row level security;
alter table public.users      enable row level security;

-- ============================================================
-- 1. PRODUCTS
-- Original: allow read: if true; allow write: if isAdmin();
-- ============================================================
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;

create policy "products_public_read" on public.products
  for select using (true);

create policy "products_admin_insert" on public.products
  for insert with check (public.is_admin());

create policy "products_admin_update" on public.products
  for update using (public.is_admin()) with check (public.is_admin());

create policy "products_admin_delete" on public.products
  for delete using (public.is_admin());

-- ============================================================
-- 2. CATEGORIES
-- Original: allow read: if true; allow write: if isAdmin();
-- ============================================================
grant select on public.categories to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;

create policy "categories_public_read" on public.categories
  for select using (true);

create policy "categories_admin_insert" on public.categories
  for insert with check (public.is_admin());

create policy "categories_admin_update" on public.categories
  for update using (public.is_admin()) with check (public.is_admin());

create policy "categories_admin_delete" on public.categories
  for delete using (public.is_admin());

-- ============================================================
-- 3. SETTINGS
-- Original: allow read: if true; allow write: if isAdmin();
-- ============================================================
grant select on public.settings to anon, authenticated;
grant insert, update, delete on public.settings to authenticated;

create policy "settings_public_read" on public.settings
  for select using (true);

create policy "settings_admin_insert" on public.settings
  for insert with check (public.is_admin());

create policy "settings_admin_update" on public.settings
  for update using (public.is_admin()) with check (public.is_admin());

create policy "settings_admin_delete" on public.settings
  for delete using (public.is_admin());

-- ============================================================
-- 4. REVIEWS
-- Original: allow read: if true; allow write: if request.auth != null;
--
-- ⚠️ NOT preserved as-is — the original Firestore rule let ANY
-- signed-in user edit or delete ANY OTHER user's review. Per your
-- instruction, this is tightened here: users can only insert new
-- reviews (any authenticated user) but can only edit/delete their
-- OWN review. Admins can edit/delete any review (for moderation).
-- ============================================================
grant select on public.reviews to anon, authenticated;
grant insert, update, delete on public.reviews to authenticated;

create policy "reviews_public_read" on public.reviews
  for select using (true);

-- Anyone signed in can post a new review
create policy "reviews_authenticated_insert" on public.reviews
  for insert with check ((select auth.jwt()->>'sub') is not null);

-- Only the review's own author (or an admin) can edit it
create policy "reviews_own_or_admin_update" on public.reviews
  for update using (
    user_id = (select auth.jwt()->>'sub') or public.is_admin()
  )
  with check (
    user_id = (select auth.jwt()->>'sub') or public.is_admin()
  );

-- Only the review's own author (or an admin) can delete it
create policy "reviews_own_or_admin_delete" on public.reviews
  for delete using (
    user_id = (select auth.jwt()->>'sub') or public.is_admin()
  );

-- ============================================================
-- 5. ORDERS
-- Original: allow read: if auth != null && (own userId || isAdmin());
--           allow create: if auth != null;
--           allow update, delete: if isAdmin();
-- ============================================================
grant select, insert on public.orders to authenticated;
grant update, delete on public.orders to authenticated;

create policy "orders_own_or_admin_read" on public.orders
  for select using (
    user_id = (select auth.jwt()->>'sub') or public.is_admin()
  );

create policy "orders_any_authenticated_create" on public.orders
  for insert with check ((select auth.jwt()->>'sub') is not null);

create policy "orders_admin_update" on public.orders
  for update using (public.is_admin()) with check (public.is_admin());

create policy "orders_admin_delete" on public.orders
  for delete using (public.is_admin());

-- ============================================================
-- 6. USERS
-- Original: allow read: if own userId || isAdmin();
--           allow create: if own userId;
--           allow update: if own userId AND NOT touching walletBalance;
--           allow write: if isAdmin();  (admin bypasses everything)
-- ============================================================
grant select, insert, update, delete on public.users to authenticated;

create policy "users_own_or_admin_read" on public.users
  for select using (
    uid = (select auth.jwt()->>'sub') or public.is_admin()
  );

create policy "users_own_create" on public.users
  for insert with check (uid = (select auth.jwt()->>'sub'));

-- Admins can update/delete any row (mirrors "allow write: if isAdmin()")
create policy "users_admin_update" on public.users
  for update using (public.is_admin()) with check (public.is_admin());

create policy "users_admin_delete" on public.users
  for delete using (public.is_admin());

-- Non-admins can update their OWN row (wallet_balance protection is
-- enforced by the trigger below, not by this policy — RLS can't
-- compare old vs new values within one check)
create policy "users_own_update" on public.users
  for update using (uid = (select auth.jwt()->>'sub'))
  with check (uid = (select auth.jwt()->>'sub'));

-- ------------------------------------------------------------
-- TRIGGER: block non-admins from changing wallet_balance.
-- This is the Postgres equivalent of Firestore's:
--   !request.resource.data.diff(resource.data).affectedKeys().hasAny(['walletBalance'])
-- ------------------------------------------------------------
create or replace function public.protect_wallet_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.wallet_balance is distinct from old.wallet_balance
     and not public.is_admin() then
    raise exception 'Only admins can modify wallet_balance directly';
  end if;
  return new;
end;
$$;

create trigger trg_protect_wallet_balance
  before update on public.users
  for each row
  execute function public.protect_wallet_balance();

-- ============================================================
-- NOT MIGRATED (confirmed dormant in Phase 1 audit — no code
-- anywhere references these collections):
--   carousel, discounts, deposits
-- If you ever need these, add them the same pattern as above.
-- ============================================================
