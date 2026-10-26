-- Step 3: get ready for your past inspections from Monday.com.
-- Paste into Supabase → SQL Editor → New query → Run.

-- 1. Match Monday's status wording ("Completed, Paid") so Looker reports keep working.
alter table public.inspections drop constraint if exists inspections_status_check;
update public.inspections set status = 'Completed, Paid' where status = 'Completed Paid';
alter table public.inspections add constraint inspections_status_check
  check (status in ('Scheduled','Inspected','Ready to Bill','Billed','Completed, Paid','On Hold'));

-- 2. Keep Monday's original ID and assessor name on imported jobs.
alter table public.inspections add column if not exists legacy_id text unique;
alter table public.inspections add column if not exists legacy_assessor text;

-- 3. Some old Monday rows are missing an address, type, assessor, billing or referral.
--    Allow blanks for history; the app's form still requires every field for new jobs.
alter table public.inspections alter column address drop not null;
alter table public.inspections alter column type drop not null;
alter table public.inspections alter column assessor_id drop not null;
alter table public.inspections alter column billing drop not null;
alter table public.inspections alter column referral_source drop not null;

-- 4. Invoice memo in the same format QuickBooks already uses:
--    "Client Name 123 Main St, Orlando, FL, USA ID: 11660652486"
alter table public.inspections drop column if exists invoice_memo;
alter table public.inspections add column invoice_memo text generated always as (
  client_name || coalesce(' ' || address, '') || ' ID: ' || coalesce(legacy_id, 'HW-' || id::text)
) stored;

-- 5. When you add a team member later, link their past Monday jobs to them by name.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text;
begin
  pname := coalesce(new.raw_app_meta_data->>'name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  insert into public.profiles (id, name, email, role, is_assessor)
  values (new.id, pname, lower(new.email),
          coalesce(new.raw_app_meta_data->>'role', 'inspector'),
          coalesce((new.raw_app_meta_data->>'is_assessor')::boolean, true))
  on conflict (id) do nothing;
  perform set_config('homewell.bulk', 'on', true);
  update public.inspections set assessor_id = new.id
   where assessor_id is null and lower(legacy_assessor) = lower(pname);
  perform set_config('homewell.bulk', 'off', true);
  return new;
end $$;

-- 6. Bulk changes (imports, linking past jobs) skip notifications and the inspector-only check.
--    Changes made directly in Supabase (no signed-in user) are also allowed.
create or replace function public.is_bulk() returns boolean language sql stable as $$
  select coalesce(current_setting('homewell.bulk', true), '') = 'on';
$$;

create or replace function public.inspections_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := case when public.is_bulk() then coalesce(new.updated_at, now()) else now() end;
  if not public.is_bulk() then new.updated_by := auth.uid(); end if;
  if tg_op = 'UPDATE' and auth.uid() is not null and not public.is_bulk() and not public.is_admin() then
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

create or replace function public.inspections_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare actor text;
begin
  if public.is_bulk() then return new; end if;
  select name into actor from profiles where id = auth.uid();
  if tg_op = 'INSERT' and new.assessor_id is not null and new.assessor_id is distinct from auth.uid() then
    insert into notifications (user_id, inspection_id, message)
    values (new.assessor_id, new.id,
      'New job assigned: ' || new.client_name || ' — ' || coalesce(new.type, 'Inspection') || ', ' ||
      to_char(new.scheduled_at at time zone 'America/New_York', 'Dy Mon DD, FMHH12:MI AM'));
  elsif tg_op = 'UPDATE' and new.assessor_id is not null and new.assessor_id is distinct from old.assessor_id then
    insert into notifications (user_id, inspection_id, message)
    values (new.assessor_id, new.id, 'Job reassigned to you: ' || new.client_name);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and auth.uid() is not null and not public.is_admin() then
    insert into notifications (user_id, inspection_id, message)
    select p.id, new.id, coalesce(actor,'An inspector') || ' marked ' || new.client_name || ' as ' || new.status
    from profiles p where p.role = 'admin' and p.active;
  end if;
  return new;
end $$;
