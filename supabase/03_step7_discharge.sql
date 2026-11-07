-- =====================================================================
-- Step 7 additions — run once in Supabase → SQL Editor (after 01_schema.sql)
-- Safe to run again: everything is create-or-replace / revoke.
-- Discharge now goes through the database so it can also cancel the
-- patient's plans and future visits in the same transaction.
-- =====================================================================

-- Discharge: patient → discharged, open plans → cancelled, future visits → cancelled.
-- Returns how many future visits were cancelled (so the app can say so).
create or replace function public.discharge_patient(p_patient_id uuid)
returns int
language plpgsql security definer set search_path = '' as $$
declare
    v_uid   uuid := private.require_user();
    v_count int;
    v_plan  uuid;
begin
    update public.patients set status = 'discharged'
     where id = p_patient_id and owner_id = v_uid and status = 'active';
    if not found then
        raise exception 'Active patient not found' using errcode = 'P0002';
    end if;

    update public.care_plans set status = 'cancelled'
     where patient_id = p_patient_id and owner_id = v_uid and status in ('active', 'on_hold');

    with cancelled as (
        update public.sessions
           set status = 'cancelled', cancel_reason = 'Patient discharged'
         where patient_id = p_patient_id and owner_id = v_uid
           and status = 'scheduled' and starts_at > now()
        returning 1
    )
    select count(*) into v_count from cancelled;

    for v_plan in select id from public.care_plans where patient_id = p_patient_id and owner_id = v_uid loop
        perform private.renumber_plan_sessions(v_plan);
    end loop;

    return v_count;
end $$;

-- Reactivate: patient → active. Old plans stay cancelled; create a new plan.
create or replace function public.reactivate_patient(p_patient_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_user();
begin
    update public.patients set status = 'active'
     where id = p_patient_id and owner_id = v_uid and status = 'discharged';
    if not found then
        raise exception 'Discharged patient not found' using errcode = 'P0002';
    end if;
end $$;

revoke all on function public.discharge_patient(uuid), public.reactivate_patient(uuid) from public, anon;
grant execute on function public.discharge_patient(uuid), public.reactivate_patient(uuid) to authenticated;

-- status can no longer be changed with a plain UPDATE from the app
revoke update (status) on public.patients from authenticated;

-- Fix: put on hold now REMOVES future visits (instead of cancelling them).
-- Cancelled rows block their dates for make-ups, so resuming a plan used to
-- restart only after the last cancelled date. Future visits never happened,
-- so there is nothing to keep; resume regenerates them from today.
create or replace function public.set_care_plan_on_hold(p_plan_id uuid, p_on_hold boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_user();
begin
    if p_on_hold then
        update public.care_plans set status = 'on_hold'
         where id = p_plan_id and owner_id = v_uid and status = 'active';
        if not found then raise exception 'Active plan not found' using errcode = 'P0002'; end if;

        delete from public.sessions
         where care_plan_id = p_plan_id and owner_id = v_uid
           and status = 'scheduled' and starts_at > now();

        perform private.renumber_plan_sessions(p_plan_id);
        return jsonb_build_object('created', '[]'::jsonb, 'skipped_dates', '[]'::jsonb);
    else
        update public.care_plans set status = 'active'
         where id = p_plan_id and owner_id = v_uid and status = 'on_hold';
        if not found then raise exception 'Plan on hold not found' using errcode = 'P0002'; end if;

        return private.fill_plan_sessions(p_plan_id, private.local_today(v_uid));
    end if;
end $$;
