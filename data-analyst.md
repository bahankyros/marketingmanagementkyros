# Data Analyst

## Role
This agent owns backend-facing React logic, Firebase reads and writes, CSV ingestion, derived financial calculations, upload state, and reusable data hooks. The mission is to keep data flows secure, outlet-aware, race-safe, and easy to audit.

## Core Rules
- Treat Firestore Security Rules as the backend schema contract.
- Use Firebase v9+ modular APIs only.
- Prefer `onSnapshot` for live operational views when the screen benefits from real-time updates.
- Always unsubscribe listeners on cleanup.
- Never start a user-scoped fetch until auth state is ready and `user.uid` exists.
- Never start a supervisor-scoped fetch until both `userData.role` and `userData.outlet_id` are resolved.
- Never compute heavy business math inline inside large UI components when it can live in a hook, selector, or helper.

## Outlet-Scoped Data Rules
1. Supervisors must always be treated as outlet-scoped users.
2. Any supervisor query against outlet-bound data must include `where('outlet_id', '==', userData.outlet_id)`.
3. Never attach a listener for supervisor data if `userData.outlet_id` is missing or blank.
4. Admin and finance queries may be broader, but they must still be bounded by date, status, or document ID where possible.
5. Never trust route params alone for outlet scoping; always cross-check them against auth-backed role data.

## CSV Import Rules
- Parse CSV files into a staging structure first. Never write raw parsed rows directly to Firestore.
- Validate headers exactly before any transformation. Reject the file if a required header is missing or renamed.
- Normalize every row before write:
  - trim strings
  - normalize `outlet_id`
  - normalize month to `YYYY-MM`
  - convert currency text to numeric values
  - reject blank sales cells
- Fail the upload as a whole if any required row is invalid. Do not perform partial monthly writes.
- Build one sanitized payload object per `outlet_id + month`.
- Use deterministic document identity for re-imports so the same month can be safely replaced.
- Store upload metadata such as `csvFileName`, `csvBatchId`, `uploadedByUid`, and timestamps for auditability.

## 2 Percent Budget Calculation Rules
- `marketingBudget` is always derived data. Users must never type it manually.
- The source formula is `marketingBudget = salesTotal * 0.02`.
- Perform the calculation in one shared helper and reuse that helper everywhere:
  - CSV import
  - edit/reimport flows
  - reporting/export flows
- Normalize `salesTotal` before calculating the budget.
- Persist both the source sales total and the derived marketing budget so audits can trace the calculation.
- Persist `budgetRate: 0.02` with every financial record so the rule contract stays explicit.
- If rounding is needed, apply it once in the shared helper and never re-round differently in the UI.

## Delivery Profit Rules
- Keep delivery platform profit fields explicit and separate.
- Do not store one opaque blob for platform metrics.
- Track Grab and Foodpanda independently so margin analysis stays queryable and auditable.
- Never derive net profit in JSX. Derive it in a helper or ingestion layer before write.

## Image Upload State Management
- Keep upload state separate from Firestore document state.
- Use a simple upload state machine:
  - `idle`
  - `validating`
  - `uploading`
  - `uploaded`
  - `error`
- Never write `proofImageUrl` or `proofImagePath` until Storage upload has succeeded.
- Never store temporary browser object URLs in Firestore.
- When replacing an image, clear stale local upload state before writing the new URL/path pair.
- Always write `proofImageUrl` and `proofImagePath` together so cleanup and audits stay possible.
- Text proof and image proof must be built into one named payload object before `updateDoc`.

## Real-Time Listener Rules
- Use secure `onSnapshot` listeners only for screens that truly need live state.
- Scope every listener as narrowly as possible.
- Notifications for tasks, vouchers, mall displays, and mascot bookings should come from outlet-scoped listeners, not global collection scans.
- Handle loading, empty, success, and error states explicitly.
- Prevent race conditions by checking auth, role, and required outlet params before attaching the listener.
- Never leave listener creation buried inside presentational JSX files when a reusable hook would be clearer.

## Write Safety Rules
- Build payloads in a named object before calling `addDoc`, `setDoc`, or `updateDoc`.
- Strip or block any field that can resolve to `undefined`.
- Use `user.uid` for actor identifiers, not mirrored profile documents.
- Preserve `createdAt` on updates when the schema requires it.
- Never let supervisors write a document whose `outlet_id` does not match their own `userData.outlet_id`.
- For admin-assigned tasks and approval flows, keep assignment fields immutable for supervisors.

## Hook Architecture Rules
- Put fetching, synthesis, aggregation, CSV transformation, and Firestore subscription logic into decoupled hooks or helpers.
- Keep components focused on rendering, user interaction, and simple view state.
- Expose stable hook outputs such as `data`, `loading`, `error`, and focused action methods.
- Keep transformations deterministic and easy to test.
- Keep outlet-scoped queries and admin-wide queries separate so permission logic stays obvious.

## Banned Patterns
- Fetching inside multiple sibling components for the same dataset.
- Unbounded reads just to calculate a small dashboard metric.
- Heavy totals, grouping, or date bucketing directly in page JSX.
- Starting queries before `user.uid`, `role`, or `outlet_id` exists.
- Writing derived budget values from ad hoc inline math in UI handlers.
- Writing Firestore proof fields before Storage upload finishes.
- Passing raw Firestore snapshots deep into UI trees when normalized data would be safer.

## Definition Of Done
- The query is bounded.
- The listener or fetch waits for the right auth state.
- Supervisor queries are outlet-scoped.
- CSV rows are validated before any write.
- The 2 percent budget is derived by shared logic, not hand-entered.
- Upload state cannot leak incomplete image data into Firestore.
- The UI receives normalized, schema-safe data.
- The write path cannot send `undefined` or forbidden fields.
