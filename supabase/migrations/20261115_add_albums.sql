-- Additive album feature; existing video and membership records remain untouched.
create table if not exists public.albums (
 id uuid primary key default gen_random_uuid(),
 title text not null check (char_length(trim(title)) between 1 and 120),
 description text not null default '',
 cover_url text,
 is_exclusive boolean not null default false,
 published boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.album_videos (
 album_id uuid not null references public.albums(id) on delete cascade,
 video_id uuid not null references public.videos(id) on delete cascade,
 sort_order integer not null default 0,
 created_at timestamptz not null default now(),
 primary key (album_id, video_id)
);
create index if not exists album_videos_album_order_idx on public.album_videos(album_id,sort_order,created_at);
alter table public.albums enable row level security;
alter table public.album_videos enable row level security;
drop policy if exists "Published albums are readable" on public.albums;
create policy "Published albums are readable" on public.albums for select to anon,authenticated using(published=true or public.is_admin());
drop policy if exists "Admins manage albums" on public.albums;
create policy "Admins manage albums" on public.albums for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "Published album items are readable" on public.album_videos;
create policy "Published album items are readable" on public.album_videos for select to anon,authenticated using(exists(
 select 1 from public.albums a
 where a.id=album_videos.album_id and a.published=true
 and (
  public.is_admin()
  or a.is_exclusive=false
  or exists(
   select 1 from public.profiles p
   where p.id=auth.uid()
   and p.subscription_status='active'
   and (p.subscription_expires_at is null or p.subscription_expires_at>now())
  )
 )
));
drop policy if exists "Admins manage album items" on public.album_videos;
create policy "Admins manage album items" on public.album_videos for all to authenticated using(public.is_admin()) with check(public.is_admin());
grant select on public.albums,public.album_videos to anon,authenticated;
grant insert,update,delete on public.albums,public.album_videos to authenticated;
create or replace function public.set_album_videos(p_album_id uuid,p_video_ids uuid[])
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Akses admin diperlukan'; end if;
 if not exists(select 1 from public.albums where id=p_album_id) then raise exception 'Album tidak ditemukan'; end if;
 delete from public.album_videos where album_id=p_album_id;
 insert into public.album_videos(album_id,video_id,sort_order)
 select p_album_id,item.video_id,(item.ordinality-1)::integer
 from unnest(coalesce(p_video_ids,array[]::uuid[])) with ordinality as item(video_id,ordinality)
 join public.videos v on v.id=item.video_id;
end;
$$;
revoke all on function public.set_album_videos(uuid,uuid[]) from public;
grant execute on function public.set_album_videos(uuid,uuid[]) to authenticated;
