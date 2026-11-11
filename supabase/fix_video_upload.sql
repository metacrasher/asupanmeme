-- ASUPANMEME video upload repair
-- Run this entire file once in Supabase Dashboard > SQL Editor.
-- Safe to re-run: columns, buckets and policies are created idempotently.

-- The frontend writes both storage_path and uploader_id when a video is submitted.
alter table public.videos
  add column if not exists storage_path text,
  add column if not exists uploader_id uuid references public.profiles(id) on delete set null;

-- Private video bucket: playback is served only through api/playback.js signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media-videos',
  'media-videos',
  false,
  524288000,
  array['video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
set public = false,
    file_size_limit = 524288000,
    allowed_mime_types = array['video/mp4', 'video/webm', 'video/quicktime'];

-- Public thumbnail bucket; video files themselves remain private.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'video-thumbnails',
  'video-thumbnails',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Signed-in users can upload only into a folder named with their own auth UUID.
drop policy if exists "Members upload own video files" on storage.objects;
create policy "Members upload own video files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'media-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Members upload own thumbnails" on storage.objects;
create policy "Members upload own thumbnails"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'video-thumbnails'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Owners or admins delete video files" on storage.objects;
create policy "Owners or admins delete video files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'media-videos'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

drop policy if exists "Owners or admins delete thumbnails" on storage.objects;
create policy "Owners or admins delete thumbnails"
on storage.objects for delete to authenticated
using (
  bucket_id = 'video-thumbnails'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

-- Non-admin members may submit free videos for review, but cannot publish or
-- mark their own uploads as exclusive. The existing admin policy is preserved.
drop policy if exists "Members submit free videos for review" on public.videos;
create policy "Members submit free videos for review"
on public.videos for insert to authenticated
with check (
  uploader_id = auth.uid()
  and is_exclusive = false
  and published = false
);

 
-- Allow signed playback URLs only for published videos the current visitor can see.
-- This uses the public/publishable key with RLS; no service_role key is required.
drop policy if exists "Playback signed URLs for visible videos" on storage.objects;
create policy "Playback signed URLs for visible videos"
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'media-videos'
  and exists (
    select 1
    from public.videos v
    where v.storage_path = storage.objects.name
      and v.published = true
      and (
        not v.is_exclusive
        or public.is_admin()
        or exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.subscription_status = 'active'
            and (p.subscription_expires_at is null or p.subscription_expires_at > now())
        )
      )
  )
);
