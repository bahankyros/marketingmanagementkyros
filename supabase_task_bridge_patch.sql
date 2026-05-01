-- Idempotent patch for Phase 2: PIC-to-Admin Task Bridge.
-- Run this in Supabase SQL Editor before testing PIC admin task requests on live.

alter table public.users enable row level security;

drop policy if exists "users_active_admin_select" on public.users;

create policy "users_active_admin_select" on public.users
  for select to authenticated
  using (
    role = 'admin'
    and status = 'active'
    and (select public.is_active_app_user())
  );
