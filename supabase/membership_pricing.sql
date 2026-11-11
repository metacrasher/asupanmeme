-- ASUPANMEME membership pricing update
-- Premium 7 hari: Rp5.000. Premium permanen: Rp20.000.
-- duration_days = 0 represents permanent access (NULL expiry).

alter table public.subscription_plans drop constraint if exists subscription_plans_duration_days_check;
alter table public.subscription_plans add constraint subscription_plans_duration_days_check check(duration_days >= 0);

insert into public.subscription_plans(id,name,price,duration_days,active)
values
 ('weekly','Premium 7 Hari',5000,7,true),
 ('lifetime','Premium Permanen',20000,0,true)
on conflict(id) do update set name=excluded.name,price=excluded.price,duration_days=excluded.duration_days,active=true;

update public.subscription_plans set active=false where id in ('monthly','quarterly');

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
     subscription_expires_at=case when p.duration_days=0 then null
       else greatest(coalesce(subscription_expires_at,now()),now()) + make_interval(days=>p.duration_days) end
   where id=s.user_id;
 end if;
end $$;

revoke all on function public.review_payment(uuid,boolean,text) from public;
grant execute on function public.review_payment(uuid,boolean,text) to authenticated;
