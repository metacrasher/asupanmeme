-- Public video contributions: anyone can upload, but every non-admin submission waits for admin approval.
alter table public.videos add column if not exists uploader_id uuid references auth.users(id) on delete set null;
alter table public.videos add column if not exists storage_path text;
alter table public.videos add column if not exists storage_provider text not null default 'supabase';
alter table public.videos alter column published set default false;

drop policy if exists "Public can submit videos for review" on public.videos;
create policy "Public can submit videos for review" on public.videos
for insert to anon, authenticated
with check (
  published = false
  and is_exclusive = false
  and uploader_id is null
  and storage_provider = 'r2'
  and storage_path like 'public/%'
);

-- Ensure the thumbnail bucket exists and serves approved public thumbnails.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('video-thumbnails', 'video-thumbnails', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- Community thumbnails are isolated under the public/ folder.
drop policy if exists "Public can upload review thumbnails" on storage.objects;
create policy "Public can upload review thumbnails" on storage.objects
for insert to anon, authenticated
with check (bucket_id = 'video-thumbnails' and (storage.foldername(name))[1] = 'public');

-- Public thumbnails can be displayed after admin approves the video.
drop policy if exists "Public can read review thumbnails" on storage.objects;
create policy "Public can read review thumbnails" on storage.objects
for select to anon, authenticated
using (bucket_id = 'video-thumbnails' and (storage.foldername(name))[1] = 'public');
