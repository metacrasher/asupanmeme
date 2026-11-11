-- ASUPANMEME: allow members to publish their own free video uploads immediately.
-- Members cannot publish exclusive videos or change existing video records.
drop policy if exists "Members submit free videos for review" on public.videos;
drop policy if exists "Members publish own free videos" on public.videos;
create policy "Members publish own free videos"
on public.videos for insert to authenticated
with check (
  uploader_id = auth.uid()
  and published = true
  and is_exclusive = false
);
