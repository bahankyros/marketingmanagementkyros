# Firestore Security Spec

## 1. Data Invariants
1. **Total Isolation of System Variables**: No Outlet Supervisor or Admin can directly mutate global config / roles without verification.
2. **Action-Based Lifecycle Locking**: Events, Displays, and Partnerships move via restricted fields (`decisionStatus`, etc.). Supervisors cannot force an 'Approved' state.
3. **Role Strictness**: Supervisors (`role == 'supervisor'`) cannot delete documents. Admins (`role == 'admin'`) can delete.
4. **Data Integrity**: All numbers (`spend`, `budget`, `salesGenerated`) must be numeric. Text strings must be length-capped.
5. **No Blind Array Appends**: Arrays are either strictly omitted or bounded.
6. **Mascot Maintenance Constraint**: A mascot condition can only be updated, not deleted or replaced with unknown types.

## 2. The "Dirty Dozen" Payloads
These payloads are designed to test the robustness of the schema and logic:
1. **The Phantom Approver**: Supervisor attempts to update `decisionStatus: 'Approved'`.
2. **The Budget Drain**: Updating `budgetUsed` directly with `1000`.
3. **Orphan Drop**: Deleting a Campaign as a Supervisor.
4. **The Ghost Field**: Passing `isAdmin: true` during profile creation/update.
5. **String Math Attack**: Passing `spend: "1000"` (String) instead of Number.
6. **Bypass ID**: Supervisor trying to update another outlet's event.
7. **The Silent Delete**: Attempting to set `salesGenerated` to `null`.
8. **Denial of Wallet**: Passing a 2MB string into `notes` or `title`.
9. **Role Escalation**: Setting `role: 'admin'` in `users` collection.
10. **Array Explosion**: Appending 500 items to a nonexistent `tags` array.
11. **Time Warp**: Setting `createdAt` to a past date during creation.
12. **The Undeclared Root Write**: Attempting to write to `/databases/(default)/documents/config/globals`.

## 3. The Test Runner
The `firestore.rules.test.ts` file will execute the above payloads against a local emulator or dry-run validator if applicable, expecting `PERMISSION_DENIED`.
