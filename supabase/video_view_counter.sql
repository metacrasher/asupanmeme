-- ASUPANMEME: securely increment video views when playback starts.
-- Run once in Supabase Dashboard > SQL Editor.

create or replace function public.increment_video_view(target_video_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_views bigint;
begin
  update public.videos v
  set views = coalesce(v.views, 0) + 1
  where v.id = target_video_id
    and v.published = true
    and (
      not v.is_exclusive
      or public.is_admin()
      or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.subscription_status = 'active'
          and (p.subscription_expires_at is null or p.subscription_expires_at > now())
      )
    )
  returning v.views into updated_views;

  if updated_views is null then
    raise exception 'Video tidak tersedia atau akses membership tidak aktif.';
  end if;

  return updated_views;
end;
$$;

revoke all on function public.increment_video_view(uuid) from public;
grant execute on function public.increment_video_view(uuid) to anon, authenticated;
