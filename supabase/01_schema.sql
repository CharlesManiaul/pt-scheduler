-- =====================================================================
-- PT Home Visit Scheduler — Step 3: Database (Supabase / PostgreSQL 15+)
-- Run once in Supabase → SQL Editor. Safe to read top to bottom:
--   1. Extensions & schemas      5. Internal helper functions
--   2. Tables & constraints      6. Public RPC functions (the "stored procedures")
--   3. Indexes                   7. Views
--   4. Triggers                  8. Security: grants + Row Level Security
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. EXTENSIONS & SCHEMAS
-- ---------------------------------------------------------------------
-- btree_gist lets one exclusion constraint combine "same owner" (=) with
-- "time ranges overlap" (&&). This is what makes double-booking impossible.
create extension if not exists btree_gist with schema extensions;

-- "private" is NOT exposed through the Supabase API, so helpers here
-- cannot be called directly from the browser.
create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------
-- 2. TABLES
-- ---------------------------------------------------------------------

-- 2.1 Settings — one row per therapist account
create table public.settings (
    owner_id                uuid primary key default auth.uid()
                            references auth.users (id) on delete cascade,
    therapist_name          text check (char_length(therapist_name) <= 120),
    default_session_minutes int  not null default 60 check (default_session_minutes between 15 and 240),
    default_buffer_minutes  int  not null default 30 check (default_buffer_minutes between 0 and 180),
    timezone                text not null default 'Asia/Manila' check (char_length(timezone) between 3 and 60),
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

-- 2.2 Patients
create table public.patients (
    id               uuid primary key default gen_random_uuid(),
    owner_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
    full_name        text not null check (char_length(btrim(full_name)) between 2 and 120),
    birth_date       date check (birth_date between date '1900-01-01' and current_date),
    sex              text check (sex in ('M', 'F')),
    phone            text check (char_length(phone) <= 30),
    contact_person   text check (char_length(contact_person) <= 120),
    contact_phone    text check (char_length(contact_phone) <= 30),
    address          text not null check (char_length(btrim(address)) between 5 and 300),
    landmark         text check (char_length(landmark) <= 300),
    diagnosis        text check (char_length(diagnosis) <= 500),
    referring_doctor text check (char_length(referring_doctor) <= 120),
    precautions      text check (char_length(precautions) <= 1000),
    default_fee      numeric(10,2) not null default 0 check (default_fee >= 0),
    status           text not null default 'active' check (status in ('active', 'discharged')),
    notes            text check (char_length(notes) <= 2000),
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    -- lets child tables prove a row belongs to the SAME owner (see composite FKs below)
    constraint uq_patients_id_owner unique (id, owner_id)
);

-- 2.3 Care plans (plan of care, e.g. 3x/week Mon-Wed-Fri 09:00, 12 sessions)
create table public.care_plans (
    id                uuid primary key default gen_random_uuid(),
    owner_id          uuid not null default auth.uid(),
    patient_id        uuid not null,
    goal              text check (char_length(goal) <= 500),
    start_date        date not null,
    total_sessions    int  not null check (total_sessions between 1 and 200),
    days_of_week      smallint[] not null
                      check (cardinality(days_of_week) between 1 and 7
                             and days_of_week <@ array[1,2,3,4,5,6,7]::smallint[]),  -- ISO: 1=Mon … 7=Sun
    session_time      time not null,
    duration_minutes  int  not null check (duration_minutes between 15 and 240),
    fee_per_session   numeric(10,2) not null check (fee_per_session >= 0),
    reevaluation_date date,
    status            text not null default 'active'
                      check (status in ('active', 'on_hold', 'completed', 'cancelled')),
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    constraint uq_care_plans_id_patient_owner unique (id, patient_id, owner_id),
    constraint fk_care_plans_patient foreign key (patient_id, owner_id)
        references public.patients (id, owner_id) on delete restrict
);

-- 2.4 Sessions (visits) — one row per visit
create table public.sessions (
    id                uuid primary key default gen_random_uuid(),
    owner_id          uuid not null default auth.uid(),
    patient_id        uuid not null,
    care_plan_id      uuid,                 -- null = one-off visit (e.g. initial evaluation)
    session_number    int check (session_number > 0),   -- "7 of 12"; null when cancelled or one-off
    starts_at         timestamptz not null,
    ends_at           timestamptz not null,
    buffer_minutes    int check (buffer_minutes between 0 and 180),  -- null = use settings default
    status            text not null default 'scheduled'
                      check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
    charge_no_show    boolean not null default false,
    is_manually_moved boolean not null default false,
    fee               numeric(10,2) not null default 0 check (fee >= 0),
    cancel_reason     text check (char_length(cancel_reason) <= 300),
    completed_at      timestamptz,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),

    constraint ck_sessions_time  check (ends_at > starts_at and ends_at - starts_at <= interval '8 hours'),
    constraint ck_sessions_no_show_charge check (charge_no_show = false or status = 'no_show'),
    constraint uq_sessions_id_patient_owner unique (id, patient_id, owner_id),
    constraint uq_sessions_id_owner unique (id, owner_id),
    -- deferrable so renumbering can shuffle numbers inside one transaction
    constraint uq_sessions_plan_number unique (care_plan_id, session_number)
        deferrable initially immediate,
    constraint fk_sessions_patient foreign key (patient_id, owner_id)
        references public.patients (id, owner_id) on delete restrict,
    -- the plan must belong to the same patient AND owner
    constraint fk_sessions_care_plan foreign key (care_plan_id, patient_id, owner_id)
        references public.care_plans (id, patient_id, owner_id) on delete restrict,
    -- THE core rule: no two active visits may overlap in time
    constraint ex_sessions_no_overlap exclude using gist (
        owner_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
    ) where (status in ('scheduled', 'completed'))
);

