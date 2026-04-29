-- MarketingManagementKyros V3 Supabase RLS policy matrix
-- Run this in the Supabase SQL editor after supabase_schema.sql has been applied.

-- Helper functions run as SECURITY DEFINER so RLS policies can safely inspect
-- public.users without recursively depending on public.users RLS.

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from public.users u
  where u.auth_user_id = (select auth.uid())
    and u.status = 'active'
  limit 1
$$;

create or replace function public.current_app_user_outlet_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.outlet_id
  from public.users u
  where u.auth_user_id = (select auth.uid())
    and u.status = 'active'
  limit 1
$$;

create or replace function public.is_active_app_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where u.auth_user_id = (select auth.uid())
      and u.status = 'active'
  )
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where u.auth_user_id = (select auth.uid())
      and u.role = 'admin'
      and u.status = 'active'
  )
$$;

create or replace function public.claim_user_profile()
returns public.users
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_profile public.users;
  auth_email text;
begin
  if (select auth.uid()) is null then
    return null;
  end if;

  auth_email := lower(coalesce((select auth.jwt() ->> 'email'), ''));

  if auth_email = '' then
    return null;
  end if;

  select *
  into claimed_profile
  from public.users u
  where u.auth_user_id = (select auth.uid())
  limit 1;

  if claimed_profile.id is not null then
    return claimed_profile;
  end if;

  update public.users u
  set
    auth_user_id = (select auth.uid()),
    updated_at = now()
  where u.auth_user_id is null
    and lower(u.email) = auth_email
  returning * into claimed_profile;

  return claimed_profile;
end;
$$;

