-- ASUPANMEME Telegram admin bot membership helpers.
-- Run once in Supabase SQL Editor. Safe to re-run.

create or replace function public.telegram_grant_premium(target_email text, days_to_grant integer)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare target_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if days_to_grant < 0 or days_to_grant > 3650 then
    raise exception 'Invalid duration';
  end if;

  select id into target_id
  from auth.users
  where lower(email) = lower(trim(target_email))
  limit 1;

  if target_id is null then raise exception 'User not found'; end if;

  update public.profiles
  set subscription_status = 'active',
      subscription_expires_at = case
        when days_to_grant = 0 then null
        else greatest(coalesce(subscription_expires_at, now()), now())
             + make_interval(days => days_to_grant)
      end
  where id = target_id;

  if not found then raise exception 'Profile not found'; end if;
end;
$$;

revoke all on function public.telegram_grant_premium(text, integer) from public, anon, authenticated;
grant execute on function public.telegram_grant_premium(text, integer) to service_role;

create or replace function public.telegram_revoke_premium(target_email text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare target_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select id into target_id
  from auth.users
  where lower(email) = lower(trim(target_email))
  limit 1;

  if target_id is null then raise exception 'User not found'; end if;

  update public.profiles
  set subscription_status = 'free',
      subscription_expires_at = null
  where id = target_id;

  if not found then raise exception 'Profile not found'; end if;
end;
$$;

revoke all on function public.telegram_revoke_premium(text) from public, anon, authenticated;
grant execute on function public.telegram_revoke_premium(text) to service_role;

create or replace function public.telegram_list_users()
returns table(
  id uuid,
  email text,
  display_name text,
  role text,
  subscription_status text,
  subscription_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  return query
  select p.id, u.email::text, p.display_name, p.role,
         p.subscription_status, p.subscription_expires_at
  from public.profiles p
  join auth.users u on u.id = p.id
  order by p.created_at desc
  limit 30;
end;
$$;

revoke all on function public.telegram_list_users() from public, anon, authenticated;
grant execute on function public.telegram_list_users() to service_role;
