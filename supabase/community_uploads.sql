-- ASUPANMEME community video uploads and admin moderation
-- Run once in Supabase SQL Editor. Existing site data and payment settings are preserved.

alter table public.videos
  add column if not exists uploader_id uuid references public.profiles(id) on delete set null;

-- Private source video bucket; playback is delivered through the signed-URL API.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('media-videos','media-videos',false,524288000,array['video/mp4','video/webm','video/quicktime'])
on conflict(id) do update set public=false, file_size_limit=524288000,
  allowed_mime_types=array['video/mp4','video/webm','video/quicktime'];

-- Public thumbnails are separate from protected video files.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('video-thumbnails','video-thumbnails',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true, file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

-- Every signed-in member may upload only into their own UUID folder.
drop policy if exists "Members upload own video files" on storage.objects;
create policy "Members upload own video files"
on storage.objects for insert to authenticated
with check (bucket_id='media-videos' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "Members upload own thumbnails" on storage.objects;
create policy "Members upload own thumbnails"
on storage.objects for insert to authenticated
with check (bucket_id='video-thumbnails' and (storage.foldername(name))[1]=auth.uid()::text);

-- Admin can delete any video object; a member can delete only their own pending uploads.
drop policy if exists "Owners or admins delete video files" on storage.objects;
create policy "Owners or admins delete video files"
on storage.objects for delete to authenticated
using (bucket_id='media-videos' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));

drop policy if exists "Owners or admins delete thumbnails" on storage.objects;
create policy "Owners or admins delete thumbnails"
on storage.objects for delete to authenticated
using (bucket_id='video-thumbnails' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));

-- Members can submit free videos only. They cannot publish or mark content exclusive.
drop policy if exists "Members submit free videos for review" on public.videos;
create policy "Members submit free videos for review"
on public.videos for insert to authenticated
with check (
  uploader_id=auth.uid()
  and is_exclusive=false
  and published=false
);

-- Existing "Admins manage videos" policy remains the only update/delete route.
-- The admin dashboard can publish submissions and set is_exclusive.
