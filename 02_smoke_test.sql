-- =====================================================================
-- Smoke test — run AFTER 01_schema.sql, in Supabase → SQL Editor.
-- Needs at least one user: Authentication → Users → Add user.
-- Everything runs inside a transaction that is ROLLED BACK at the end,
-- so no test data is left behind.
--   Result "Success. No rows returned"  = all checks passed
--   An error starting with "CHECK FAILED" = tells you which rule broke
-- =====================================================================
begin;

-- pre-check (runs as admin, before switching role)
do $$
begin
    if not exists (select 1 from auth.users) then
        raise exception 'CHECK FAILED: no user found — add one under Authentication → Users → Add user';
    end if;
    if to_regprocedure('public.create_care_plan(uuid,date,integer,smallint[],time without time zone,integer,numeric,text,date)') is null then
        raise exception 'CHECK FAILED: 01_schema.sql has not been run (create_care_plan is missing)';
    end if;
end $$;

-- act as the first signed-up user, exactly like the app would
-- (both setting styles are set so any auth.uid() version picks them up)
select set_config('request.jwt.claims',
       json_build_object('sub', (select id from auth.users order by created_at limit 1), 'role', 'authenticated')::text,
       true),
       set_config('request.jwt.claim.sub', (select id::text from auth.users order by created_at limit 1), true);
set local role authenticated;

do $$
declare
    v_patient uuid;
    v_plan    uuid;
    v_first   uuid;
    v_second  public.sessions%rowtype;
    v_result  jsonb;
    v_count   int;
begin
    assert auth.uid() is not null, 'CHECK FAILED: a user exists but the test could not act as them (auth.uid() is empty)';

    insert into public.patients (full_name, address, default_fee)
    values ('Smoke Test Patient', '1 Test Street, Tarlac City', 750)
    returning id into v_patient;

    -- 1. plan of care generates the right number of sessions
    v_result := public.create_care_plan(v_patient, current_date - 7, 6, '{1,3,5}', '05:00');
    v_plan   := (v_result ->> 'care_plan_id')::uuid;
    select count(*) into v_count from public.sessions where care_plan_id = v_plan;
    assert v_count = 6, 'CHECK FAILED: plan should create 6 sessions, got ' || v_count;

    -- 2. fee copied from the patient's default
    assert (select bool_and(fee = 750) from public.sessions where care_plan_id = v_plan),
           'CHECK FAILED: session fee should default to patient fee';

    -- 3. a past visit can be completed
    select id into v_first from public.sessions
     where care_plan_id = v_plan and starts_at < now() order by starts_at limit 1;
    perform public.complete_session(v_first);
    assert (select status from public.sessions where id = v_first) = 'completed',
           'CHECK FAILED: complete_session did not complete';

    -- 4. cancelling a future visit adds a make-up, plan still has 6 active
    select * into v_second from public.sessions
     where care_plan_id = v_plan and status = 'scheduled' and starts_at > now()
     order by starts_at limit 1;
    v_result := public.cancel_session(v_second.id, 'smoke test');
    assert jsonb_array_length(v_result -> 'created') = 1, 'CHECK FAILED: no make-up session created';
    select count(*) into v_count from public.sessions where care_plan_id = v_plan and status <> 'cancelled';
    assert v_count = 6, 'CHECK FAILED: plan should still have 6 active sessions, got ' || v_count;

    -- 5. numbering stays 1..6 with no gaps
    assert (select array_agg(session_number order by session_number) from public.sessions
             where care_plan_id = v_plan and status <> 'cancelled') = array[1,2,3,4,5,6],
           'CHECK FAILED: session numbering should be 1..6';

    -- 6. charged no-show shows up in the balance
    select id into v_first from public.sessions
     where care_plan_id = v_plan and status = 'scheduled' and starts_at < now() order by starts_at limit 1;
    if v_first is not null then
        perform public.mark_no_show(v_first, true);
        assert (select total_charged from public.v_patient_balances where patient_id = v_patient) = 1500,
               'CHECK FAILED: balance should include completed + charged no-show (1500)';
    end if;

    -- 7. double-booking is impossible
    select * into v_second from public.sessions
     where care_plan_id = v_plan and status = 'scheduled' and starts_at > now()
     order by starts_at limit 1;
    begin
        perform public.create_single_session(v_patient, v_second.starts_at + interval '15 minutes', 60);
        raise exception 'CHECK FAILED: overlapping visit was allowed';
    exception when exclusion_violation then null;   -- expected
    end;

    -- 8. slot checker reports the overlap
    assert exists (select 1 from public.check_time_slot(v_second.starts_at, 30) where issue = 'overlap'),
           'CHECK FAILED: check_time_slot did not report the overlap';

    -- 9. the app cannot write to sessions directly
    begin
        update public.sessions set status = 'completed' where id = v_second.id;
        raise exception 'CHECK FAILED: direct update on sessions was allowed';
    exception when insufficient_privilege then null;  -- expected
    end;
end $$;

rollback;
