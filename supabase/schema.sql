-- ASUPANMEME database setup
-- Run this file in Supabase SQL Editor. Create the storage bucket "payment-proofs" as PRIVATE.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text,
 role text not null default 'user' check (role in ('user','admin')),
 subscription_status text not null default 'free' check (subscription_status in ('free','pending','active','expired','rejected')),
 subscription_expires_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.subscription_plans (
 id text primary key,
 name text not null,
 price integer not null check(price >= 0),
 duration_days integer not null check(duration_days > 0),
 active boolean not null default true
);
insert into public.subscription_plans(id,name,price,duration_days) values
 ('monthly','1 Bulan',35000,30),('quarterly','3 Bulan',90000,90)
on conflict(id) do nothing;

create table if not exists public.videos (
 id uuid primary key default gen_random_uuid(),
 title text not null,
 description text,
 thumbnail_url text,
 video_url text,
 duration text,
 views bigint not null default 0,
 is_exclusive boolean not null default false,
 published boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists public.payment_submissions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 plan_id text not null references public.subscription_plans(id),
 plan_name text not null,
 amount integer not null check(amount > 0),
 sender_name text not null,
 payment_method text not null,
 note text,
 proof_path text not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 admin_note text,
 reviewed_by uuid references public.profiles(id),
 reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.site_settings (
 key text primary key,
 value text not null default ''
);
insert into public.site_settings(key,value) values
 ('payment_instructions','Silakan hubungi admin untuk instruksi pembayaran.'),
 ('payment_account','')
on conflict(key) do nothing;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin') $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$ begin
 insert into public.profiles(id,display_name) values(new.id,coalesce(new.raw_user_meta_data->>'display_name','Member'));
 return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.videos enable row level security;
alter table public.payment_submissions enable row level security;
alter table public.site_settings enable row level security;

create policy "Profiles readable by owner or admin" on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
-- No client-side UPDATE policy on profiles: users must never edit their own role or subscription status.
create policy "Active plans public read" on public.subscription_plans for select using(active=true or public.is_admin());
create policy "Published free videos readable" on public.videos for select using(published=true and (not is_exclusive or (auth.uid() is not null and exists(select 1 from public.profiles p where p.id=auth.uid() and p.subscription_status='active' and p.subscription_expires_at>now()))) or public.is_admin());
create policy "Admins manage videos" on public.videos for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "User sees own submissions" on public.payment_submissions for select to authenticated using(user_id=auth.uid() or public.is_admin());
create policy "User submits own payment" on public.payment_submissions for insert to authenticated with check(user_id=auth.uid() and status='pending' and reviewed_by is null and reviewed_at is null);

-- Ignore client-supplied prices and names; always copy current plan values from the database.
create or replace function public.set_payment_plan_values()
returns trigger language plpgsql security definer set search_path=public
as $$
 declare p public.subscription_plans%rowtype;
begin
 select * into p from public.subscription_plans where id=new.plan_id and active=true;
 if not found then raise exception 'Subscription plan unavailable'; end if;
 new.plan_name := p.name;
 new.amount := p.price;
 return new;
end $$;
drop trigger if exists before_payment_submission_insert on public.payment_submissions;
create trigger before_payment_submission_insert before insert on public.payment_submissions
for each row execute function public.set_payment_plan_values();
create policy "Admin sees public settings" on public.site_settings for select using(key in ('payment_instructions','payment_account') or public.is_admin());
create policy "Admin manages settings" on public.site_settings for all to authenticated using(public.is_admin()) with check(public.is_admin());

-- Only this SECURITY DEFINER function can approve/reject and grant membership.
create or replace function public.review_payment(submission_id uuid, approve_payment boolean, admin_note text default null)
returns void language plpgsql security definer set search_path=public
as $$
declare s public.payment_submissions%rowtype; p public.subscription_plans%rowtype;
begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 select * into s from public.payment_submissions where id=submission_id for update;
 if not found then raise exception 'Payment not found'; end if;
 if s.status <> 'pending' then raise exception 'Payment already reviewed'; end if;
 update public.payment_submissions set status=case when approve_payment then 'approved' else 'rejected' end,
 admin_note=review_payment.admin_note, reviewed_by=auth.uid(), reviewed_at=now() where id=submission_id;
 if approve_payment then
   select * into p from public.subscription_plans where id=s.plan_id and active=true;
   if not found then raise exception 'Subscription plan unavailable'; end if;
   update public.profiles set subscription_status='active',
     subscription_expires_at=greatest(coalesce(subscription_expires_at,now()),now()) + make_interval(days=>p.duration_days)
   where id=s.user_id;
 end if;
end $$;
revoke all on function public.review_payment(uuid,boolean,text) from public;
grant execute on function public.review_payment(uuid,boolean,text) to authenticated;

-- Storage: create a PRIVATE bucket named payment-proofs in Supabase Storage.
-- Each member may upload/read only within their own UUID folder. Admins can read all.
create policy "Member uploads own payment proof" on storage.objects for insert to authenticated
with check(bucket_id='payment-proofs' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Owner or admin reads payment proof" on storage.objects for select to authenticated
using(bucket_id='payment-proofs' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));

-- IMPORTANT: after creating your account, promote your own user ID to admin from SQL Editor:
-- update public.profiles set role='admin' where id=(select id from auth.users where email='YOUR_EMAIL');
-- Never expose the Supabase service_role key in config.js or browser code.
