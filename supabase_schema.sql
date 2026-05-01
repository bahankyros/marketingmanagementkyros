-- MarketingManagementKyros V3 Supabase schema
-- Phase 3 foundation only: frontend data access and RLS policies migrate later.

create extension if not exists pgcrypto;

create table public.outlets (
  id uuid default gen_random_uuid() primary key,
  legacy_key text unique,
  name text not null,
  base_sales numeric(14,2) not null default 0 check (base_sales >= 0),
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.users (
  id uuid default gen_random_uuid() primary key,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text not null unique,
  display_name text not null default '',
  role text not null check (role in ('admin', 'supervisor', 'finance', 'pic')),
  outlet_id uuid references public.outlets(id) on delete set null,
  outlet_name text not null default '',
  status text not null default 'invited' check (status in ('active', 'invited', 'suspended')),
  photo_url text not null default '',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.settings (
  id uuid default gen_random_uuid() primary key,
  key text not null unique default 'globals',
  partnership_target numeric(12,2) not null default 30,
  display_slots_target numeric(12,2) not null default 18,
  events_target numeric(12,2) not null default 2,
  kebab_target numeric(12,2) not null default 50,
  mascot_target numeric(12,2) not null default 4,
  blog_target numeric(12,2) not null default 10,
  social_target numeric(12,2) not null default 15,
  ad_budget numeric(14,2) not null default 5000 check (ad_budget >= 0),
  total_marketing_budget numeric(14,2) not null default 50000 check (total_marketing_budget >= 0),
  updated_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.campaigns (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  objective text not null default '',
  status text not null default 'Planning' check (status in ('Planning', 'Active', 'Completed', 'Cancelled')),
  type text not null default 'Promo' check (type in ('Brand', 'Promo', 'Opening', 'Seasonal', 'Sampling', 'Partnership', 'Digital', 'Event')),
  owner_user_id uuid references public.users(id) on delete set null,
  start_date date,
  end_date date,
  budget numeric(14,2) not null default 0 check (budget >= 0),
  asset_url text not null default '',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.campaign_checklist_items (
  id uuid default gen_random_uuid() primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  task text not null,
  completed boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.checklist_templates (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  type text not null check (type in ('Digital', 'Physical', 'Hybrid')),
  category text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.checklist_template_items (
  id uuid default gen_random_uuid() primary key,
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  task text not null,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.partnerships (
  id uuid default gen_random_uuid() primary key,
  company_name text not null,
  industry text not null default '',
  contact_person text not null default '',
  position text not null default '',
  phone text not null default '',
  email text not null default '',
  lead_source text not null default '',
  stage text not null default 'Prospect',
  voucher_type text not null default 'Digital',
  vouchers_allocated numeric(12,0) not null default 0 check (vouchers_allocated >= 0),
  vouchers_redeemed numeric(12,0) not null default 0 check (vouchers_redeemed >= 0),
  revenue_generated numeric(14,2) not null default 0 check (revenue_generated >= 0),
  cost_per_redemption numeric(14,2) not null default 0 check (cost_per_redemption >= 0),
  target_date date,
  last_contacted_date date,
  campaign_id uuid references public.campaigns(id) on delete set null,
  owner_user_id uuid references public.users(id) on delete set null,
  notes text not null default '',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.mall_displays (
  id uuid default gen_random_uuid() primary key,
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  outlet_name text not null default '',
  slot_code text not null unique,
  design_status text not null default 'Not started',
  approval_status text not null default 'Not Submitted',
  current_status text not null default 'Draft',
  location_description text not null default '',
  campaign_id uuid references public.campaigns(id) on delete set null,
  installation_date date,
  mall_pic_name text not null default '',
  mall_pic_contact text not null default '',
  remarks text not null default '',
  proof_text text not null default '',
  proof_image_url text not null default '',
  proof_image_path text not null default '',
  photo_proof_url text not null default '',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.events (
  id uuid default gen_random_uuid() primary key,
  event_name text not null,
  organizer text not null default '',
  outlet_id uuid references public.outlets(id) on delete set null,
  outlet_name text not null default '',
  type text not null default 'Internal',
  campaign_id uuid references public.campaigns(id) on delete set null,
  decision_status text not null default 'Proposed' check (decision_status in ('Proposed', 'Reviewing', 'Approved', 'Rejected', 'Completed')),
  assigned_pic text not null default '',
  actual_attendance numeric(12,0) not null default 0 check (actual_attendance >= 0),
  sales_generated numeric(14,2) not null default 0 check (sales_generated >= 0),
  vouchers_distributed numeric(12,0) not null default 0 check (vouchers_distributed >= 0),
  vouchers_redeemed numeric(12,0) not null default 0 check (vouchers_redeemed >= 0),
  notes text not null default '',
  photos text not null default '',
  start_at timestamp with time zone not null,
  end_at timestamp with time zone not null,
  proposed_date date,
  submitter_user_id uuid references public.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  check (end_at > start_at)
);

create table public.event_history_logs (
  id uuid default gen_random_uuid() primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  action_type text not null check (action_type in ('created', 'updated')),
  description text not null default '',
  created_at timestamp with time zone not null default now()
);

create table public.tasks (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text not null default '',
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  assigned_by_user_id uuid references public.users(id) on delete set null,
  assigned_to_user_id uuid references public.users(id) on delete set null,
  task_type text not null default 'general' check (task_type in ('mall_display', 'voucher_follow_up', 'general')),
  event_id uuid references public.events(id) on delete set null,
  status text not null default 'assigned' check (status in ('assigned', 'in_progress', 'proof_submitted', 'approved', 'rejected', 'completed')),
  due_at timestamp with time zone not null,
  proof_text text not null default '',
  proof_image_url text not null default '',
  proof_image_path text not null default '',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.vouchers (
  id uuid default gen_random_uuid() primary key,
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  logged_by_user_id uuid references public.users(id) on delete set null,
  voucher_type text not null check (voucher_type in ('grab', 'foodpanda', 'instore', 'campaign', 'other')),
  amount numeric(14,2) not null check (amount > 0),
  notes text not null default '',
  used_at timestamp with time zone not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.mascot_bookings (
  id uuid default gen_random_uuid() primary key,
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  requested_by_user_id uuid references public.users(id) on delete set null,
  title text not null,
  location text not null,
  request_note text not null default '',
  start_at timestamp with time zone not null,
  end_at timestamp with time zone not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  admin_note text not null default '',
  approved_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  check (end_at > start_at)
);

create table public.mascot_logs (
  id uuid default gen_random_uuid() primary key,
  date date,
  outlet_event text not null default '',
  status text not null default 'Available',
  condition text not null default 'Good',
  actual_usage_notes text not null default '',
  assigned_pic_user_id uuid references public.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.mascot_schedule (
  id uuid default gen_random_uuid() primary key,
  outlet_id uuid references public.outlets(id) on delete set null,
  outlet_name text not null default '',
  title text not null default '',
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  status text not null default 'Scheduled',
  notes text not null default '',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.notifications (
  id uuid default gen_random_uuid() primary key,
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  entity_type text not null check (entity_type in ('task', 'mascot_booking')),
  entity_id uuid not null,
  type text not null check (type in (
    'task_assigned',
    'task_proof_submitted',
    'task_approved',
    'task_rejected',
    'task_completed',
    'mascot_booking_requested',
    'mascot_booking_approved',
    'mascot_booking_rejected',
    'mascot_booking_cancelled'
  )),
  title text not null,
  body text not null default '',
  read_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create table public.blog_outreach (
  id uuid default gen_random_uuid() primary key,
  domain text not null,
  target_date date,
  keywords text not null default '',
  expected_reach numeric(12,0) not null default 0 check (expected_reach >= 0),
  link text not null default '',
  status text not null default 'Not Contacted',
  pic_user_id uuid references public.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.delivery_promos (
  id uuid default gen_random_uuid() primary key,
  platform text not null default 'GrabFood',
  promo_type text not null default '',
  campaign_id uuid references public.campaigns(id) on delete set null,
  start_date date,
  end_date date,
  spend numeric(14,2) not null default 0 check (spend >= 0),
  sales numeric(14,2) not null default 0 check (sales >= 0),
  funding text not null default 'Self-funded',
  status text not null default 'Proposed',
  pic_user_id uuid references public.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.grab_daily_sales (
  id uuid default gen_random_uuid() primary key,
  date date not null,
  country text not null default '',
  city text not null default '',
  merchant text not null,
  grab_service text not null default '',
  gross_sales numeric(14,2) not null default 0 check (gross_sales >= 0),
  net_sales numeric(14,2) not null default 0 check (net_sales >= 0),
  transactions integer not null default 0 check (transactions >= 0),
  average_transaction_amount numeric(14,2) not null default 0 check (average_transaction_amount >= 0),
  average_rating numeric(3,2) not null default 0 check (average_rating >= 0 and average_rating <= 5),
  source_file_name text not null default '',
  uploaded_by_user_id uuid references public.users(id) on delete set null,
  imported_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.social_posts (
  id uuid default gen_random_uuid() primary key,
  platform text not null default 'Instagram',
  content_type text not null default 'Reel',
  campaign_id uuid references public.campaigns(id) on delete set null,
  outlet_id uuid references public.outlets(id) on delete set null,
  outlet_name text not null default 'All Outlets',
  publish_date date,
  status text not null default 'Brief',
  reach numeric(12,0) not null default 0 check (reach >= 0),
  engagement numeric(12,0) not null default 0 check (engagement >= 0),
  clicks numeric(12,0) not null default 0 check (clicks >= 0),
  author_user_id uuid references public.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.paid_ads (
  id uuid default gen_random_uuid() primary key,
  platform text not null default 'Meta',
  campaign_name text not null default '',
  objective text not null default 'Traffic',
  campaign_id uuid references public.campaigns(id) on delete set null,
  spend numeric(14,2) not null default 0 check (spend >= 0),
  reach numeric(12,0) not null default 0 check (reach >= 0),
  results numeric(12,0) not null default 0 check (results >= 0),
  result_type text not null default 'Video View',
  engagement numeric(12,0) not null default 0 check (engagement >= 0),
  owner_user_id uuid references public.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.ad_hoc_tasks (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  category text not null default 'Design Needs',
  status text not null default 'Open',
  priority text not null default 'Normal',
  due_date date,
  notes text not null default '',
  creator_user_id uuid references public.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.sales (
  id uuid default gen_random_uuid() primary key,
  month_key text not null check (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  outlet_name text not null,
  total_sales numeric(14,2) not null default 0 check (total_sales >= 0),
  grab_gross_order_value numeric(14,2) not null default 0 check (grab_gross_order_value >= 0),
  grab_commission_fees numeric(14,2) not null default 0 check (grab_commission_fees >= 0),
  grab_ad_spend numeric(14,2) not null default 0 check (grab_ad_spend >= 0),
  grab_net_profit numeric(14,2) not null default 0,
  foodpanda_gross_order_value numeric(14,2) not null default 0 check (foodpanda_gross_order_value >= 0),
  foodpanda_commission_fees numeric(14,2) not null default 0 check (foodpanda_commission_fees >= 0),
  foodpanda_ad_spend numeric(14,2) not null default 0 check (foodpanda_ad_spend >= 0),
  foodpanda_net_profit numeric(14,2) not null default 0,
  source_file_name text not null default '',
  source_batch_id text not null default '',
  imported_by_user_id uuid references public.users(id) on delete set null,
  imported_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (month_key, outlet_id)
);

create table public.budgets (
  id uuid default gen_random_uuid() primary key,
  month_key text not null unique check (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  sales_rollup_total numeric(14,2) not null default 0 check (sales_rollup_total >= 0),
  budget_rate numeric(5,4) not null default 0.0200 check (budget_rate >= 0),
  marketing_budget_total numeric(14,2) not null default 0 check (marketing_budget_total >= 0),
  locked boolean not null default false,
  locked_at timestamp with time zone,
  source_file_name text not null default '',
  calculated_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.budget_source_batches (
  id uuid default gen_random_uuid() primary key,
  budget_id uuid not null references public.budgets(id) on delete cascade,
  source_batch_id text not null,
  created_at timestamp with time zone not null default now(),
  unique (budget_id, source_batch_id)
);

create table public.financials (
  id uuid default gen_random_uuid() primary key,
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  currency text not null default 'MYR' check (currency = 'MYR'),
  sales_total numeric(14,2) not null default 0 check (sales_total >= 0),
  marketing_budget numeric(14,2) not null default 0 check (marketing_budget >= 0),
  budget_rate numeric(5,4) not null default 0.0200 check (budget_rate = 0.0200),
  csv_file_name text not null default '',
  csv_batch_id text not null default '',
  uploaded_by_user_id uuid references public.users(id) on delete set null,
  grab_gross_sales numeric(14,2) not null default 0 check (grab_gross_sales >= 0),
  grab_commission numeric(14,2) not null default 0 check (grab_commission >= 0),
  grab_promo_cost numeric(14,2) not null default 0 check (grab_promo_cost >= 0),
  grab_other_fees numeric(14,2) not null default 0 check (grab_other_fees >= 0),
  grab_net_profit numeric(14,2) not null default 0,
  foodpanda_gross_sales numeric(14,2) not null default 0 check (foodpanda_gross_sales >= 0),
  foodpanda_commission numeric(14,2) not null default 0 check (foodpanda_commission >= 0),
  foodpanda_promo_cost numeric(14,2) not null default 0 check (foodpanda_promo_cost >= 0),
  foodpanda_other_fees numeric(14,2) not null default 0 check (foodpanda_other_fees >= 0),
  foodpanda_net_profit numeric(14,2) not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (outlet_id, month)
);

create index if not exists users_auth_user_id_idx on public.users(auth_user_id);
create index if not exists users_outlet_id_idx on public.users(outlet_id);
create index if not exists settings_updated_by_user_id_idx on public.settings(updated_by_user_id);
create index if not exists campaigns_owner_user_id_idx on public.campaigns(owner_user_id);
create index if not exists campaign_checklist_items_campaign_id_idx on public.campaign_checklist_items(campaign_id);
create index if not exists checklist_template_items_template_id_idx on public.checklist_template_items(template_id);
create index if not exists partnerships_campaign_id_idx on public.partnerships(campaign_id);
create index if not exists partnerships_owner_user_id_idx on public.partnerships(owner_user_id);
create index if not exists mall_displays_outlet_id_idx on public.mall_displays(outlet_id);
create index if not exists mall_displays_campaign_id_idx on public.mall_displays(campaign_id);
create index if not exists events_campaign_id_idx on public.events(campaign_id);
create index if not exists events_outlet_id_idx on public.events(outlet_id);
create index if not exists events_submitter_user_id_idx on public.events(submitter_user_id);
create index if not exists events_start_at_idx on public.events(start_at);
create index if not exists event_history_logs_event_id_created_at_idx on public.event_history_logs(event_id, created_at desc);
create index if not exists event_history_logs_actor_user_id_idx on public.event_history_logs(actor_user_id);
create index if not exists tasks_outlet_id_idx on public.tasks(outlet_id);
create index if not exists tasks_assigned_by_user_id_idx on public.tasks(assigned_by_user_id);
create index if not exists tasks_assigned_to_user_id_idx on public.tasks(assigned_to_user_id);
create index if not exists tasks_event_id_idx on public.tasks(event_id);
create index if not exists vouchers_outlet_id_idx on public.vouchers(outlet_id);
create index if not exists vouchers_logged_by_user_id_idx on public.vouchers(logged_by_user_id);
create index if not exists mascot_bookings_outlet_id_idx on public.mascot_bookings(outlet_id);
create index if not exists mascot_bookings_requested_by_user_id_idx on public.mascot_bookings(requested_by_user_id);
create index if not exists mascot_bookings_approved_by_user_id_idx on public.mascot_bookings(approved_by_user_id);
create index if not exists mascot_bookings_start_at_idx on public.mascot_bookings(start_at);
create index if not exists mascot_logs_assigned_pic_user_id_idx on public.mascot_logs(assigned_pic_user_id);
create index if not exists mascot_schedule_outlet_id_idx on public.mascot_schedule(outlet_id);
create index if not exists notifications_recipient_user_id_created_at_idx on public.notifications(recipient_user_id, created_at desc);
create index if not exists notifications_unread_recipient_user_id_idx on public.notifications(recipient_user_id) where read_at is null;
create index if not exists notifications_entity_idx on public.notifications(entity_type, entity_id);
create index if not exists blog_outreach_pic_user_id_idx on public.blog_outreach(pic_user_id);
create index if not exists delivery_promos_campaign_id_idx on public.delivery_promos(campaign_id);
create index if not exists delivery_promos_pic_user_id_idx on public.delivery_promos(pic_user_id);
create index if not exists grab_daily_sales_date_idx on public.grab_daily_sales(date);
create index if not exists grab_daily_sales_merchant_idx on public.grab_daily_sales(merchant);
create index if not exists grab_daily_sales_uploaded_by_user_id_idx on public.grab_daily_sales(uploaded_by_user_id);
create index if not exists social_posts_campaign_id_idx on public.social_posts(campaign_id);
create index if not exists social_posts_outlet_id_idx on public.social_posts(outlet_id);
create index if not exists social_posts_author_user_id_idx on public.social_posts(author_user_id);
create index if not exists paid_ads_campaign_id_idx on public.paid_ads(campaign_id);
create index if not exists paid_ads_owner_user_id_idx on public.paid_ads(owner_user_id);
create index if not exists ad_hoc_tasks_creator_user_id_idx on public.ad_hoc_tasks(creator_user_id);
create index if not exists sales_outlet_id_idx on public.sales(outlet_id);
create index if not exists sales_imported_by_user_id_idx on public.sales(imported_by_user_id);
create index if not exists sales_month_key_idx on public.sales(month_key);
create index if not exists budgets_calculated_by_user_id_idx on public.budgets(calculated_by_user_id);
create index if not exists budget_source_batches_budget_id_idx on public.budget_source_batches(budget_id);
create index if not exists financials_outlet_id_idx on public.financials(outlet_id);
create index if not exists financials_uploaded_by_user_id_idx on public.financials(uploaded_by_user_id);
