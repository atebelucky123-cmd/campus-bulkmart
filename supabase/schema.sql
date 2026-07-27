-- ============================================================
-- Campus Bulkmart — Supabase Schema (Phase 3)
-- Mirrors the 6 active Firestore collections found in Phase 1:
-- products, categories, settings, reviews, orders, users
--
-- Run this in Supabase Dashboard → SQL Editor, as ONE single paste.
-- RLS is intentionally NOT enabled/policied here — that's Phase 4.
-- Tables created via raw SQL start with grants but no RLS, so until
-- Phase 4 is run, these tables are technically open. Run Phase 4
-- immediately after this, in the same sitting, before going further.
--
-- Safe to re-run: starts by dropping any of these 6 tables if they
-- already exist (e.g. from an earlier partial attempt), so you don't
-- have to manually clean up before pasting this in.
-- ============================================================

drop table if exists public.reviews cascade;
drop table if exists public.orders cascade;
drop table if exists public.products cascade;
drop table if exists public.categories cascade;
drop table if exists public.settings cascade;
drop table if exists public.users cascade;

-- ============================================================
-- CATEGORIES (created first — products has a foreign key to it)
-- Note: Firestore field "order" is a reserved word in SQL —
-- renamed to sort_order. Update admin.js/script.js references
-- from `order` to `sort_order` during Phase 6/7.
-- ============================================================
create table public.categories (
  id          text primary key,
  name        text not null,
  slug        text unique not null,
  emoji       text,
  sort_order  integer default 0,
  created_at  timestamptz default now()
);

-- ============================================================
-- PRODUCTS
-- Covers both regular items (groceries/stationeries) AND
-- hostel services (isService = true, priced via variant_groups
-- instead of a flat price).
-- Note: Firestore field "desc" is a reserved word in SQL —
-- renamed to "description".
-- ============================================================
create table public.products (
  id                  text primary key,               -- keep original Firestore doc IDs during migration
  name                text not null,
  description         text,
  image               text,
  category            text references public.categories(slug),
  price               numeric default 0,
  cost_price          numeric,
  market_name         text,
  is_hidden           boolean default false,
  is_top_pick         boolean default false,
  is_service          boolean default false,           -- true = hostel service, priced via variant_groups
  allow_group_order   boolean default false,
  stock               integer,
  variants            jsonb default '[]'::jsonb,        -- flat size/weight options: [{name, price}]
  variant_groups      jsonb default '[]'::jsonb,        -- hostel service price list: [{groupName, items:[{name, price, description}]}]
  created_at          timestamptz default now()
);

create index idx_products_category on public.products(category);
create index idx_products_is_top_pick on public.products(is_top_pick) where is_top_pick = true;

-- ============================================================
-- SETTINGS
-- Firestore had 2 singleton docs (appConfig, siteContent) with
-- very different shapes. Modeled here as a simple key/value table
-- rather than 2 separate tables — matches how your code already
-- treats them (one doc = one blob of config).
-- ============================================================
create table public.settings (
  key         text primary key,        -- 'appConfig' | 'siteContent'
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz default now()
);

-- ============================================================
-- REVIEWS
-- Note: Firestore field "timestamp" renamed to "created_at" for
-- consistency with every other table. Update script.js/admin.js
-- references during Phase 6/7.
-- ============================================================
create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  product_id  text references public.products(id) on delete cascade,
  user_id     text not null,           -- Firebase Auth uid (no FK — see users note below)
  user_name   text,
  stars       integer not null check (stars between 1 and 5),
  text        text not null,
  featured    boolean default false,
  rank        integer,
  created_at  timestamptz default now()
);

create index idx_reviews_product_id on public.reviews(product_id);
create index idx_reviews_user_id on public.reviews(user_id);

-- ============================================================
-- ORDERS
-- ============================================================
create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  user_id           text not null,     -- Firebase Auth uid
  customer_name     text,
  customer_email    text,
  customer_phone    text,
  delivery_address  text,
  items             jsonb not null default '[]'::jsonb,  -- [{id, name, price, qty}]
  subtotal          numeric default 0,
  delivery_fee      numeric default 0,
  total_discount    numeric default 0,
  final_total       numeric default 0,
  order_mode        text default 'individual',  -- 'individual' | 'group'
  payment_method    text,               -- 'whatsapp' | 'vault' | etc.
  status            text default 'pending',  -- 'pending' | 'confirmed' | 'completed' | 'cancelled'
  amount_paid       numeric,            -- set when admin confirms payment
  confirmed_at      timestamptz,        -- set when admin confirms payment
  completed_at      timestamptz,        -- set when admin marks order completed
  created_at        timestamptz default now()
);

create index idx_orders_user_id on public.orders(user_id);
create index idx_orders_created_at on public.orders(created_at desc);

-- ============================================================
-- USERS (profile data — NOT login credentials, those stay in
-- Firebase Auth. This table is the bridge: uid ties a Supabase
-- profile row back to a Firebase-authenticated identity.)
--
-- ⚠️ BUG FOUND DURING AUDIT: your current script.js reads the
-- wallet balance under TWO different field names —
--   line 1382: userDoc.data().wallet_balance   (snake_case)
--   line 1407/1411: userDoc.data().walletBalance / tx.update(..walletBalance..)
-- Only "walletBalance" is ever actually written, so the
-- line-1382 check has likely always silently read undefined → 0.
-- This schema standardizes on wallet_balance (snake_case, normal
-- Postgres convention) — Phase 6 will fix script.js to match,
-- which resolves the bug as a side effect of the migration.
--
-- Also added: a "role" column (per Phase 4 decision) so admin
-- status isn't hardcoded to one UID anymore. Defaults everyone
-- to 'customer'; you'll manually set your own row to 'admin'
-- after Phase 5's data migration runs.
-- ============================================================
create table public.users (
  uid             text primary key,   -- Firebase Auth uid
  username        text,
  display_name    text,
  email           text,
  wallet_balance  numeric default 0,
  role            text default 'customer',  -- 'customer' | 'admin'
  created_at      timestamptz default now()
);
