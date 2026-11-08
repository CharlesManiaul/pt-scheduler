-- =====================================================================
-- CLEAR ALL APP DATA — cannot be undone.
-- Removes every patient, plan of care, visit, note and payment.
-- Keeps: tables, functions, security rules, settings, and login accounts.
-- Run in Supabase → SQL Editor. The result shows what's left (all zeros).
-- =====================================================================
begin;

truncate table
    public.session_notes,
    public.payments,
    public.sessions,
    public.care_plans,
    public.patients;

commit;

select
    (select count(*) from public.patients)      as patients,
    (select count(*) from public.care_plans)    as plans,
    (select count(*) from public.sessions)      as visits,
    (select count(*) from public.session_notes) as notes,
    (select count(*) from public.payments)      as payments,
    (select count(*) from public.settings)      as settings_kept;
