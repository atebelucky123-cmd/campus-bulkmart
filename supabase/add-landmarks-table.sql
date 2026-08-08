-- ============================================================
-- Campus Bulkmart — Phase 2c Migration (1/2)
-- Landmarks table — stores lat/lng, NOT a fixed distance_km.
-- Distance is calculated live via Haversine (delivery-geo.js) so
-- editing the origin (Phase 2d) never leaves a landmark's distance
-- stale.
--
-- Run in Supabase Dashboard → SQL Editor.
-- ============================================================

create table if not exists public.landmarks (
  id          bigint generated always as identity primary key,
  name        text not null,
  address     text,
  lat         double precision not null,
  lng         double precision not null,
  created_at  timestamptz not null default now()
);

alter table public.landmarks enable row level security;

grant select on public.landmarks to anon, authenticated;
grant insert, update, delete on public.landmarks to authenticated;

-- Public read (needed for the checkout landmark dropdown) —
-- same pattern as products/categories.
create policy "landmarks_public_read" on public.landmarks
  for select using (true);

-- Admin-only write (Phase 2d's admin CRUD) — reuses the is_admin()
-- helper already defined in rls-policies.sql.
create policy "landmarks_admin_insert" on public.landmarks
  for insert with check (public.is_admin());

create policy "landmarks_admin_update" on public.landmarks
  for update using (public.is_admin()) with check (public.is_admin());

create policy "landmarks_admin_delete" on public.landmarks
  for delete using (public.is_admin());

-- ── Seed data (Lucky's real coordinates) ──
insert into public.landmarks (name, address, lat, lng) values
  ('Obafemi Awolowo Way', 'Obafemi Awolowo Way (main address), Ikeja 101233, Lagos', 6.607831129588095, 3.35006541130937),
  ('Tonade Street', 'Tonade Street, Opebi, Ikeja 101233, Lagos', 6.595004308106744, 3.3428118671277005),
  ('Olowu Street', 'Olowu Street, Ikeja 101233, Lagos', 6.597079422769862, 3.3438086959640287),
  ('Toyin Street', 'Toyin Street, Ikeja 101233, Lagos', 6.59634609658617, 3.350950038291412);
