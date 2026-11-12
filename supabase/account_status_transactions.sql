-- ASUPANMEME: membership lifetime and account transaction status support.
-- Safe additive migration: preserves existing users, payments, and plan rows.

-- A duration of 0 represents lifetime access. Existing positive durations remain unchanged.
alter table public.subscription_plans
  drop constraint if exists subscription_plans_duration_days_check;
alter table public.subscription_plans
  add constraint subscription_plans_duration_days_check check (duration_days >= 0);

-- Replace the review function so approving a lifetime plan stores NULL expiry.
-- Existing admin authorization and one-time review protections are retained.
create or replace function public.review_payment(
  submission_id uuid,
  approve_payment boolean,
  admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.payment_submissions%rowtype;
  p public.subscription_plans%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select * into s
  from public.payment_submissions
  where id = submission_id
  for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  if s.status <> 'pending' then
    raise exception 'Payment already reviewed';
  end if;

  if approve_payment then
    select * into p
    from public.subscription_plans
    where id = s.plan_id and active = true;

    if not found then
      raise exception 'Subscription plan unavailable';
    end if;
  end if;

  update public.payment_submissions
  set status = case when approve_payment then 'approved' else 'rejected' end,
      admin_note = review_payment.admin_note,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = submission_id;

  if approve_payment then
    update public.profiles
    set subscription_status = 'active',
        subscription_expires_at = case
          when p.duration_days = 0 then null
          else greatest(coalesce(subscription_expires_at, now()), now())
               + make_interval(days => p.duration_days)
        end
    where id = s.user_id;

    if not found then
      raise exception 'Member profile not found';
    end if;
  end if;
end;
$$;

revoke all on function public.review_payment(uuid, boolean, text) from public, anon;
grant execute on function public.review_payment(uuid, boolean, text) to authenticated;
