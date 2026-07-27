-- ============================================================
-- Run this once in Supabase → SQL Editor → New Query → Run
-- ============================================================

create table if not exists waitlist (
  id bigint generated always as identity primary key,
  email text not null unique,
  source text default 'unknown',
  created_at timestamptz not null default now()
);

-- Row Level Security is enabled with no policies, meaning only the
-- service_role key (used by the backend) can read/write this table.
-- The frontend never talks to Supabase directly for this — it always
-- goes through the backend, so this is a safe default.
alter table waitlist enable row level security;
