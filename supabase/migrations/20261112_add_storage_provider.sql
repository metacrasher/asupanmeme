-- ASUPANMEME: enable hybrid Supabase Storage + Cloudflare R2.
-- Run once in Supabase Dashboard -> SQL Editor before uploading videos to R2.
alter table public.videos
  add column if not exists storage_provider text not null default 'supabase';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'videos_storage_provider_check'
      and conrelid = 'public.videos'::regclass
  ) then
    alter table public.videos
      add constraint videos_storage_provider_check
      check (storage_provider in ('supabase', 'r2'));
  end if;
end $$;

-- Existing rows automatically remain storage_provider='supabase'.
