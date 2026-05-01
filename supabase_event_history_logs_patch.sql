-- Idempotent patch for the Calendar/Event Recent Activity feature.
-- Run this in Supabase SQL Editor before testing event history logs on live.

create table if not exists public.event_history_logs (
  id uuid default gen_random_uuid() primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  action_type text not null check (action_type in ('created', 'updated')),
  description text not null default '',
  created_at timestamp with time zone not null default now()
);

alter table public.event_history_logs
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists event_id uuid,
  add column if not exists actor_user_id uuid,
  add column if not exists action_type text,
  add column if not exists description text,
  add column if not exists created_at timestamp with time zone;

update public.event_history_logs set id = gen_random_uuid() where id is null;
update public.event_history_logs set action_type = 'updated' where action_type is null;
update public.event_history_logs set description = '' where description is null;
update public.event_history_logs set created_at = now() where created_at is null;

alter table public.event_history_logs
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column event_id set not null,
  alter column action_type set not null,
  alter column description set default '',
  alter column description set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where contype = 'p'
      and conrelid = 'public.event_history_logs'::regclass
  ) then
    alter table public.event_history_logs
      add constraint event_history_logs_pkey primary key (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_history_logs_event_id_fkey'
      and conrelid = 'public.event_history_logs'::regclass
  ) then
    alter table public.event_history_logs
      add constraint event_history_logs_event_id_fkey
      foreign key (event_id) references public.events(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_history_logs_actor_user_id_fkey'
      and conrelid = 'public.event_history_logs'::regclass
  ) then
    alter table public.event_history_logs
      add constraint event_history_logs_actor_user_id_fkey
      foreign key (actor_user_id) references public.users(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_history_logs_action_type_check'
      and conrelid = 'public.event_history_logs'::regclass
  ) then
    alter table public.event_history_logs
      add constraint event_history_logs_action_type_check
      check (action_type in ('created', 'updated'));
  end if;
end $$;

create index if not exists event_history_logs_event_id_created_at_idx
  on public.event_history_logs(event_id, created_at desc);
create index if not exists event_history_logs_actor_user_id_idx
  on public.event_history_logs(actor_user_id);

create or replace function public.can_access_event(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_event_id is not null
    and exists (
      select 1
      from public.events e
      where e.id = target_event_id
        and (
          (select public.is_admin())
          or (select public.owns_outlet(e.outlet_id))
          or (select public.is_current_app_user(e.submitter_user_id))
        )
    )
$$;

revoke all on function public.can_access_event(uuid) from public;
grant execute on function public.can_access_event(uuid) to authenticated;

alter table public.event_history_logs enable row level security;

drop policy if exists "event_history_logs_admin_all" on public.event_history_logs;
drop policy if exists "event_history_logs_event_select" on public.event_history_logs;
drop policy if exists "event_history_logs_event_insert" on public.event_history_logs;

create policy "event_history_logs_admin_all" on public.event_history_logs
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "event_history_logs_event_select" on public.event_history_logs
  for select to authenticated
  using ((select public.can_access_event(event_id)));

create policy "event_history_logs_event_insert" on public.event_history_logs
  for insert to authenticated
  with check (
    (select public.is_current_app_user(actor_user_id))
    and (select public.can_access_event(event_id))
  );
