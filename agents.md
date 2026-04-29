# Agent Instructions

## Purpose
This file is the master operating contract for any AI agent working in this repository. It defines the official stack, the non-negotiable engineering rules, and the specialized agent documents that govern implementation decisions.

## Official Stack
- Framework: React + Vite
- Styling: Tailwind CSS
- Database and Auth: Supabase Auth + Supabase Postgres
- Security contract: Supabase RLS policies, Postgres constraints, and Supabase Storage policies are the source of truth for every write payload

## Stack Note
If parts of the codebase still reflect older structure or tooling, treat the stack above as the permanent target contract. Do not introduce patterns that conflict with React, Vite, Supabase Auth, Supabase Postgres, or Tailwind utility-first styling.

## Golden Rules
- No blind vibe coding. Inspect the relevant file, data flow, Supabase query path, and RLS policy before changing behavior.
- No schema guessing. Every `insert`, `update`, `upsert`, `delete`, RPC call, upload metadata object, and derived payload must match the active Postgres schema and RLS/storage policy exactly.
- Zero tolerance for `undefined` in write payloads. If a field can be missing, guard it, normalize it, or omit it before the write happens.
- Supabase RLS, Postgres constraints, and Storage policies win every argument. If frontend behavior and backend policy disagree, the frontend must change or the policy must be intentionally updated.
- Wait for auth before data work. Do not fetch user-scoped data or write actor IDs until `user.id` and the application user profile are actually available.
- Keep writes explicit. Use named payload objects, stable field names, and predictable timestamps such as `createdAt` and `updatedAt` when required by schema.
- Keep reads bounded. No unfiltered table scans for dashboards, exports, or convenience utilities.
- Make surgical changes. Fix the problem with the smallest safe diff and avoid unrelated rewrites.
- Preserve operator trust. This is a utility-driven Marketing Operations Control Center, not a glossy demo app.

## Required Workflow For Any Change
1. Read the relevant UI file, shared hook, schema block, and RLS/storage policy before editing.
2. Map the exact fields required for create and update operations.
3. Check every write source for nullable state, missing auth, and optional upload values.
4. Apply the smallest safe code change.
5. Verify the changed path cannot send `undefined`, wrong field names, or forbidden fields.
6. Keep role-based UI actions aligned with backend permissions so users do not hit avoidable RLS or storage policy failures.

## Stop Conditions
- Stop and inspect if a write path does not clearly map to a Postgres schema, RLS policy, RPC contract, or storage policy.
- Stop and inspect if a required field has no trustworthy source value.
- Stop and inspect if a change would require broad UI redesign instead of a surgical fix.

## Specialist Directories
- Backend and logic specialist: [data-analyst.md](./data-analyst.md)
- UI and interaction specialist: [frontend-dev.md](./frontend-dev.md)
- Export and reporting specialist: [report-builder.md](./report-builder.md)
- Refactor and integration specialist: [safe-refactor.md](./safe-refactor.md)

## Default Delivery Standard
- Prefer small, reviewable diffs.
- Prefer modular hooks over heavy component logic.
- Prefer toast feedback over blocking browser alerts.
- Prefer secure, bounded Supabase queries or RPCs over convenience reads.
- Prefer code that is obvious to audit over code that is clever.
