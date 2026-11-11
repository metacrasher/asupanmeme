-- ASUPANMEME: QRIS storage, user-visible payment status, and safe video read policy.
-- Run once in Supabase Dashboard > SQL Editor after schema.sql.

-- The QRIS is uploaded by an authenticated admin from the website dashboard.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('payment-qris','payment-qris',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "Admins upload QRIS images" on storage.objects;
create policy "Admins upload QRIS images" on storage.objects for insert to authenticated
with check(bucket_id='payment-qris' and name like 'admin/%' and public.is_admin());

drop policy if exists "Admins update QRIS images" on storage.objects;
create policy "Admins update QRIS images" on storage.objects for update to authenticated
using(bucket_id='payment-qris' and name like 'admin/%' and public.is_admin())
with check(bucket_id='payment-qris' and name like 'admin/%' and public.is_admin());

drop policy if exists "Admins delete QRIS images" on storage.objects;
create policy "Admins delete QRIS images" on storage.objects for delete to authenticated
using(bucket_id='payment-qris' and name like 'admin/%' and public.is_admin());

insert into public.site_settings(key,value) values('qris_image_url','')
on conflict(key) do nothing;

drop policy if exists "Admin sees public settings" on public.site_settings;
create policy "Admin sees public settings" on public.site_settings for select
using(key in ('payment_instructions','payment_account','qris_image_url') or public.is_admin());

-- Keep payment rows visible to their owner so the account page can show pending,
-- approved, or rejected status without exposing another user's submissions.
drop policy if exists "User sees own submissions" on public.payment_submissions;
create policy "User sees own submissions" on public.payment_submissions for select to authenticated
using(user_id=auth.uid() or public.is_admin());

create index if not exists payment_submissions_user_created_idx
on public.payment_submissions(user_id,created_at desc);

-- Guest and signed-in users can read published free videos. Premium and admin
-- visibility stays controlled by the existing membership/admin checks.
drop policy if exists "Published free videos readable" on public.videos;
create policy "Published free videos readable" on public.videos for select
using(
 published=true and (
  not is_exclusive
  or (auth.uid() is not null and exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.subscription_status='active'
      and (p.subscription_expires_at is null or p.subscription_expires_at>now())
  ))
 ) or public.is_admin()
);

-- A zero-day plan represents permanent access (NULL expiry).
alter table public.subscription_plans drop constraint if exists subscription_plans_duration_days_check;
alter table public.subscription_plans add constraint subscription_plans_duration_days_check check(duration_days>=0);
insert into public.subscription_plans(id,name,price,duration_days,active) values
 ('weekly','Premium 7 Hari',5000,7,true),
 ('lifetime','Premium Permanen',20000,0,true)
on conflict(id) do update set name=excluded.name,price=excluded.price,duration_days=excluded.duration_days,active=true;
update public.subscription_plans set active=false where id in ('monthly','quarterly');

create or replace function public.review_payment(submission_id uuid,approve_payment boolean,admin_note text default null)
returns void language plpgsql security definer set search_path=public
as $$
declare s public.payment_submissions%rowtype; p public.subscription_plans%rowtype;
begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 select * into s from public.payment_submissions where id=submission_id for update;
 if not found then raise exception 'Payment not found'; end if;
 if s.status<>'pending' then raise exception 'Payment already reviewed'; end if;
 select * into p from public.subscription_plans where id=s.plan_id and active=true;
 if not found and approve_payment then raise exception 'Subscription plan unavailable'; end if;
 update public.payment_submissions set status=case when approve_payment then 'approved' else 'rejected' end,
  admin_note=review_payment.admin_note,reviewed_by=auth.uid(),reviewed_at=now()
 where id=submission_id;
 if approve_payment then
  update public.profiles set subscription_status='active',
   subscription_expires_at=case when p.duration_days=0 then null
    else greatest(coalesce(subscription_expires_at,now()),now())+make_interval(days=>p.duration_days) end
  where id=s.user_id;
 end if;
end $$;
revoke all on function public.review_payment(uuid,boolean,text) from public;
grant execute on function public.review_payment(uuid,boolean,text) to authenticated;
