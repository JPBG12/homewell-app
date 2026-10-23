-- HomeWell Inspections — database setup
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run once on a new, empty project.

-- ───────────────────────── Team members ─────────────────────────
-- One row per person who can sign in. Linked to Supabase's built-in login table.
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  email       text not null unique,
  role        text not null default 'inspector' check (role in ('admin','inspector')),
  is_assessor boolean not null default true,
  active      boolean not null default true,      -- "Remove" sets this to false; history is kept
  created_at  timestamptz not null default now()
);

-- Helper: is the signed-in person an active admin?
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and active);
$$;

-- ───────────────────────── Pick lists ─────────────────────────
create table public.referral_sources (
  id    bigint generated always as identity primary key,
  name  text not null unique,
  active boolean not null default true
);

create table public.app_settings (
  id          int primary key default 1 check (id = 1),   -- single row
  appt_hours  numeric(3,1) not null default 2.0
);
insert into public.app_settings default values;

-- ───────────────────────── Inspections ─────────────────────────
create table public.inspections (
  id            bigint generated always as identity (start with 1040) primary key,
  code          text generated always as ('HW-' || id::text) stored unique,
  client_name   text not null,
  address       text not null,
  lat           double precision,
  lng           double precision,
  place_id      text,                                  -- Google place reference from autocomplete
  type          text not null check (type in ('Mold Assessment','PRV','Peace of Mind','Other')),
  scheduled_at  timestamptz not null,
  assessor_id   uuid not null references public.profiles(id),
  referral_source text not null,
  billing       text not null check (billing in ('Cash Job','Bill Vendor','Bill Insurance','Contractor','Other')),
  status        text not null default 'Scheduled'
                check (status in ('Scheduled','Inspected','Ready to Bill','Billed','Completed Paid','On Hold')),
  report_sent   boolean not null default false,
  notes         text,
  invoice_memo  text generated always as (client_name || ' · HW-' || id::text) stored,
  created_by    uuid references public.profiles(id) default auth.uid(),
  updated_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index inspections_assessor_day on public.inspections (assessor_id, scheduled_at);
create index inspections_status on public.inspections (status);

-- Stamp who/when on every change, and stop inspectors from editing anything but status.
create or replace function public.inspections_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'UPDATE' and not public.is_admin() then
    if (new.client_name, new.address, new.lat, new.lng, new.place_id, new.type, new.scheduled_at,
        new.assessor_id, new.referral_source, new.billing, new.report_sent, new.notes)
       is distinct from
       (old.client_name, old.address, old.lat, old.lng, old.place_id, old.type, old.scheduled_at,
        old.assessor_id, old.referral_source, old.billing, old.report_sent, old.notes) then
      raise exception 'Inspectors can only change the status. Ask an admin to edit other details.';
    end if;
  end if;
  return new;
end $$;
create trigger inspections_guard before insert or update on public.inspections
  for each row execute function public.inspections_guard();

-- ───────────────────────── Notifications ─────────────────────────
create table public.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  inspection_id bigint references public.inspections(id) on delete cascade,
  message     text not null,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Phone push subscriptions (one per device that tapped "Allow notifications")
create table public.push_subscriptions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique,
  keys        jsonb not null,
  created_at  timestamptz not null default now()
);

-- New job → notify the assessor. Inspector status change → notify the admins.
create or replace function public.inspections_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare actor text;
begin
  select name into actor from profiles where id = auth.uid();
  if tg_op = 'INSERT' and new.assessor_id is distinct from auth.uid() then
    insert into notifications (user_id, inspection_id, message)
    values (new.assessor_id, new.id,
      'New job assigned: ' || new.client_name || ' — ' || new.type || ', ' ||
      to_char(new.scheduled_at at time zone 'America/New_York', 'Dy Mon DD, FMHH12:MI AM'));
  elsif tg_op = 'UPDATE' and new.assessor_id is distinct from old.assessor_id then
    insert into notifications (user_id, inspection_id, message)
    values (new.assessor_id, new.id, 'Job reassigned to you: ' || new.client_name);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and not public.is_admin() then
    insert into notifications (user_id, inspection_id, message)
    select p.id, new.id, coalesce(actor,'An inspector') || ' marked ' || new.client_name || ' as ' || new.status
    from profiles p where p.role = 'admin' and p.active;
  end if;
  return new;
end $$;
create trigger inspections_notify after insert or update on public.inspections
  for each row execute function public.inspections_notify();

-- ───────────────────────── Security (who can see what) ─────────────────────────
alter table public.profiles          enable row level security;
alter table public.referral_sources  enable row level security;
alter table public.app_settings      enable row level security;
alter table public.inspections       enable row level security;
alter table public.notifications     enable row level security;
alter table public.push_subscriptions enable row level security;

-- Team list: everyone signed in can read it (for names); only admins change it.
create policy "team readable" on public.profiles for select to authenticated using (true);
create policy "admins manage team" on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Pick lists and settings: everyone reads, admins change.
create policy "refs readable" on public.referral_sources for select to authenticated using (true);
create policy "admins manage refs" on public.referral_sources for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "settings readable" on public.app_settings for select to authenticated using (true);
create policy "admins manage settings" on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Inspections: admins see and do everything; inspectors see and update only their own.
create policy "admins all inspections" on public.inspections for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "inspectors see own" on public.inspections for select to authenticated
  using (assessor_id = auth.uid());
create policy "inspectors update own" on public.inspections for update to authenticated
  using (assessor_id = auth.uid()) with check (assessor_id = auth.uid());

-- Notifications and devices: each person only their own.
create policy "own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "mark own read" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own devices" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Live updates: the app refreshes instantly when someone else changes a job.
alter publication supabase_realtime add table public.inspections, public.notifications;

-- ───────────────────────── Starting data ─────────────────────────
insert into public.referral_sources (name) values
  ('Google'), ('Repeat Client'), ('Insurance Adjuster'), ('Other');
-- Your full referral list gets imported from the Google Sheet in a later step.