create or replace function public.is_current_app_user(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id is not null
    and target_user_id = (select public.current_app_user_id())
$$;

create or replace function public.owns_outlet(target_outlet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_outlet_id is not null
    and target_outlet_id = (select public.current_app_user_outlet_id())
$$;

create or replace function public.can_access_campaign(target_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_campaign_id is not null
    and (
      (select public.is_admin())
      or exists (
        select 1
        from public.campaigns c
        where c.id = target_campaign_id
          and (select public.is_current_app_user(c.owner_user_id))
      )
      or exists (
        select 1
        from public.events e
        where e.campaign_id = target_campaign_id
          and (select public.owns_outlet(e.outlet_id))
      )
      or exists (
        select 1
        from public.mall_displays md
        where md.campaign_id = target_campaign_id
          and (select public.owns_outlet(md.outlet_id))
      )
      or exists (
        select 1
        from public.social_posts sp
        where sp.campaign_id = target_campaign_id
          and (select public.owns_outlet(sp.outlet_id))
      )
    )
$$;

create or replace function public.can_update_campaign(target_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_campaign_id is not null
    and (
      (select public.is_admin())
      or exists (
        select 1
        from public.campaigns c
        where c.id = target_campaign_id
          and (select public.is_current_app_user(c.owner_user_id))
      )
    )
$$;

revoke all on function public.current_app_user_id() from public;
revoke all on function public.current_app_user_outlet_id() from public;
revoke all on function public.is_active_app_user() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.claim_user_profile() from public;
revoke all on function public.is_current_app_user(uuid) from public;
revoke all on function public.owns_outlet(uuid) from public;
revoke all on function public.can_access_campaign(uuid) from public;
revoke all on function public.can_update_campaign(uuid) from public;

grant execute on function public.current_app_user_id() to authenticated;
grant execute on function public.current_app_user_outlet_id() to authenticated;
grant execute on function public.is_active_app_user() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.claim_user_profile() to authenticated;
grant execute on function public.is_current_app_user(uuid) to authenticated;
grant execute on function public.owns_outlet(uuid) to authenticated;
grant execute on function public.can_access_campaign(uuid) to authenticated;
grant execute on function public.can_update_campaign(uuid) to authenticated;

-- public.users
alter table public.users enable row level security;
drop policy if exists "users_admin_all" on public.users;
drop policy if exists "users_self_select" on public.users;
create policy "users_admin_all" on public.users
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "users_self_select" on public.users
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

-- public.outlets
alter table public.outlets enable row level security;
drop policy if exists "outlets_admin_all" on public.outlets;
drop policy if exists "outlets_pic_select_assigned" on public.outlets;
create policy "outlets_admin_all" on public.outlets
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "outlets_pic_select_assigned" on public.outlets
  for select to authenticated
  using ((select public.owns_outlet(id)));

-- public.settings
alter table public.settings enable row level security;
drop policy if exists "settings_admin_all" on public.settings;
drop policy if exists "settings_active_select" on public.settings;
create policy "settings_admin_all" on public.settings
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "settings_active_select" on public.settings
  for select to authenticated
  using ((select public.is_active_app_user()));

-- public.campaigns
alter table public.campaigns enable row level security;
drop policy if exists "campaigns_admin_all" on public.campaigns;
drop policy if exists "campaigns_visible_select" on public.campaigns;
drop policy if exists "campaigns_owner_insert" on public.campaigns;
drop policy if exists "campaigns_owner_update" on public.campaigns;
create policy "campaigns_admin_all" on public.campaigns
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "campaigns_visible_select" on public.campaigns
  for select to authenticated
  using ((select public.can_access_campaign(id)));
create policy "campaigns_owner_insert" on public.campaigns
  for insert to authenticated
  with check ((select public.is_current_app_user(owner_user_id)));
create policy "campaigns_owner_update" on public.campaigns
  for update to authenticated
  using ((select public.is_current_app_user(owner_user_id)))
  with check ((select public.is_current_app_user(owner_user_id)));

-- public.campaign_checklist_items
alter table public.campaign_checklist_items enable row level security;
drop policy if exists "campaign_checklist_items_admin_all" on public.campaign_checklist_items;
drop policy if exists "campaign_checklist_items_campaign_select" on public.campaign_checklist_items;
drop policy if exists "campaign_checklist_items_campaign_insert" on public.campaign_checklist_items;
drop policy if exists "campaign_checklist_items_campaign_update" on public.campaign_checklist_items;
create policy "campaign_checklist_items_admin_all" on public.campaign_checklist_items
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "campaign_checklist_items_campaign_select" on public.campaign_checklist_items
  for select to authenticated
  using ((select public.can_access_campaign(campaign_id)));
create policy "campaign_checklist_items_campaign_insert" on public.campaign_checklist_items
  for insert to authenticated
  with check ((select public.can_update_campaign(campaign_id)));
create policy "campaign_checklist_items_campaign_update" on public.campaign_checklist_items
  for update to authenticated
  using ((select public.can_update_campaign(campaign_id)))
  with check ((select public.can_update_campaign(campaign_id)));

-- public.checklist_templates
alter table public.checklist_templates enable row level security;
drop policy if exists "checklist_templates_admin_all" on public.checklist_templates;
drop policy if exists "checklist_templates_active_select" on public.checklist_templates;
create policy "checklist_templates_admin_all" on public.checklist_templates
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "checklist_templates_active_select" on public.checklist_templates
  for select to authenticated
  using ((select public.is_active_app_user()));

-- public.checklist_template_items
alter table public.checklist_template_items enable row level security;
drop policy if exists "checklist_template_items_admin_all" on public.checklist_template_items;
drop policy if exists "checklist_template_items_active_select" on public.checklist_template_items;
create policy "checklist_template_items_admin_all" on public.checklist_template_items
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "checklist_template_items_active_select" on public.checklist_template_items
  for select to authenticated
  using ((select public.is_active_app_user()));

-- public.partnerships
alter table public.partnerships enable row level security;
drop policy if exists "partnerships_admin_all" on public.partnerships;
drop policy if exists "partnerships_owner_select" on public.partnerships;
drop policy if exists "partnerships_owner_insert" on public.partnerships;
drop policy if exists "partnerships_owner_update" on public.partnerships;
create policy "partnerships_admin_all" on public.partnerships
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "partnerships_owner_select" on public.partnerships
  for select to authenticated
  using ((select public.is_current_app_user(owner_user_id)));
create policy "partnerships_owner_insert" on public.partnerships
  for insert to authenticated
  with check ((select public.is_current_app_user(owner_user_id)));
create policy "partnerships_owner_update" on public.partnerships
  for update to authenticated
  using ((select public.is_current_app_user(owner_user_id)))
  with check ((select public.is_current_app_user(owner_user_id)));

-- public.mall_displays
alter table public.mall_displays enable row level security;
drop policy if exists "mall_displays_admin_all" on public.mall_displays;
drop policy if exists "mall_displays_outlet_select" on public.mall_displays;
drop policy if exists "mall_displays_outlet_update" on public.mall_displays;
create policy "mall_displays_admin_all" on public.mall_displays
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "mall_displays_outlet_select" on public.mall_displays
  for select to authenticated
  using ((select public.owns_outlet(outlet_id)));
create policy "mall_displays_outlet_update" on public.mall_displays
  for update to authenticated
  using ((select public.owns_outlet(outlet_id)))
  with check ((select public.owns_outlet(outlet_id)));

-- public.events
alter table public.events enable row level security;
drop policy if exists "events_admin_all" on public.events;
drop policy if exists "events_outlet_select" on public.events;
drop policy if exists "events_outlet_insert" on public.events;
drop policy if exists "events_outlet_update" on public.events;
create policy "events_admin_all" on public.events
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "events_outlet_select" on public.events
  for select to authenticated
  using ((select public.owns_outlet(outlet_id)) or (select public.is_current_app_user(submitter_user_id)));
create policy "events_outlet_insert" on public.events
  for insert to authenticated
  with check ((select public.owns_outlet(outlet_id)) and (select public.is_current_app_user(submitter_user_id)));
create policy "events_outlet_update" on public.events
  for update to authenticated
  using ((select public.owns_outlet(outlet_id)) or (select public.is_current_app_user(submitter_user_id)))
  with check ((select public.owns_outlet(outlet_id)) or (select public.is_current_app_user(submitter_user_id)));

-- public.tasks
alter table public.tasks enable row level security;
drop policy if exists "tasks_admin_all" on public.tasks;
drop policy if exists "tasks_outlet_select" on public.tasks;
drop policy if exists "tasks_outlet_insert" on public.tasks;
drop policy if exists "tasks_outlet_update" on public.tasks;
create policy "tasks_admin_all" on public.tasks
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "tasks_outlet_select" on public.tasks
  for select to authenticated
  using (
    (select public.owns_outlet(outlet_id))
    or (select public.is_current_app_user(assigned_by_user_id))
    or (select public.is_current_app_user(assigned_to_user_id))
  );
create policy "tasks_outlet_insert" on public.tasks
  for insert to authenticated
  with check ((select public.owns_outlet(outlet_id)) and (select public.is_current_app_user(assigned_by_user_id)));
create policy "tasks_outlet_update" on public.tasks
  for update to authenticated
  using (
    (select public.owns_outlet(outlet_id))
    or (select public.is_current_app_user(assigned_by_user_id))
    or (select public.is_current_app_user(assigned_to_user_id))
  )
  with check (
    (select public.owns_outlet(outlet_id))
    or (select public.is_current_app_user(assigned_by_user_id))
    or (select public.is_current_app_user(assigned_to_user_id))
  );

-- public.vouchers
alter table public.vouchers enable row level security;
drop policy if exists "vouchers_admin_all" on public.vouchers;
drop policy if exists "vouchers_outlet_select" on public.vouchers;
drop policy if exists "vouchers_outlet_insert" on public.vouchers;
drop policy if exists "vouchers_outlet_update" on public.vouchers;
create policy "vouchers_admin_all" on public.vouchers
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "vouchers_outlet_select" on public.vouchers
  for select to authenticated
  using ((select public.owns_outlet(outlet_id)) or (select public.is_current_app_user(logged_by_user_id)));
create policy "vouchers_outlet_insert" on public.vouchers
  for insert to authenticated
  with check ((select public.owns_outlet(outlet_id)) and (select public.is_current_app_user(logged_by_user_id)));
create policy "vouchers_outlet_update" on public.vouchers
  for update to authenticated
  using ((select public.owns_outlet(outlet_id)) or (select public.is_current_app_user(logged_by_user_id)))
  with check ((select public.owns_outlet(outlet_id)) or (select public.is_current_app_user(logged_by_user_id)));

-- public.mascot_bookings
alter table public.mascot_bookings enable row level security;
drop policy if exists "mascot_bookings_admin_all" on public.mascot_bookings;
drop policy if exists "mascot_bookings_outlet_select" on public.mascot_bookings;
drop policy if exists "mascot_bookings_outlet_insert" on public.mascot_bookings;
drop policy if exists "mascot_bookings_outlet_update" on public.mascot_bookings;
create policy "mascot_bookings_admin_all" on public.mascot_bookings
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "mascot_bookings_outlet_select" on public.mascot_bookings
  for select to authenticated
  using (
    (select public.owns_outlet(outlet_id))
    or (select public.is_current_app_user(requested_by_user_id))
    or (select public.is_current_app_user(approved_by_user_id))
  );
create policy "mascot_bookings_outlet_insert" on public.mascot_bookings
  for insert to authenticated
  with check ((select public.owns_outlet(outlet_id)) and (select public.is_current_app_user(requested_by_user_id)));
create policy "mascot_bookings_outlet_update" on public.mascot_bookings
  for update to authenticated
  using ((select public.owns_outlet(outlet_id)) or (select public.is_current_app_user(requested_by_user_id)))
  with check ((select public.owns_outlet(outlet_id)) or (select public.is_current_app_user(requested_by_user_id)));

-- public.mascot_logs
alter table public.mascot_logs enable row level security;
drop policy if exists "mascot_logs_admin_all" on public.mascot_logs;
drop policy if exists "mascot_logs_pic_select" on public.mascot_logs;
drop policy if exists "mascot_logs_pic_insert" on public.mascot_logs;
drop policy if exists "mascot_logs_pic_update" on public.mascot_logs;
create policy "mascot_logs_admin_all" on public.mascot_logs
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "mascot_logs_pic_select" on public.mascot_logs
  for select to authenticated
  using ((select public.is_current_app_user(assigned_pic_user_id)));
create policy "mascot_logs_pic_insert" on public.mascot_logs
  for insert to authenticated
  with check ((select public.is_current_app_user(assigned_pic_user_id)));
create policy "mascot_logs_pic_update" on public.mascot_logs
  for update to authenticated
  using ((select public.is_current_app_user(assigned_pic_user_id)))
  with check ((select public.is_current_app_user(assigned_pic_user_id)));

-- public.mascot_schedule
alter table public.mascot_schedule enable row level security;
drop policy if exists "mascot_schedule_admin_all" on public.mascot_schedule;
drop policy if exists "mascot_schedule_outlet_select" on public.mascot_schedule;
drop policy if exists "mascot_schedule_outlet_insert" on public.mascot_schedule;
drop policy if exists "mascot_schedule_outlet_update" on public.mascot_schedule;
create policy "mascot_schedule_admin_all" on public.mascot_schedule
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "mascot_schedule_outlet_select" on public.mascot_schedule
  for select to authenticated
  using ((select public.owns_outlet(outlet_id)));
create policy "mascot_schedule_outlet_insert" on public.mascot_schedule
  for insert to authenticated
  with check ((select public.owns_outlet(outlet_id)));
create policy "mascot_schedule_outlet_update" on public.mascot_schedule
  for update to authenticated
  using ((select public.owns_outlet(outlet_id)))
  with check ((select public.owns_outlet(outlet_id)));

-- public.blog_outreach
alter table public.blog_outreach enable row level security;
drop policy if exists "blog_outreach_admin_all" on public.blog_outreach;
drop policy if exists "blog_outreach_pic_select" on public.blog_outreach;
drop policy if exists "blog_outreach_pic_insert" on public.blog_outreach;
drop policy if exists "blog_outreach_pic_update" on public.blog_outreach;
create policy "blog_outreach_admin_all" on public.blog_outreach
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "blog_outreach_pic_select" on public.blog_outreach
  for select to authenticated
  using ((select public.is_current_app_user(pic_user_id)));
create policy "blog_outreach_pic_insert" on public.blog_outreach
  for insert to authenticated
  with check ((select public.is_current_app_user(pic_user_id)));
create policy "blog_outreach_pic_update" on public.blog_outreach
  for update to authenticated
  using ((select public.is_current_app_user(pic_user_id)))
  with check ((select public.is_current_app_user(pic_user_id)));

-- public.delivery_promos
alter table public.delivery_promos enable row level security;
drop policy if exists "delivery_promos_admin_all" on public.delivery_promos;
drop policy if exists "delivery_promos_pic_select" on public.delivery_promos;
drop policy if exists "delivery_promos_pic_insert" on public.delivery_promos;
drop policy if exists "delivery_promos_pic_update" on public.delivery_promos;
create policy "delivery_promos_admin_all" on public.delivery_promos
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "delivery_promos_pic_select" on public.delivery_promos
  for select to authenticated
  using ((select public.is_current_app_user(pic_user_id)) or (select public.can_access_campaign(campaign_id)));
create policy "delivery_promos_pic_insert" on public.delivery_promos
  for insert to authenticated
  with check ((select public.is_current_app_user(pic_user_id)));
create policy "delivery_promos_pic_update" on public.delivery_promos
  for update to authenticated
  using ((select public.is_current_app_user(pic_user_id)))
  with check ((select public.is_current_app_user(pic_user_id)));

-- public.social_posts
alter table public.social_posts enable row level security;
drop policy if exists "social_posts_admin_all" on public.social_posts;
drop policy if exists "social_posts_author_select" on public.social_posts;
drop policy if exists "social_posts_author_insert" on public.social_posts;
drop policy if exists "social_posts_author_update" on public.social_posts;
create policy "social_posts_admin_all" on public.social_posts
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "social_posts_author_select" on public.social_posts
  for select to authenticated
  using ((select public.owns_outlet(outlet_id)) or (select public.is_current_app_user(author_user_id)));
create policy "social_posts_author_insert" on public.social_posts
  for insert to authenticated
  with check (
    (select public.is_current_app_user(author_user_id))
    and (outlet_id is null or (select public.owns_outlet(outlet_id)))
  );
create policy "social_posts_author_update" on public.social_posts
  for update to authenticated
  using ((select public.owns_outlet(outlet_id)) or (select public.is_current_app_user(author_user_id)))
  with check (
    (select public.is_current_app_user(author_user_id))
    and (outlet_id is null or (select public.owns_outlet(outlet_id)))
  );

-- public.paid_ads
alter table public.paid_ads enable row level security;
drop policy if exists "paid_ads_admin_all" on public.paid_ads;
drop policy if exists "paid_ads_owner_select" on public.paid_ads;
drop policy if exists "paid_ads_owner_insert" on public.paid_ads;
drop policy if exists "paid_ads_owner_update" on public.paid_ads;
create policy "paid_ads_admin_all" on public.paid_ads
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "paid_ads_owner_select" on public.paid_ads
  for select to authenticated
  using ((select public.is_current_app_user(owner_user_id)) or (select public.can_access_campaign(campaign_id)));
create policy "paid_ads_owner_insert" on public.paid_ads
  for insert to authenticated
  with check ((select public.is_current_app_user(owner_user_id)));
create policy "paid_ads_owner_update" on public.paid_ads
  for update to authenticated
  using ((select public.is_current_app_user(owner_user_id)))
  with check ((select public.is_current_app_user(owner_user_id)));

-- public.ad_hoc_tasks
alter table public.ad_hoc_tasks enable row level security;
drop policy if exists "ad_hoc_tasks_admin_all" on public.ad_hoc_tasks;
drop policy if exists "ad_hoc_tasks_creator_select" on public.ad_hoc_tasks;
drop policy if exists "ad_hoc_tasks_creator_insert" on public.ad_hoc_tasks;
drop policy if exists "ad_hoc_tasks_creator_update" on public.ad_hoc_tasks;
create policy "ad_hoc_tasks_admin_all" on public.ad_hoc_tasks
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "ad_hoc_tasks_creator_select" on public.ad_hoc_tasks
  for select to authenticated
  using ((select public.is_current_app_user(creator_user_id)));
create policy "ad_hoc_tasks_creator_insert" on public.ad_hoc_tasks
  for insert to authenticated
  with check ((select public.is_current_app_user(creator_user_id)));
create policy "ad_hoc_tasks_creator_update" on public.ad_hoc_tasks
  for update to authenticated
  using ((select public.is_current_app_user(creator_user_id)))
  with check ((select public.is_current_app_user(creator_user_id)));

-- public.sales
alter table public.sales enable row level security;
drop policy if exists "sales_admin_all" on public.sales;
drop policy if exists "sales_outlet_select" on public.sales;
drop policy if exists "sales_outlet_insert" on public.sales;
drop policy if exists "sales_outlet_update" on public.sales;
create policy "sales_admin_all" on public.sales
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "sales_outlet_select" on public.sales
  for select to authenticated
  using ((select public.owns_outlet(outlet_id)));
create policy "sales_outlet_insert" on public.sales
  for insert to authenticated
  with check ((select public.owns_outlet(outlet_id)) and (select public.is_current_app_user(imported_by_user_id)));
create policy "sales_outlet_update" on public.sales
  for update to authenticated
  using ((select public.owns_outlet(outlet_id)))
  with check ((select public.owns_outlet(outlet_id)));

-- public.budgets
alter table public.budgets enable row level security;
drop policy if exists "budgets_admin_all" on public.budgets;
create policy "budgets_admin_all" on public.budgets
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- public.budget_source_batches
alter table public.budget_source_batches enable row level security;
drop policy if exists "budget_source_batches_admin_all" on public.budget_source_batches;
create policy "budget_source_batches_admin_all" on public.budget_source_batches
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- public.financials
alter table public.financials enable row level security;
drop policy if exists "financials_admin_all" on public.financials;
drop policy if exists "financials_outlet_select" on public.financials;
drop policy if exists "financials_outlet_insert" on public.financials;
drop policy if exists "financials_outlet_update" on public.financials;
create policy "financials_admin_all" on public.financials
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "financials_outlet_select" on public.financials
  for select to authenticated
  using ((select public.owns_outlet(outlet_id)));
create policy "financials_outlet_insert" on public.financials
  for insert to authenticated
  with check ((select public.owns_outlet(outlet_id)) and (select public.is_current_app_user(uploaded_by_user_id)));
create policy "financials_outlet_update" on public.financials
  for update to authenticated
  using ((select public.owns_outlet(outlet_id)))
  with check ((select public.owns_outlet(outlet_id)));