-- 2.5 SOAP notes + pain scale (1:1 with a session)
create table public.session_notes (
    session_id  uuid primary key,
    owner_id    uuid not null default auth.uid(),
    subjective  text check (char_length(subjective) <= 4000),
    objective   text check (char_length(objective)  <= 4000),
    assessment  text check (char_length(assessment) <= 4000),
    plan        text check (char_length(plan)       <= 4000),
    pain_before smallint check (pain_before between 0 and 10),
    pain_after  smallint check (pain_after  between 0 and 10),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    constraint fk_session_notes_session foreign key (session_id, owner_id)
        references public.sessions (id, owner_id) on delete cascade
);

-- 2.6 Payments — per patient, optionally tied to one session
create table public.payments (
    id         uuid primary key default gen_random_uuid(),
    owner_id   uuid not null default auth.uid(),
    patient_id uuid not null,
    session_id uuid,
    amount     numeric(10,2) not null check (amount > 0 and amount <= 1000000),
    paid_on    date not null default current_date,
    method     text not null default 'cash' check (method in ('cash', 'gcash', 'maya', 'bank', 'other')),
    reference  text check (char_length(reference) <= 100),
    notes      text check (char_length(notes) <= 500),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint fk_payments_patient foreign key (patient_id, owner_id)
        references public.patients (id, owner_id) on delete restrict,
    -- the session must belong to the same patient; if a session is ever removed,
    -- keep the payment and only clear the link
    constraint fk_payments_session foreign key (session_id, patient_id, owner_id)
        references public.sessions (id, patient_id, owner_id) on delete set null (session_id)
);

-- ---------------------------------------------------------------------
-- 3. INDEXES  (owner_id first: every Row Level Security check filters on it)
-- ---------------------------------------------------------------------
create index ix_patients_owner_status_name on public.patients (owner_id, status, full_name);

create index ix_care_plans_patient      on public.care_plans (patient_id);
create index ix_care_plans_owner_status on public.care_plans (owner_id, status);

-- calendar day/week views + Today list (hottest query)
create index ix_sessions_owner_starts   on public.sessions (owner_id, starts_at) include (status);
-- upcoming visits only (small partial index)
create index ix_sessions_owner_upcoming on public.sessions (owner_id, starts_at) where status = 'scheduled';
-- patient history + pain trend
create index ix_sessions_patient_starts on public.sessions (patient_id, starts_at desc);
-- (care_plan_id, session_number) is already indexed by uq_sessions_plan_number
-- overlap checks use the GiST index created by ex_sessions_no_overlap

create index ix_payments_patient_paid on public.payments (patient_id, paid_on);
create index ix_payments_owner_paid   on public.payments (owner_id, paid_on);   -- monthly earnings
create index ix_payments_session      on public.payments (session_id) where session_id is not null;

-- ---------------------------------------------------------------------
-- 4. TRIGGERS
-- ---------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
    new.updated_at := now();
    return new;
end $$;

