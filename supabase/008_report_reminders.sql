-- Step 8: daily phone reminder for reports not sent yet.
-- Every morning at about 8 AM Eastern, Tati (contact@homewellinc.com) gets a notification
-- for each job still marked "Inspected" whose inspection date was 4, 5, 6, 7 or 8 days ago.
-- (The emails come from the Google Sheet's Apps Script; this is the phone alert.)
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run again.

create extension if not exists pg_cron;

create or replace function public.report_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into notifications (user_id, inspection_id, message)
  select p.id, i.id,
         'Report overdue (' || d.days || ' days): ' || i.client_name || ' - ' ||
         coalesce((select name from profiles where id = i.assessor_id), i.legacy_assessor, 'Unassigned')
  from inspections i
  cross join lateral (
    select (now() at time zone 'America/New_York')::date
         - (i.scheduled_at at time zone 'America/New_York')::date as days
  ) d
  join profiles p on lower(p.email) = 'contact@homewellinc.com' and p.active
  where i.status = 'Inspected' and d.days between 4 and 8;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.report_reminders() from public, anon, authenticated;

-- Runs every day at 12:05 UTC = 8:05 AM Eastern in summer, 7:05 AM in winter.
select cron.unschedule('report-reminders') where exists (select 1 from cron.job where jobname = 'report-reminders');
select cron.schedule('report-reminders', '5 12 * * *', 'select public.report_reminders()');
