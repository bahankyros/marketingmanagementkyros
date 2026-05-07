-- Delta patch: enable global read-only mascot visibility.
-- Run this in the Supabase SQL Editor after review.
-- This intentionally leaves INSERT, UPDATE, and DELETE policies unchanged.

drop policy if exists "Allow all staff to read mascot logs" on public.mascot_bookings;
drop policy if exists "mascot_bookings_outlet_select" on public.mascot_bookings;
drop policy if exists "mascot_bookings_active_select" on public.mascot_bookings;

create policy "mascot_bookings_active_select" on public.mascot_bookings
  for select to authenticated
  using ((select public.is_active_app_user()));

drop policy if exists "Allow all staff to read mascot logs" on public.mascot_logs;
drop policy if exists "mascot_logs_pic_select" on public.mascot_logs;
drop policy if exists "mascot_logs_active_select" on public.mascot_logs;

create policy "mascot_logs_active_select" on public.mascot_logs
  for select to authenticated
  using ((select public.is_active_app_user()));

drop policy if exists "Allow all staff to read mascot logs" on public.mascot_schedule;
drop policy if exists "mascot_schedule_outlet_select" on public.mascot_schedule;
drop policy if exists "mascot_schedule_active_select" on public.mascot_schedule;

create policy "mascot_schedule_active_select" on public.mascot_schedule
  for select to authenticated
  using ((select public.is_active_app_user()));