create trigger trg_settings_updated      before update on public.settings      for each row execute function private.set_updated_at();
create trigger trg_patients_updated      before update on public.patients      for each row execute function private.set_updated_at();
create trigger trg_care_plans_updated    before update on public.care_plans    for each row execute function private.set_updated_at();
create trigger trg_sessions_updated      before update on public.sessions      for each row execute function private.set_updated_at();
create trigger trg_session_notes_updated before update on public.session_notes for each row execute function private.set_updated_at();
create trigger trg_payments_updated      before update on public.payments      for each row execute function private.set_updated_at();

-- reject an invalid time zone name before it can break scheduling
create or replace function private.validate_timezone()
returns trigger language plpgsql set search_path = '' as $$
begin
    perform now() at time zone new.timezone;
    return new;
exception when others then
    raise exception 'Invalid time zone: %', new.timezone using errcode = '22023';
end $$;

create trigger trg_settings_timezone before insert or update of timezone on public.settings
    for each row execute function private.validate_timezone();

-- create the settings row automatically when an account signs up
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    insert into public.settings (owner_id) values (new.id) on conflict do nothing;
    return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
    for each row execute function private.handle_new_user();

-- accounts that already exist before this script ran
insert into public.settings (owner_id) select id from auth.users on conflict do nothing;

-- ---------------------------------------------------------------------
-- 5. INTERNAL HELPERS (private schema — not callable from the app)
-- ---------------------------------------------------------------------

