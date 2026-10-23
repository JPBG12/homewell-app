-- Step 2 of database setup: automatically create a team profile for each new login.
-- Paste into Supabase → SQL Editor → New query → Run.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, role, is_assessor)
  values (
    new.id,
    coalesce(new.raw_app_meta_data->>'name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    lower(new.email),
    coalesce(new.raw_app_meta_data->>'role', 'inspector'),
    coalesce((new.raw_app_meta_data->>'is_assessor')::boolean, true)
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
