-- ============================================================
-- Campus Bulkmart — Admin Seeding
-- Run this AFTER schema.sql + rls-policies.sql.
--
-- Your current admin UID (pulled straight from firestore.rules'
-- hardcoded isAdmin() check) is:
--   aq0QC7De1GNIOYVH7qtCDwBEH1I2
--
-- This is an UPSERT — safe to run before OR after Phase 5's full
-- data migration. If your profile row doesn't exist in Supabase
-- yet, this creates it with admin rights. If Phase 5 later
-- migrates the same uid from Firestore, just re-run this after —
-- it'll update the role without touching your other fields.
-- ============================================================

insert into public.users (uid, role)
values ('aq0QC7De1GNIOYVH7qtCDwBEH1I2', 'admin')
on conflict (uid)
do update set role = 'admin';

-- ============================================================
-- ADDING FUTURE ADMINS
-- To promote anyone else later, get their Firebase Auth uid
-- (visible in Firebase Console → Authentication → Users) and run:
--
--   update public.users set role = 'admin' where uid = 'PASTE_UID_HERE';
--
-- To demote back to a normal customer:
--
--   update public.users set role = 'customer' where uid = 'PASTE_UID_HERE';
--
-- No SQL editing of firestore.rules or redeploying anything —
-- this is exactly the flexibility the role column (vs. the old
-- hardcoded single admin UID) was meant to give you.
-- ============================================================
