-- ============================================================
-- Campus Bulkmart — Wallet Checkout Function (Phase 6 dependency)
-- Run this in Supabase SQL Editor (after schema.sql/rls-policies.sql).
--
-- Why this exists: the old script.js used Firestore's runTransaction()
-- to atomically (1) check the wallet balance, (2) deduct it, and
-- (3) create the order — all-or-nothing, with no risk of a double
-- spend if two requests happened at once. Supabase's JS client has
-- no direct equivalent for multi-table atomic transactions, so this
-- logic moves into a single Postgres function instead, which runs
-- in one implicit transaction with a row lock (`for update`) on the
-- user's row — functionally the same guarantee as before.
--
-- Called from script.js via: sb.rpc('checkout_with_wallet', {...})
-- ============================================================

create or replace function public.checkout_with_wallet(
  p_uid text,
  p_amount numeric,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_delivery_address text,
  p_items jsonb,
  p_subtotal numeric,
  p_delivery_fee numeric,
  p_total_discount numeric,
  p_order_mode text
)
returns table(success boolean, message text, order_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_order_id uuid;
begin
  -- Lock the user's row for the duration of this transaction so a
  -- second simultaneous checkout can't read a stale balance.
  select wallet_balance into v_balance
  from public.users
  where uid = p_uid
  for update;

  if v_balance is null then
    return query select false, 'User not found', null::uuid;
    return;
  end if;

  if v_balance < p_amount then
    return query select false, 'Insufficient vault balance', null::uuid;
    return;
  end if;

  update public.users
  set wallet_balance = wallet_balance - p_amount
  where uid = p_uid;

  insert into public.orders (
    user_id, customer_name, customer_email, customer_phone,
    delivery_address, items, subtotal, delivery_fee, total_discount,
    final_total, order_mode, payment_method, status
  )
  values (
    p_uid, p_customer_name, p_customer_email, p_customer_phone,
    p_delivery_address, p_items, p_subtotal, p_delivery_fee, p_total_discount,
    p_amount, p_order_mode, 'vault', 'pending'
  )
  returning id into v_order_id;

  return query select true, 'ok', v_order_id;
end;
$$;

-- Only signed-in users can call this (matches how checkout already
-- requires currentUser in script.js)
grant execute on function public.checkout_with_wallet to authenticated;
