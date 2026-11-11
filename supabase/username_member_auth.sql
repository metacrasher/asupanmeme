-- ASUPANMEME: username-only registration for members.
-- Admin accounts continue to use their existing email address.
alter table public.profiles add column if not exists username text;

create unique index if not exists profiles_username_lower_unique
on public.profiles (lower(username))
where username is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  new_username text;
begin
  new_username := lower(trim(coalesce(new.raw_user_meta_data->>'username', '')));
  if new_username = '' then
    insert into public.profiles(id, display_name)
    values(new.id, coalesce(new.raw_user_meta_data->>'display_name', 'Member'));
  else
    if new_username !~ '^[a-z0-9][a-z0-9._-]{2,23}$' then
      raise exception 'Username must be 3-24 characters using letters, numbers, dot, underscore or hyphen';
    end if;
    if new_username in ('admin','administrator','support','asupanmeme','owner') then
      raise exception 'This username is reserved';
    end if;
    insert into public.profiles(id, username, display_name)
    values(new.id, new_username, new_username);
  end if;
  return new;
end;
$$;