-- Number active sessions of a plan 1..n by date; cancelled ones get no number.
create or replace function private.renumber_plan_sessions(p_plan_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
    set constraints public.uq_sessions_plan_number deferred;

    update public.sessions
       set session_number = null
     where care_plan_id = p_plan_id and status = 'cancelled' and session_number is not null;

    update public.sessions s
       set session_number = n.rn
      from (select id, row_number() over (order by starts_at)::int as rn
              from public.sessions
             where care_plan_id = p_plan_id and status <> 'cancelled') n
     where s.id = n.id
       and s.session_number is distinct from n.rn;

    set constraints public.uq_sessions_plan_number immediate;
end $$;

-- Create sessions until the plan has total_sessions non-cancelled visits.
-- Walks forward day by day on the plan's weekdays, skipping:
--   * days that already have a session of this plan (incl. cancelled ones)
--   * slots that would overlap another visit (reported back as skipped)
-- Returns {"created":[{id,starts_at}], "skipped_dates":[...]}.
create or replace function private.fill_plan_sessions(p_plan_id uuid, p_not_before date default null)
returns jsonb language plpgsql set search_path = '' as $$
declare
    v_plan    public.care_plans%rowtype;
    v_tz      text;
    v_needed  int;
    v_day     date;
    v_limit   date;
    v_start   timestamptz;
    v_end     timestamptz;
    v_id      uuid;
    v_created jsonb := '[]'::jsonb;
    v_skipped jsonb := '[]'::jsonb;
begin
    select * into v_plan from public.care_plans where id = p_plan_id for update;
    if not found or v_plan.status <> 'active' then
        return jsonb_build_object('created', v_created, 'skipped_dates', v_skipped);
    end if;

    select coalesce(st.timezone, 'Asia/Manila') into v_tz
      from public.settings st where st.owner_id = v_plan.owner_id;
    v_tz := coalesce(v_tz, 'Asia/Manila');

    select v_plan.total_sessions - count(*) into v_needed
      from public.sessions where care_plan_id = p_plan_id and status <> 'cancelled';

    v_day   := greatest(v_plan.start_date, coalesce(p_not_before, v_plan.start_date));
    v_limit := v_day + 730;   -- safety stop: never search more than 2 years ahead

    while v_needed > 0 loop
        if v_day > v_limit then
            raise exception 'Could not find enough free slots in the next 2 years for this plan'
                  using errcode = 'P0001';
        end if;

        if extract(isodow from v_day)::smallint = any (v_plan.days_of_week)
           and not exists (select 1 from public.sessions
                            where care_plan_id = p_plan_id
                              and (starts_at at time zone v_tz)::date = v_day) then

            v_start := (v_day + v_plan.session_time) at time zone v_tz;
            v_end   := v_start + make_interval(mins => v_plan.duration_minutes);

            if exists (select 1 from public.sessions s
                        where s.owner_id = v_plan.owner_id
                          and s.status in ('scheduled', 'completed')
                          and tstzrange(s.starts_at, s.ends_at, '[)') && tstzrange(v_start, v_end, '[)')) then
                v_skipped := v_skipped || to_jsonb(v_day);
            else
                insert into public.sessions (owner_id, patient_id, care_plan_id, starts_at, ends_at, fee)
                values (v_plan.owner_id, v_plan.patient_id, p_plan_id, v_start, v_end, v_plan.fee_per_session)
                returning id into v_id;

                v_created := v_created || jsonb_build_object('id', v_id, 'starts_at', v_start);
                v_needed  := v_needed - 1;
            end if;
        end if;

        v_day := v_day + 1;
    end loop;

    perform private.renumber_plan_sessions(p_plan_id);
    return jsonb_build_object('created', v_created, 'skipped_dates', v_skipped);
end $$;

-- Mark a plan completed once every planned session is used up.
create or replace function private.refresh_plan_status(p_plan_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
    update public.care_plans cp
       set status = 'completed'
     where cp.id = p_plan_id
       and cp.status = 'active'
       and not exists (select 1 from public.sessions s
                        where s.care_plan_id = cp.id and s.status = 'scheduled')
       and (select count(*) from public.sessions s
             where s.care_plan_id = cp.id and s.status in ('completed', 'no_show')) >= cp.total_sessions;
end $$;

-- Current user or error.
create or replace function private.require_user()
returns uuid language plpgsql stable set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
    if v_uid is null then
        raise exception 'Not signed in' using errcode = '28000';
    end if;
    return v_uid;
end $$;

-- Today's date in the therapist's time zone.
create or replace function private.local_today(p_owner uuid)
returns date language sql stable set search_path = '' as $$
    select (now() at time zone coalesce(
              (select timezone from public.settings where owner_id = p_owner), 'Asia/Manila'))::date;
$$;

-- ---------------------------------------------------------------------
-- 6. PUBLIC RPC FUNCTIONS  (called from the app with supabase.rpc(...))
--    SECURITY DEFINER + explicit owner_id checks = the app has NO direct
--    write access to sessions/care_plans; every change goes through here.
-- ---------------------------------------------------------------------

-- 6.1 Create a plan of care and auto-generate its sessions
create or replace function public.create_care_plan(
    p_patient_id        uuid,
    p_start_date        date,
    p_total_sessions    int,
    p_days_of_week      smallint[],
    p_session_time      time,
    p_duration_minutes  int           default null,   -- null = settings default
    p_fee_per_session   numeric       default null,   -- null = patient's default fee
    p_goal              text          default null,
    p_reevaluation_date date          default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    v_uid     uuid := private.require_user();
    v_patient public.patients%rowtype;
    v_plan_id uuid;
    v_result  jsonb;
begin
    select * into v_patient from public.patients
     where id = p_patient_id and owner_id = v_uid;
    if not found then
        raise exception 'Patient not found' using errcode = 'P0002';
    end if;
    if v_patient.status <> 'active' then
        raise exception 'Patient is discharged; reactivate them first' using errcode = 'P0001';
    end if;

    insert into public.care_plans (owner_id, patient_id, goal, start_date, total_sessions, days_of_week,
                                   session_time, duration_minutes, fee_per_session, reevaluation_date)
    values (v_uid, p_patient_id, p_goal, p_start_date, p_total_sessions,
            (select array_agg(distinct d order by d) from unnest(p_days_of_week) d),
            p_session_time,
            coalesce(p_duration_minutes,
                     (select default_session_minutes from public.settings where owner_id = v_uid), 60),
            coalesce(p_fee_per_session, v_patient.default_fee),
            p_reevaluation_date)
    returning id into v_plan_id;

    v_result := private.fill_plan_sessions(v_plan_id, null);
    return jsonb_build_object('care_plan_id', v_plan_id) || v_result;
end $$;

-- 6.2 Add more sessions to a plan (e.g. after re-evaluation)
create or replace function public.extend_care_plan(p_plan_id uuid, p_additional_sessions int)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_user();
begin
    if p_additional_sessions is null or p_additional_sessions < 1 then
        raise exception 'Additional sessions must be at least 1' using errcode = '22023';
    end if;

    update public.care_plans
       set total_sessions = total_sessions + p_additional_sessions,
           status = case when status = 'completed' then 'active' else status end
     where id = p_plan_id and owner_id = v_uid and status in ('active', 'completed');
    if not found then
        raise exception 'Active or completed plan not found' using errcode = 'P0002';
    end if;

    return private.fill_plan_sessions(p_plan_id, private.local_today(v_uid));
end $$;

-- 6.3 Change a plan's days / time / duration / fee.
--     Future auto-generated sessions are regenerated; sessions you moved
--     by hand, and anything in the past, are kept.
create or replace function public.update_care_plan_schedule(
    p_plan_id          uuid,
    p_days_of_week     smallint[],
    p_session_time     time,
    p_duration_minutes int,
    p_fee_per_session  numeric default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_user();
begin
    update public.care_plans
       set days_of_week     = (select array_agg(distinct d order by d) from unnest(p_days_of_week) d),
           session_time     = p_session_time,
           duration_minutes = p_duration_minutes,
           fee_per_session  = coalesce(p_fee_per_session, fee_per_session)
     where id = p_plan_id and owner_id = v_uid and status = 'active';
    if not found then
        raise exception 'Active plan not found' using errcode = 'P0002';
    end if;

    delete from public.sessions
     where care_plan_id = p_plan_id
       and owner_id = v_uid
       and status = 'scheduled'
       and is_manually_moved = false
       and starts_at > now();

    if p_fee_per_session is not null then
        update public.sessions set fee = p_fee_per_session
         where care_plan_id = p_plan_id and status = 'scheduled' and starts_at > now();
    end if;

    return private.fill_plan_sessions(p_plan_id, private.local_today(v_uid));
end $$;

-- 6.4 Put a plan on hold (cancels future visits) or resume it (regenerates them)
create or replace function public.set_care_plan_on_hold(p_plan_id uuid, p_on_hold boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_user();
begin
    if p_on_hold then
        update public.care_plans set status = 'on_hold'
         where id = p_plan_id and owner_id = v_uid and status = 'active';
        if not found then raise exception 'Active plan not found' using errcode = 'P0002'; end if;

        update public.sessions
           set status = 'cancelled', cancel_reason = 'Plan on hold'
         where care_plan_id = p_plan_id and status = 'scheduled' and starts_at > now();

        perform private.renumber_plan_sessions(p_plan_id);
        return jsonb_build_object('created', '[]'::jsonb, 'skipped_dates', '[]'::jsonb);
    else
        update public.care_plans set status = 'active'
         where id = p_plan_id and owner_id = v_uid and status = 'on_hold';
        if not found then raise exception 'Plan on hold not found' using errcode = 'P0002'; end if;

        return private.fill_plan_sessions(p_plan_id, private.local_today(v_uid));
    end if;
end $$;

-- 6.5 Cancel a whole plan (future visits are cancelled, history is kept)
create or replace function public.cancel_care_plan(p_plan_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_user();
begin
    update public.care_plans set status = 'cancelled'
     where id = p_plan_id and owner_id = v_uid and status in ('active', 'on_hold');
    if not found then raise exception 'Active plan not found' using errcode = 'P0002'; end if;

    update public.sessions
       set status = 'cancelled', cancel_reason = coalesce(p_reason, 'Plan cancelled')
     where care_plan_id = p_plan_id and status = 'scheduled' and starts_at > now();

    perform private.renumber_plan_sessions(p_plan_id);
end $$;

-- 6.6 One-off visit (evaluation, extra visit) — not part of a plan
create or replace function public.create_single_session(
    p_patient_id       uuid,
    p_starts_at        timestamptz,
    p_duration_minutes int     default null,
    p_fee              numeric default null,
    p_buffer_minutes   int     default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
    v_uid     uuid := private.require_user();
    v_patient public.patients%rowtype;
    v_id      uuid;
begin
    select * into v_patient from public.patients where id = p_patient_id and owner_id = v_uid;
    if not found then raise exception 'Patient not found' using errcode = 'P0002'; end if;
    if v_patient.status <> 'active' then
        raise exception 'Patient is discharged; reactivate them first' using errcode = 'P0001';
    end if;

    insert into public.sessions (owner_id, patient_id, starts_at, ends_at, fee, buffer_minutes)
    values (v_uid, p_patient_id, p_starts_at,
            p_starts_at + make_interval(mins => coalesce(p_duration_minutes,
                (select default_session_minutes from public.settings where owner_id = v_uid), 60)),
            coalesce(p_fee, v_patient.default_fee),
            p_buffer_minutes)
    returning id into v_id;

    return v_id;
exception
    when exclusion_violation then
        raise exception 'This time overlaps another visit' using errcode = '23P01';
end $$;

-- 6.7 Move one visit (keeps it out of plan regeneration)
create or replace function public.reschedule_session(
    p_session_id       uuid,
    p_new_starts_at    timestamptz,
    p_duration_minutes int default null,   -- null = keep current length
    p_buffer_minutes   int default null    -- null = keep current buffer setting
) returns void
language plpgsql security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_user();
    v_s   public.sessions%rowtype;
begin
    select * into v_s from public.sessions
     where id = p_session_id and owner_id = v_uid for update;
    if not found then raise exception 'Session not found' using errcode = 'P0002'; end if;
    if v_s.status <> 'scheduled' then
        raise exception 'Only scheduled visits can be moved' using errcode = 'P0001';
    end if;

    update public.sessions
       set starts_at         = p_new_starts_at,
           ends_at           = p_new_starts_at + coalesce(make_interval(mins => p_duration_minutes),
                                                          v_s.ends_at - v_s.starts_at),
           buffer_minutes    = coalesce(p_buffer_minutes, v_s.buffer_minutes),
           is_manually_moved = true
     where id = p_session_id;

    if v_s.care_plan_id is not null then
        perform private.renumber_plan_sessions(v_s.care_plan_id);
    end if;
exception
    when exclusion_violation then
        raise exception 'This time overlaps another visit' using errcode = '23P01';
end $$;

-- 6.8 Cancel one visit — plan visits get an automatic make-up at the end
create or replace function public.cancel_session(p_session_id uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    v_uid    uuid := private.require_user();
    v_s      public.sessions%rowtype;
    v_result jsonb := jsonb_build_object('created', '[]'::jsonb, 'skipped_dates', '[]'::jsonb);
begin
    select * into v_s from public.sessions
     where id = p_session_id and owner_id = v_uid for update;
    if not found then raise exception 'Session not found' using errcode = 'P0002'; end if;
    if v_s.status <> 'scheduled' then
        raise exception 'Only scheduled visits can be cancelled' using errcode = 'P0001';
    end if;

    update public.sessions
       set status = 'cancelled', cancel_reason = p_reason
     where id = p_session_id;

    if v_s.care_plan_id is not null then
        -- make-up: next free plan day from today onward
        v_result := private.fill_plan_sessions(v_s.care_plan_id, private.local_today(v_uid));
        perform private.renumber_plan_sessions(v_s.care_plan_id);
    end if;

    return v_result;
end $$;

-- 6.9 Mark a visit done (also used to correct a no-show)
create or replace function public.complete_session(p_session_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_user();
    v_s   public.sessions%rowtype;
begin
    select * into v_s from public.sessions
     where id = p_session_id and owner_id = v_uid for update;
    if not found then raise exception 'Session not found' using errcode = 'P0002'; end if;
    if v_s.status not in ('scheduled', 'no_show') then
        raise exception 'Only scheduled or no-show visits can be completed' using errcode = 'P0001';
    end if;
    if v_s.starts_at > now() then
        raise exception 'A visit cannot be completed before it starts' using errcode = 'P0001';
    end if;

    update public.sessions
       set status = 'completed', completed_at = now(), charge_no_show = false
     where id = p_session_id;

    if v_s.care_plan_id is not null then
        perform private.refresh_plan_status(v_s.care_plan_id);
    end if;
exception
    when exclusion_violation then
        raise exception 'This time overlaps another visit' using errcode = '23P01';
end $$;

-- 6.10 Mark a no-show, optionally charging the fee (also corrects a completed visit)
create or replace function public.mark_no_show(p_session_id uuid, p_charge boolean default false)
returns void
language plpgsql security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_user();
    v_s   public.sessions%rowtype;
begin
    select * into v_s from public.sessions
     where id = p_session_id and owner_id = v_uid for update;
    if not found then raise exception 'Session not found' using errcode = 'P0002'; end if;
    if v_s.status not in ('scheduled', 'completed') then
        raise exception 'Only scheduled or completed visits can be marked no-show' using errcode = 'P0001';
    end if;
    if v_s.starts_at > now() then
        raise exception 'A visit cannot be a no-show before it starts' using errcode = 'P0001';
    end if;

    update public.sessions
       set status = 'no_show', completed_at = null, charge_no_show = coalesce(p_charge, false)
     where id = p_session_id;

    if v_s.care_plan_id is not null then
        perform private.refresh_plan_status(v_s.care_plan_id);
    end if;
end $$;

-- 6.11 Check a time slot BEFORE saving (live form validation).
--      Returns overlaps and too-tight travel gaps; empty = all clear.
create or replace function public.check_time_slot(
    p_starts_at          timestamptz,
    p_duration_minutes   int,
    p_buffer_minutes     int  default null,
    p_exclude_session_id uuid default null
) returns table (
    issue        text,          -- 'overlap' | 'tight_before' | 'tight_after'
    session_id   uuid,
    patient_name text,
    starts_at    timestamptz,
    ends_at      timestamptz,
    gap_minutes  int,
    needed_minutes int
)
language sql stable security invoker set search_path = '' as $$
    with slot as (
        select p_starts_at as s,
               p_starts_at + make_interval(mins => p_duration_minutes) as e,
               coalesce(p_buffer_minutes,
                        (select default_buffer_minutes from public.settings where owner_id = auth.uid()), 30) as buf
    ), nearby as (
        select x.id, x.starts_at, x.ends_at, p.full_name,
               coalesce(x.buffer_minutes,
                        (select default_buffer_minutes from public.settings where owner_id = auth.uid()), 30) as buf
          from public.sessions x
          join public.patients p on p.id = x.patient_id
         cross join slot
         where x.owner_id = auth.uid()
           and x.status in ('scheduled', 'completed')
           and x.id is distinct from p_exclude_session_id
           and x.starts_at < slot.e + interval '4 hours'
           and x.ends_at   > slot.s - interval '4 hours'
    )
    select 'overlap', n.id, n.full_name, n.starts_at, n.ends_at, null::int, null::int
      from nearby n, slot
     where tstzrange(n.starts_at, n.ends_at, '[)') && tstzrange(slot.s, slot.e, '[)')
    union all
    select 'tight_before', n.id, n.full_name, n.starts_at, n.ends_at,
           (extract(epoch from slot.s - n.ends_at) / 60)::int, slot.buf
      from nearby n, slot
     where n.ends_at <= slot.s and slot.s - n.ends_at < make_interval(mins => slot.buf)
    union all
    select 'tight_after', n.id, n.full_name, n.starts_at, n.ends_at,
           (extract(epoch from n.starts_at - slot.e) / 60)::int, n.buf
      from nearby n, slot
     where n.starts_at >= slot.e and n.starts_at - slot.e < make_interval(mins => n.buf)
    order by 4;
$$;

-- 6.12 Travel-buffer warnings for a date range (calendar view badges)
create or replace function public.get_schedule_warnings(p_from timestamptz, p_to timestamptz)
returns table (session_id uuid, previous_session_id uuid, gap_minutes int, needed_minutes int)
language sql stable security invoker set search_path = '' as $$
    with active as (
        select s.id, s.starts_at, s.ends_at,
               coalesce(s.buffer_minutes, st.default_buffer_minutes, 30) as buf
          from public.sessions s
          left join public.settings st on st.owner_id = s.owner_id
         where s.owner_id = auth.uid()
           and s.status in ('scheduled', 'completed')
           and s.starts_at < p_to
           and s.ends_at   > p_from - interval '1 day'
    ), ordered as (
        select a.*, lag(a.id) over w as prev_id, lag(a.ends_at) over w as prev_ends_at
          from active a
        window w as (order by a.starts_at)
    )
    select id, prev_id,
           (extract(epoch from starts_at - prev_ends_at) / 60)::int,
           buf
      from ordered
     where prev_id is not null
       and starts_at >= p_from
       and starts_at - prev_ends_at < make_interval(mins => buf);
$$;

-- ---------------------------------------------------------------------
-- 7. VIEWS  (security_invoker = Row Level Security still applies)
-- ---------------------------------------------------------------------

-- Plan progress: "7 of 12 done, 5 remaining, next visit …"
create or replace view public.v_care_plan_progress with (security_invoker = true) as
select cp.id as care_plan_id, cp.owner_id, cp.patient_id, p.full_name as patient_name,
       cp.goal, cp.status, cp.start_date, cp.reevaluation_date,
       cp.days_of_week, cp.session_time, cp.duration_minutes, cp.fee_per_session,
       cp.total_sessions,
       s.completed, s.no_show, s.scheduled, s.cancelled,
       greatest(cp.total_sessions - s.completed - s.no_show, 0) as remaining,
       s.next_session_at, s.last_session_at
  from public.care_plans cp
  join public.patients p on p.id = cp.patient_id
 cross join lateral (
        select count(*) filter (where x.status = 'completed')::int as completed,
               count(*) filter (where x.status = 'no_show')::int   as no_show,
               count(*) filter (where x.status = 'scheduled')::int as scheduled,
               count(*) filter (where x.status = 'cancelled')::int as cancelled,
               min(x.starts_at) filter (where x.status = 'scheduled' and x.starts_at >= now()) as next_session_at,
               max(x.starts_at) filter (where x.status <> 'cancelled') as last_session_at
          from public.sessions x
         where x.care_plan_id = cp.id
       ) s;

-- Patient balance: charged (completed + charged no-shows) − paid
create or replace view public.v_patient_balances with (security_invoker = true) as
select p.id as patient_id, p.owner_id, p.full_name, p.status,
       c.total_charged, py.total_paid,
       c.total_charged - py.total_paid as balance
  from public.patients p
 cross join lateral (
        select coalesce(sum(x.fee), 0)::numeric(12,2) as total_charged
          from public.sessions x
         where x.patient_id = p.id
           and (x.status = 'completed' or (x.status = 'no_show' and x.charge_no_show))
       ) c
 cross join lateral (
        select coalesce(sum(y.amount), 0)::numeric(12,2) as total_paid
          from public.payments y
         where y.patient_id = p.id
       ) py;

-- ---------------------------------------------------------------------
-- 8. SECURITY — least privilege + Row Level Security
-- ---------------------------------------------------------------------
-- Start from zero: Supabase grants everything to anon/authenticated by default.
revoke all on public.settings, public.patients, public.care_plans, public.sessions,
              public.session_notes, public.payments,
              public.v_care_plan_progress, public.v_patient_balances
       from anon, authenticated;

-- Signed-out visitors (anon) get nothing at all.
-- Signed-in user gets only what the app needs:
grant select on public.settings to authenticated;
grant update (therapist_name, default_session_minutes, default_buffer_minutes, timezone)
      on public.settings to authenticated;

grant select, insert on public.patients to authenticated;   -- no delete: discharge instead
grant update (full_name, birth_date, sex, phone, contact_person, contact_phone, address, landmark,
              diagnosis, referring_doctor, precautions, default_fee, status, notes)
      on public.patients to authenticated;

grant select on public.care_plans to authenticated;          -- create/schedule changes via RPC only
grant update (goal, reevaluation_date) on public.care_plans to authenticated;

grant select on public.sessions to authenticated;            -- ALL session changes via RPC only

grant select, insert, delete on public.session_notes to authenticated;
grant update (subjective, objective, assessment, plan, pain_before, pain_after)
      on public.session_notes to authenticated;

grant select, insert, delete on public.payments to authenticated;
grant update (session_id, amount, paid_on, method, reference, notes)
      on public.payments to authenticated;

grant select on public.v_care_plan_progress, public.v_patient_balances to authenticated;

-- Functions: only signed-in users may call the RPCs; helpers are never callable.
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function
    public.create_care_plan(uuid, date, int, smallint[], time, int, numeric, text, date),
    public.extend_care_plan(uuid, int),
    public.update_care_plan_schedule(uuid, smallint[], time, int, numeric),
    public.set_care_plan_on_hold(uuid, boolean),
    public.cancel_care_plan(uuid, text),
    public.create_single_session(uuid, timestamptz, int, numeric, int),
    public.reschedule_session(uuid, timestamptz, int, int),
    public.cancel_session(uuid, text),
    public.complete_session(uuid),
    public.mark_no_show(uuid, boolean),
    public.check_time_slot(timestamptz, int, int, uuid),
    public.get_schedule_warnings(timestamptz, timestamptz)
  from public, anon;
grant execute on function
    public.create_care_plan(uuid, date, int, smallint[], time, int, numeric, text, date),
    public.extend_care_plan(uuid, int),
    public.update_care_plan_schedule(uuid, smallint[], time, int, numeric),
    public.set_care_plan_on_hold(uuid, boolean),
    public.cancel_care_plan(uuid, text),
    public.create_single_session(uuid, timestamptz, int, numeric, int),
    public.reschedule_session(uuid, timestamptz, int, int),
    public.cancel_session(uuid, text),
    public.complete_session(uuid),
    public.mark_no_show(uuid, boolean),
    public.check_time_slot(timestamptz, int, int, uuid),
    public.get_schedule_warnings(timestamptz, timestamptz)
  to authenticated;

-- Row Level Security: every row is visible/changeable only by its owner.
-- (select auth.uid()) is evaluated once per query instead of once per row.
alter table public.settings      enable row level security;
alter table public.patients      enable row level security;
alter table public.care_plans    enable row level security;
alter table public.sessions      enable row level security;
alter table public.session_notes enable row level security;
alter table public.payments      enable row level security;

create policy settings_owner on public.settings for all to authenticated
    using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy patients_owner on public.patients for all to authenticated
    using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy care_plans_owner on public.care_plans for all to authenticated
    using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy sessions_owner on public.sessions for all to authenticated
    using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy session_notes_owner on public.session_notes for all to authenticated
    using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy payments_owner on public.payments for all to authenticated
    using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
