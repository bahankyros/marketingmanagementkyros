# V3 Design System Blueprint

## Goal
Align the Ops Control Center under one practical, reusable, responsive UI system without changing product scope or backend behavior.

## Core Contract
- Supabase Auth is the canonical authentication system for V3.
- Supabase Postgres is the canonical database and backend system for V3.
- Firebase Auth, Firestore, Firebase Storage, and Firebase Security Rules are no longer canonical backend systems for V3.

## Design Principles
- Keep the interface operational, fast, and audit-friendly.
- Prioritize clarity, hierarchy, and role-aware actions over decorative styling.
- Standardize shared patterns before page-by-page polish.
- Treat mobile responsiveness as a required behavior, not a later cleanup pass.

## Phase 1: Visual Foundation
- [ ] Define a unified color palette for:
  - primary action
  - success
  - warning
  - destructive
  - neutral surfaces
  - borders
  - text hierarchy
- [ ] Replace one-off page color decisions with shared semantic usage.
- [ ] Define the typography system:
  - page title
  - section title
  - card title
  - body text
  - caption/meta text
  - button/label text
- [ ] Standardize spacing, radius, border, and shadow tokens for panels, forms, and data cards.

## Phase 2: Reusable Component System
- [ ] Create shared button variants:
  - primary
  - secondary
  - ghost
  - destructive
  - inline icon action
- [ ] Create shared card and panel shells for:
  - dashboard sections
  - settings blocks
  - calendar side panels
  - inbox/task summaries
- [ ] Create shared modal and confirmation dialog patterns.
- [ ] Create shared status badge styles for:
  - active states
  - pending states
  - warning states
  - locked/completed states
- [ ] Create shared empty, loading, and error state components.

## Phase 3: Responsive Layout Pass
- [ ] Audit every major page for mobile and tablet breakpoints:
  - Login / Ops Control Center entry
  - Dashboard
  - Settings
  - Sales & Budget
  - Mall Displays
  - Vouchers
  - Tasks
  - Event Calendar
  - Mascot Management
  - Inbox
- [ ] Convert any desktop-only multi-column layouts into stacked responsive flows where needed.
- [ ] Ensure tables, history views, and dense admin panels degrade cleanly on narrow screens.
- [ ] Standardize sidebar and top-level navigation behavior for smaller devices.
- [ ] Verify tap targets, modal sizing, and form spacing on mobile.

## Phase 4: Journey And Flow Polish
- [ ] Refine the login and blocked-state journey for first-use clarity.
- [ ] Reduce friction in Settings by grouping admin actions into clearer sections.
- [ ] Improve the Sales import flow so validation, import, and history read as one coherent journey.
- [ ] Improve Field Ops flows so supervisors can complete vouchers, tasks, and mascot requests with fewer visual jumps.
- [ ] Polish the calendar workflow so event details, linked tasks, and request states are easier to scan.
- [ ] Polish the inbox so priority items are visually distinct and easy to triage.

## Page Priority Order
1. Login and auth states
2. Layout and navigation shell
3. Dashboard
4. Sales & Budget
5. Settings
6. Tasks and Inbox
7. Event Calendar and Mascot Management
8. Remaining Field Ops pages

## Done Criteria
- [ ] The app uses one clear visual system across all major pages.
- [ ] Shared components replace repeated button/card/modal patterns.
- [ ] Core workflows are responsive on mobile, tablet, and desktop.
- [ ] Layout flow is clearer for admins and supervisors.
- [ ] UI polish improves usability without changing approved business logic.
