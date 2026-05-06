# Kyros Marketing Management Project State

## Project Summary

Kyros Marketing Management is a React, Vite, Tailwind CSS, and Supabase portal for marketing operations control across outlets. Supabase Auth, Postgres, Storage, RPCs, triggers, and RLS policies are the source of truth for identity, role access, write permissions, uploads, and operational data integrity.

## Current Execution State

- Core stack is aligned on React, TypeScript, Vite, Tailwind CSS, React Router, and Supabase.
- RBAC roles are `admin`, `supervisor`, `finance`, and `pic`; routes and sidebar links are guarded by role.
- Supabase schema includes operational modules for outlets, users, campaigns, mall displays, events, event history logs, tasks, vouchers, mascot bookings, notifications, delivery promos, Grab daily sales, social posts, paid ads, sales, budgets, and financials.
- Auth recovery foundation is present through `claim_user_profile()` and app-user helper functions.
- Private Supabase Storage buckets are defined for event proofs, task proofs, campaign assets, and mall display proofs.
- Grab Daily Sales CSV ingestion is implemented with `papaparse`, stored in `grab_daily_sales`, and visualized with `recharts`.
- Sales import uses the `import_sales_budget` RPC to import sales rows and update monthly budget rollups transactionally.
- Calendar/Event module supports permitted event creation and updates, monthly event summaries, event detail views, linked tasks, and `event_history_logs` Recent Activity reads/writes.
- Task Bridge is implemented: PIC users can request admin action from `Tasks`, requests are written to `tasks`, and admins see `Action Required: PIC Requests` on the dashboard.
- Mascot Management is implemented against `mascot_bookings`, with outlet requests, admin approval/rejection, condition logs, and RLS-aware visibility.
- Notification backend is defined through the `notifications` table, notification triggers, and read RPCs.
- Inbox UI is live for tasks and mascot booking alerts, but currently synthesizes alerts from source tables and local read state rather than consuming `notifications` directly.

## Active Roadmap

- Verify the live Supabase project has the latest schema/RLS patches applied for `event_history_logs`, `notifications`, storage buckets, and the Task Bridge admin-profile read policy.
- Run production smoke tests for PIC Task Bridge visibility, admin assignee loading, request submission, and Admin Dashboard reception.
- Upgrade Inbox to consume first-class `notifications` rows directly, use `mark_notification_read()` and `mark_all_notifications_read()`, and expose true unread counts.
- Add notification UI links for task and mascot entities, then retire or reconcile the current synthesized Inbox read-state model.
- Finish Finance hardening by validating `import_sales_budget`, budget source batches, `financials`, and report/dashboard rollups against RLS.
- Polish high-traffic workflows for Tasks, Inbox, Calendar, and Mascot Management on mobile and tablet breakpoints.
- Add a concise manual regression checklist for role-scoped flows: admin, PIC, supervisor, and finance.
