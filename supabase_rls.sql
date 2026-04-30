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

create or replace function public.owns_merchant(target_merchant text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_merchant is not null
    and btrim(target_merchant) <> ''
    and exists (
      select 1
      from public.users u
      join public.outlets o on o.id = u.outlet_id
      where u.auth_user_id = (select auth.uid())
        and u.status = 'active'
        and lower(btrim(o.name)) = lower(btrim(target_merchant))
    )
$$;

create or replace function public.storage_path_uuid(object_name text, segment_index integer)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  path_segments text[];
begin
  if object_name is null or segment_index < 1 then
    return null;
  end if;

  path_segments := storage.foldername(object_name);
  return path_segments[segment_index]::uuid;
exception
  when others then
    return null;
end;
$$;

create or replace function public.storage_path_segment(object_name text, segment_index integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  path_segments text[];
begin
  if object_name is null or segment_index < 1 then
    return null;
  end if;

  path_segments := storage.foldername(object_name);
  return path_segments[segment_index];
exception
  when others then
    return null;
end;
$$;

create or replace function public.can_access_event_proof_storage(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events e
    where e.id = (select public.storage_path_uuid(object_name, 2))
      and (
        (select public.is_admin())
        or (select public.owns_outlet(e.outlet_id))
        or (select public.is_current_app_user(e.submitter_user_id))
      )
  )
$$;

create or replace function public.can_access_task_proof_storage(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = (select public.storage_path_uuid(object_name, 2))
      and (
        (select public.is_admin())
        or (select public.owns_outlet(t.outlet_id))
        or (select public.is_current_app_user(t.assigned_by_user_id))
        or (select public.is_current_app_user(t.assigned_to_user_id))
      )
  )
$$;

create or replace function public.can_access_mall_display_proof_storage(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.mall_displays md
    where md.slot_code = (select public.storage_path_segment(object_name, 1))
      and (
        (select public.is_admin())
        or (select public.owns_outlet(md.outlet_id))
      )
  )
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

create or replace function public.can_access_campaign_asset_storage(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.can_access_campaign((select public.storage_path_uuid(object_name, 1))))
$$;

create or replace function public.can_update_campaign_asset_storage(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.can_update_campaign((select public.storage_path_uuid(object_name, 1))))
$$;

create or replace function public.import_sales_budget(
  p_sales_rows jsonb,
  p_source_file_name text,
  p_source_batch_id text
)
returns table(sales_count integer, budget_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid;
  import_timestamp timestamp with time zone := now();
begin
  if not (select public.is_admin()) then
    raise exception 'Only admins can import sales and budget data.' using errcode = '42501';
  end if;

  actor_user_id := (select public.current_app_user_id());
  if actor_user_id is null then
    raise exception 'Active app user profile is required for sales import.' using errcode = '42501';
  end if;

  if p_source_batch_id is null or btrim(p_source_batch_id) = '' then
    raise exception 'source_batch_id is required.';
  end if;

  if p_sales_rows is null or jsonb_typeof(p_sales_rows) <> 'array' or jsonb_array_length(p_sales_rows) = 0 then
    raise exception 'At least one sales row is required.';
  end if;

  drop table if exists pg_temp.sales_import_rows;
  create temporary table sales_import_rows (
    month_key text not null,
    outlet_id uuid not null,
    outlet_name text not null,
    total_sales numeric(14,2) not null,
    grab_gross_order_value numeric(14,2) not null,
    grab_commission_fees numeric(14,2) not null,
    grab_ad_spend numeric(14,2) not null,
    foodpanda_gross_order_value numeric(14,2) not null,
    foodpanda_commission_fees numeric(14,2) not null,
    foodpanda_ad_spend numeric(14,2) not null
  ) on commit drop;

  insert into pg_temp.sales_import_rows (
    month_key,
    outlet_id,
    outlet_name,
    total_sales,
    grab_gross_order_value,
    grab_commission_fees,
    grab_ad_spend,
    foodpanda_gross_order_value,
    foodpanda_commission_fees,
    foodpanda_ad_spend
  )
  select
    btrim(row_data.month_key),
    row_data.outlet_id,
    btrim(coalesce(row_data.outlet_name, '')),
    round(coalesce(row_data.total_sales, 0), 2),
    round(coalesce(row_data.grab_gross_order_value, 0), 2),
    round(coalesce(row_data.grab_commission_fees, 0), 2),
    round(coalesce(row_data.grab_ad_spend, 0), 2),
    round(coalesce(row_data.foodpanda_gross_order_value, 0), 2),
    round(coalesce(row_data.foodpanda_commission_fees, 0), 2),
    round(coalesce(row_data.foodpanda_ad_spend, 0), 2)
  from jsonb_to_recordset(p_sales_rows) as row_data(
    month_key text,
    outlet_id uuid,
    outlet_name text,
    total_sales numeric,
    grab_gross_order_value numeric,
    grab_commission_fees numeric,
    grab_ad_spend numeric,
    foodpanda_gross_order_value numeric,
    foodpanda_commission_fees numeric,
    foodpanda_ad_spend numeric
  );

  if exists (
    select 1
    from pg_temp.sales_import_rows
    where month_key !~ '^[0-9]{4}-[0-9]{2}$'
      or outlet_name = ''
      or total_sales < 0
      or grab_gross_order_value < 0
      or grab_commission_fees < 0
      or grab_ad_spend < 0
      or foodpanda_gross_order_value < 0
      or foodpanda_commission_fees < 0
      or foodpanda_ad_spend < 0
  ) then
    raise exception 'Sales import rows contain invalid month, outlet, or negative financial values.';
  end if;

  if exists (
    select 1
    from pg_temp.sales_import_rows r
    left join public.outlets o on o.id = r.outlet_id
    where o.id is null
  ) then
    raise exception 'Sales import contains an outlet_id that does not exist.';
  end if;

  drop table if exists pg_temp.sales_import_collapsed;
  create temporary table sales_import_collapsed on commit drop as
  select
    month_key,
    outlet_id,
    max(outlet_name) as outlet_name,
    round(sum(total_sales), 2) as total_sales,
    round(sum(grab_gross_order_value), 2) as grab_gross_order_value,
    round(sum(grab_commission_fees), 2) as grab_commission_fees,
    round(sum(grab_ad_spend), 2) as grab_ad_spend,
    round(sum(foodpanda_gross_order_value), 2) as foodpanda_gross_order_value,
    round(sum(foodpanda_commission_fees), 2) as foodpanda_commission_fees,
    round(sum(foodpanda_ad_spend), 2) as foodpanda_ad_spend
  from pg_temp.sales_import_rows
  group by month_key, outlet_id;

  with upserted_sales as (
    insert into public.sales (
      month_key,
      outlet_id,
      outlet_name,
      total_sales,
      grab_gross_order_value,
      grab_commission_fees,
      grab_ad_spend,
      grab_net_profit,
      foodpanda_gross_order_value,
      foodpanda_commission_fees,
      foodpanda_ad_spend,
      foodpanda_net_profit,
      source_file_name,
      source_batch_id,
      imported_by_user_id,
      imported_at,
      created_at,
      updated_at
    )
    select
      month_key,
      outlet_id,
      outlet_name,
      total_sales,
      grab_gross_order_value,
      grab_commission_fees,
      grab_ad_spend,
      round(grab_gross_order_value - grab_commission_fees - grab_ad_spend, 2),
      foodpanda_gross_order_value,
      foodpanda_commission_fees,
      foodpanda_ad_spend,
      round(foodpanda_gross_order_value - foodpanda_commission_fees - foodpanda_ad_spend, 2),
      coalesce(p_source_file_name, ''),
      p_source_batch_id,
      actor_user_id,
      import_timestamp,
      import_timestamp,
      import_timestamp
    from pg_temp.sales_import_collapsed
    on conflict (month_key, outlet_id) do update set
      outlet_name = excluded.outlet_name,
      total_sales = excluded.total_sales,
      grab_gross_order_value = excluded.grab_gross_order_value,
      grab_commission_fees = excluded.grab_commission_fees,
      grab_ad_spend = excluded.grab_ad_spend,
      grab_net_profit = excluded.grab_net_profit,
      foodpanda_gross_order_value = excluded.foodpanda_gross_order_value,
      foodpanda_commission_fees = excluded.foodpanda_commission_fees,
      foodpanda_ad_spend = excluded.foodpanda_ad_spend,
      foodpanda_net_profit = excluded.foodpanda_net_profit,
      source_file_name = excluded.source_file_name,
      source_batch_id = excluded.source_batch_id,
      imported_by_user_id = excluded.imported_by_user_id,
      imported_at = excluded.imported_at,
      updated_at = excluded.updated_at
    returning 1
  )
  select count(*)::integer into sales_count from upserted_sales;

  drop table if exists pg_temp.upserted_budgets;
  create temporary table upserted_budgets (
    id uuid primary key,
    month_key text not null
  ) on commit drop;

  with monthly_rollups as (
    select
      month_key,
      round(sum(total_sales), 2) as sales_rollup_total
    from pg_temp.sales_import_collapsed
    group by month_key
  ),
  upserted as (
    insert into public.budgets (
      month_key,
      sales_rollup_total,
      budget_rate,
      marketing_budget_total,
      locked,
      locked_at,
      source_file_name,
      calculated_by_user_id,
      created_at,
      updated_at
    )
    select
      month_key,
      sales_rollup_total,
      0.0200,
      round(sales_rollup_total * 0.0200, 2),
      true,
      import_timestamp,
      coalesce(p_source_file_name, ''),
      actor_user_id,
      import_timestamp,
      import_timestamp
    from monthly_rollups
    on conflict (month_key) do update set
      sales_rollup_total = excluded.sales_rollup_total,
      budget_rate = excluded.budget_rate,
      marketing_budget_total = excluded.marketing_budget_total,
      locked = excluded.locked,
      locked_at = excluded.locked_at,
      source_file_name = excluded.source_file_name,
      calculated_by_user_id = excluded.calculated_by_user_id,
      updated_at = excluded.updated_at
    returning id, month_key
  )
  insert into pg_temp.upserted_budgets (id, month_key)
  select id, month_key from upserted;

  select count(*)::integer into budget_count from pg_temp.upserted_budgets;

  insert into public.budget_source_batches (budget_id, source_batch_id, created_at)
  select id, p_source_batch_id, import_timestamp
  from pg_temp.upserted_budgets
  on conflict (budget_id, source_batch_id) do nothing;

  return next;
end;
$$;

create or replace function public.create_notification(
  p_recipient_user_id uuid,
  p_actor_user_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_type text,
  p_title text,
  p_body text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient_user_id is null
    or p_entity_id is null
    or p_title is null
    or btrim(p_title) = ''
  then
    return;
  end if;

  insert into public.notifications (
    recipient_user_id,
    actor_user_id,
    entity_type,
    entity_id,
    type,
    title,
    body,
    created_at
  )
  values (
    p_recipient_user_id,
    p_actor_user_id,
    p_entity_type,
    p_entity_id,
    p_type,
    btrim(p_title),
    coalesce(p_body, ''),
    now()
  );
end;
$$;

create or replace function public.notify_task_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid;
  admin_profile record;
  notification_type text;
begin
  actor_user_id := coalesce((select public.current_app_user_id()), new.assigned_by_user_id);

  if TG_OP = 'INSERT' then
    perform public.create_notification(
      new.assigned_to_user_id,
      actor_user_id,
      'task',
      new.id,
      'task_assigned',
      'Task assigned: ' || new.title,
      'A task has been assigned to you.'
    );

    return new;
  end if;

  if TG_OP = 'UPDATE' and old.status is distinct from new.status then
    if new.status = 'proof_submitted' then
      for admin_profile in
        select u.id
        from public.users u
        where u.role = 'admin'
          and u.status = 'active'
      loop
        perform public.create_notification(
          admin_profile.id,
          coalesce(actor_user_id, new.assigned_to_user_id),
          'task',
          new.id,
          'task_proof_submitted',
          'Task proof submitted: ' || new.title,
          'Proof is ready for admin review.'
        );
      end loop;
    elsif new.status in ('approved', 'rejected', 'completed') then
      notification_type := 'task_' || new.status;

      perform public.create_notification(
        new.assigned_to_user_id,
        actor_user_id,
        'task',
        new.id,
        notification_type,
        'Task ' || replace(new.status, '_', ' ') || ': ' || new.title,
        'Task status changed to ' || replace(new.status, '_', ' ') || '.'
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_notify_changes on public.tasks;
create trigger tasks_notify_changes
  after insert or update of status on public.tasks
  for each row
  execute function public.notify_task_changes();

create or replace function public.notify_mascot_booking_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid;
  admin_profile record;
  notification_type text;
begin
  actor_user_id := coalesce((select public.current_app_user_id()), new.requested_by_user_id, new.approved_by_user_id);

  if TG_OP = 'INSERT' then
    for admin_profile in
      select u.id
      from public.users u
      where u.role = 'admin'
        and u.status = 'active'
    loop
      perform public.create_notification(
        admin_profile.id,
        new.requested_by_user_id,
        'mascot_booking',
        new.id,
        'mascot_booking_requested',
        'Mascot booking requested: ' || new.title,
        coalesce(new.location, '')
      );
    end loop;

    return new;
  end if;

  if TG_OP = 'UPDATE'
    and old.status is distinct from new.status
    and new.status in ('approved', 'rejected', 'cancelled')
  then
    notification_type := 'mascot_booking_' || new.status;

    perform public.create_notification(
      new.requested_by_user_id,
      actor_user_id,
      'mascot_booking',
      new.id,
      notification_type,
      'Mascot booking ' || new.status || ': ' || new.title,
      coalesce(new.admin_note, new.location, '')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists mascot_bookings_notify_changes on public.mascot_bookings;
create trigger mascot_bookings_notify_changes
  after insert or update of status on public.mascot_bookings
  for each row
  execute function public.notify_mascot_booking_changes();

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id
    and recipient_user_id = (select public.current_app_user_id());
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
begin
  update public.notifications
  set read_at = coalesce(read_at, now())
  where recipient_user_id = (select public.current_app_user_id())
    and read_at is null;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.current_app_user_id() from public;
revoke all on function public.current_app_user_outlet_id() from public;
revoke all on function public.is_active_app_user() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.claim_user_profile() from public;
revoke all on function public.is_current_app_user(uuid) from public;
revoke all on function public.owns_outlet(uuid) from public;
revoke all on function public.owns_merchant(text) from public;
revoke all on function public.storage_path_uuid(text, integer) from public;
revoke all on function public.storage_path_segment(text, integer) from public;
revoke all on function public.can_access_event_proof_storage(text) from public;
revoke all on function public.can_access_task_proof_storage(text) from public;
revoke all on function public.can_access_campaign_asset_storage(text) from public;
revoke all on function public.can_update_campaign_asset_storage(text) from public;
revoke all on function public.can_access_mall_display_proof_storage(text) from public;
revoke all on function public.can_access_campaign(uuid) from public;
revoke all on function public.can_update_campaign(uuid) from public;
revoke all on function public.import_sales_budget(jsonb, text, text) from public;
revoke all on function public.create_notification(uuid, uuid, text, uuid, text, text, text) from public;
revoke all on function public.notify_task_changes() from public;
revoke all on function public.notify_mascot_booking_changes() from public;
revoke all on function public.mark_notification_read(uuid) from public;
revoke all on function public.mark_all_notifications_read() from public;

grant execute on function public.current_app_user_id() to authenticated;
grant execute on function public.current_app_user_outlet_id() to authenticated;
grant execute on function public.is_active_app_user() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.claim_user_profile() to authenticated;
grant execute on function public.is_current_app_user(uuid) to authenticated;
grant execute on function public.owns_outlet(uuid) to authenticated;
grant execute on function public.owns_merchant(text) to authenticated;
grant execute on function public.storage_path_uuid(text, integer) to authenticated;
grant execute on function public.storage_path_segment(text, integer) to authenticated;
grant execute on function public.can_access_event_proof_storage(text) to authenticated;
grant execute on function public.can_access_task_proof_storage(text) to authenticated;
grant execute on function public.can_access_campaign_asset_storage(text) to authenticated;
grant execute on function public.can_update_campaign_asset_storage(text) to authenticated;
grant execute on function public.can_access_mall_display_proof_storage(text) to authenticated;
grant execute on function public.can_access_campaign(uuid) to authenticated;
grant execute on function public.can_update_campaign(uuid) to authenticated;
grant execute on function public.import_sales_budget(jsonb, text, text) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- Supabase Storage buckets
insert into storage.buckets (id, name, public)
values
  ('event-proofs', 'event-proofs', false),
  ('task-proofs', 'task-proofs', false),
  ('campaign-assets', 'campaign-assets', false),
  ('mall-display-proofs', 'mall-display-proofs', false)
on conflict (id) do update
set public = false;

drop policy if exists "proof_storage_admin_all" on storage.objects;
drop policy if exists "event_proofs_select" on storage.objects;
drop policy if exists "event_proofs_insert" on storage.objects;
drop policy if exists "task_proofs_select" on storage.objects;
drop policy if exists "task_proofs_insert" on storage.objects;
drop policy if exists "campaign_assets_select" on storage.objects;
drop policy if exists "campaign_assets_insert" on storage.objects;
drop policy if exists "mall_display_proofs_select" on storage.objects;
drop policy if exists "mall_display_proofs_insert" on storage.objects;
create policy "proof_storage_admin_all" on storage.objects
  for all to authenticated
  using (bucket_id in ('event-proofs', 'task-proofs', 'campaign-assets', 'mall-display-proofs') and (select public.is_admin()))
  with check (bucket_id in ('event-proofs', 'task-proofs', 'campaign-assets', 'mall-display-proofs') and (select public.is_admin()));
create policy "event_proofs_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'event-proofs' and (select public.can_access_event_proof_storage(name)));
create policy "event_proofs_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-proofs' and (select public.can_access_event_proof_storage(name)));
create policy "task_proofs_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'task-proofs' and (select public.can_access_task_proof_storage(name)));
create policy "task_proofs_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'task-proofs' and (select public.can_access_task_proof_storage(name)));
create policy "campaign_assets_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'campaign-assets' and (select public.can_access_campaign_asset_storage(name)));
create policy "campaign_assets_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'campaign-assets' and (select public.can_update_campaign_asset_storage(name)));
create policy "mall_display_proofs_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'mall-display-proofs' and (select public.can_access_mall_display_proof_storage(name)));
create policy "mall_display_proofs_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'mall-display-proofs' and (select public.can_access_mall_display_proof_storage(name)));

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
-- Non-admin users may create outlet-scoped booking requests, but admin approval
-- and status changes are intentionally handled by the admin-all policy only.

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

-- public.notifications
alter table public.notifications enable row level security;
drop policy if exists "notifications_admin_all" on public.notifications;
drop policy if exists "notifications_recipient_select" on public.notifications;
create policy "notifications_admin_all" on public.notifications
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "notifications_recipient_select" on public.notifications
  for select to authenticated
  using ((select public.is_current_app_user(recipient_user_id)));

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

-- public.grab_daily_sales
alter table public.grab_daily_sales enable row level security;
drop policy if exists "grab_daily_sales_admin_all" on public.grab_daily_sales;
drop policy if exists "grab_daily_sales_outlet_select" on public.grab_daily_sales;
drop policy if exists "grab_daily_sales_outlet_update" on public.grab_daily_sales;
create policy "grab_daily_sales_admin_all" on public.grab_daily_sales
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "grab_daily_sales_outlet_select" on public.grab_daily_sales
  for select to authenticated
  using ((select public.owns_merchant(merchant)));
create policy "grab_daily_sales_outlet_update" on public.grab_daily_sales
  for update to authenticated
  using ((select public.owns_merchant(merchant)))
  with check ((select public.owns_merchant(merchant)));

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
