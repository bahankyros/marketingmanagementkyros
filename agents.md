# Agent Instructions

## Purpose
This file is the master operating contract for any AI agent working in this repository. It defines the official stack, the non-negotiable engineering rules, and the specialized agent documents that govern implementation decisions.

## Official Stack
- Framework: Next.js
- Styling: Tailwind CSS
- Database and Auth: Firebase v9+ modular SDK
- Security contract: Firestore Security Rules are the source of truth for every write payload

## Stack Note
If parts of the codebase still reflect older structure or tooling, treat the stack above as the permanent target contract. Do not introduce patterns that conflict with Next.js, Firebase modular APIs, or Tailwind utility-first styling.

## Golden Rules
- No blind vibe coding. Inspect the relevant file, data flow, and Firestore rules before changing behavior.
- No schema guessing. Every `addDoc`, `setDoc`, `updateDoc`, batch write, upload metadata object, and derived payload must match the active Firestore rules exactly.
- Zero tolerance for `undefined` in write payloads. If a field can be missing, guard it, normalize it, or omit it before the write happens.
- Firebase Security Rules win every argument. If frontend behavior and rules disagree, the frontend must change or the rules must be intentionally updated.
- Wait for auth before data work. Do not fetch user-scoped data or write actor IDs until `user.uid` is actually available.
- Keep writes explicit. Use named payload objects, stable field names, and predictable timestamps such as `createdAt` and `updatedAt` when required by schema.
- Keep reads bounded. No unfiltered collection scans for dashboards, exports, or convenience utilities.
- Make surgical changes. Fix the problem with the smallest safe diff and avoid unrelated rewrites.
- Preserve operator trust. This is a utility-driven Marketing Operations Control Center, not a glossy demo app.

## Required Workflow For Any Change
1. Read the relevant UI file, shared hook, and Firestore rule block before editing.
2. Map the exact fields required for create and update operations.
3. Check every write source for nullable state, missing auth, and optional upload values.
4. Apply the smallest safe code change.
5. Verify the changed path cannot send `undefined`, wrong field names, or forbidden fields.
6. Keep role-based UI actions aligned with backend permissions so users do not hit avoidable `permission-denied` failures.

## Stop Conditions
- Stop and inspect if a write path does not clearly map to a Firestore rule.
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
- Prefer secure, bounded Firebase queries over convenience reads.
- Prefer code that is obvious to audit over code that is clever.
