-- Step 5: Google Sheet backup + iPhone push notifications.
-- Paste into Supabase → SQL Editor → New query → Run.
create extension if not exists pg_net with schema extensions;

-- Private settings, not reachable from the app or the internet.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.settings (key text primary key, value text not null);
insert into private.settings (key, value) values
  ('sheet_url',    'PASTE_APPS_SCRIPT_URL_HERE'),
  ('sheet_secret', 'PASTE_SHEET_SECRET_HERE'),
  ('push_url',     'https://homewell-app.vercel.app/api/push'),
  ('push_secret',  'PASTE_PUSH_SECRET_HERE')
on conflict (key) do update set value = excluded.value;

create or replace function private.setting(k text) returns text
language sql stable security definer set search_path = private as $$ select value from private.settings where key = k $$;

-- Every new, changed or deleted inspection is sent to the Google Sheet.
create or replace function public.inspections_to_sheet() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare r public.inspections; body jsonb;
begin
  if public.is_bulk() then return null; end if;
  r := coalesce(new, old);
  if private.setting('sheet_url') is null or private.setting('sheet_url') like 'PASTE%' then return null; end if;
  body := jsonb_build_object(
    'secret', private.setting('sheet_secret'),
    'action', case when tg_op = 'DELETE' then 'delete' else 'upsert' end,
    'unique_id', coalesce(r.legacy_id, r.code),
    'client_name', r.client_name, 'address', r.address, 'type', r.type, 'status', r.status,
    'scheduled_at', r.scheduled_at, 'referral_source', r.referral_source, 'billing', r.billing,
    'report_sent', r.report_sent, 'invoice_memo', r.invoice_memo,
    'assessor', coalesce((select name from profiles where id = r.assessor_id), r.legacy_assessor),
    'created_by', (select email from profiles where id = r.created_by), 'created_at', r.created_at,
    'updated_by', (select email from profiles where id = coalesce(r.updated_by, r.created_by)), 'updated_at', r.updated_at);
  perform net.http_post(url := private.setting('sheet_url'), body := body, timeout_milliseconds := 10000);
  return null;
end $$;
drop trigger if exists inspections_to_sheet on public.inspections;
create trigger inspections_to_sheet after insert or update or delete on public.inspections
  for each row execute function public.inspections_to_sheet();

-- Every new notification is sent to that person's phones.
create or replace function public.notifications_to_push() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if private.setting('push_secret') like 'PASTE%' then return null; end if;
  perform net.http_post(
    url := private.setting('push_url'),
    body := jsonb_build_object('user_id', new.user_id, 'message', new.message, 'inspection_id', new.inspection_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', private.setting('push_secret')),
    timeout_milliseconds := 10000);
  return null;
end $$;
drop trigger if exists notifications_to_push on public.notifications;
create trigger notifications_to_push after insert on public.notifications
  for each row execute function public.notifications_to_push();
