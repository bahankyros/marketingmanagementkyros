# AI Rules

## Database Caution

- NEVER rewrite massive SQL files unless the Lead Architect explicitly requests a full-file rewrite.
- NEVER use destructive SQL such as `DROP TABLE`, `DROP SCHEMA`, `DROP DATABASE`, broad `DELETE`, or destructive migration resets without explicit permission.
- Prefer Delta SQL: provide incremental, idempotent patches using patterns such as `create table if not exists`, `alter table ... add column if not exists`, `drop policy if exists` followed by `create policy`, and `create or replace function`.
- Before changing SQL, inspect the relevant blocks in `supabase_schema.sql` and `supabase_rls.sql`.
- Treat Supabase RLS policies, Postgres constraints, RPC contracts, and Storage policies as the source of truth.
- Do not guess table names, column names, enum values, storage buckets, or RPC signatures.

## Role Integrity

- Roles are lowercase only: `admin`, `supervisor`, `finance`, and `pic`.
- Always normalize roles with `.toLowerCase().trim()` before role comparisons or database payload construction.
- NEVER write role payloads as `PIC`, `Admin`, `Supervisor`, or any other mixed-case variant.
- When inserting or updating user profiles, ensure the outgoing `role` value matches the `users.role` check constraint exactly.
- UI labels may display `PIC`, but database payloads and role logic must use `pic`.

## Contextual Awareness

- Always inspect RLS policies and the current `userData.role` / `userData.outlet_id` flow before rendering buttons, enabling forms, fetching data, or writing records.
- Do not show write actions that Supabase RLS will reject.
- Do not fetch user-scoped data until auth and the application user profile are loaded.
- PIC and supervisor views must remain outlet-scoped through `outlet_id` unless a specific RLS policy allows creator, assignee, requester, approver, or recipient access.
- Admin UI may expose broader operations only when the current profile role is `admin`.
- Finance UI must remain aligned with finance/reporting permissions and must not assume admin write access.
- Every Supabase write payload must be explicit, schema-aligned, and free of `undefined`.
- For private Storage, store object paths and resolve signed URLs; do not rely on public URLs.

## Surgical Coding

- Make the smallest safe diff that fixes the requested issue.
- When providing fixes, give the exact function, JSX block, SQL patch, or line-level snippet needed.
- Do not output or rewrite an entire 1,000-line file unless the Lead Architect explicitly asks for the complete file.
- Diagnose reported errors first; do not throw code at symptoms without checking the relevant file, query path, schema, and RLS policy.
- Preserve existing architecture, naming, role boundaries, and UI patterns.
- Avoid unrelated refactors, formatting churn, broad redesigns, and opportunistic cleanup.
- Use Vite-native environment access through `import.meta.env`; do not introduce Node-style frontend env access.

## Verification

- For frontend changes, run `npm.cmd run lint` and `npm.cmd run build` when feasible.
- For Supabase changes, provide manual SQL execution steps and the exact Delta SQL patch.
- For role-sensitive features, verify the route guard, sidebar visibility, page-level button visibility, Supabase query filters, and RLS policy all agree.
- Keep `.codex/` untracked unless explicitly instructed otherwise.
