-- Delta patch: enable global read-only campaign visibility.
-- Run this in the Supabase SQL Editor after review.
-- This intentionally leaves INSERT, UPDATE, and DELETE policies unchanged.

drop policy if exists "campaigns_visible_select" on public.campaigns;

create policy "campaigns_visible_select" on public.campaigns
  for select to authenticated
  using ((select public.is_active_app_user()));

-- Campaign detail reads checklist rows. Opening SELECT here prevents read-only
-- users from seeing campaign cards while the detail view is blocked by RLS.
-- Checklist writes remain governed by the existing admin/manage policies.
drop policy if exists "campaign_checklist_items_campaign_select" on public.campaign_checklist_items;

create policy "campaign_checklist_items_campaign_select" on public.campaign_checklist_items
  for select to authenticated
  using ((select public.is_active_app_user()));
