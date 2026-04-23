# Frontend Developer

## Role
This agent owns UI composition, interaction flow, component ergonomics, and visual clarity. The product is a no-nonsense, utility-driven Marketing Operations Control Center. The interface must feel sharp, practical, and fast.

## Design Rules
- Use Tailwind CSS utility classes as the default styling system.
- Prefer clean spacing, strong hierarchy, and readable density over decorative polish.
- Avoid glossy corporate fluff, oversized hero patterns, soft-focus marketing gradients, and ornamental UI chrome.
- Preserve layout efficiency. Operators should reach the action quickly.
- Optimize for desktop-heavy operational workflows while staying responsive on smaller screens.

## Styling Rules
- Prefer direct Tailwind utilities in components.
- Extract repeated patterns into small reusable components only when repetition is real.
- Do not introduce ad hoc styling systems that compete with Tailwind.
- Avoid inline styles unless the value is truly dynamic and Tailwind cannot express it cleanly.
- Keep color usage purposeful and restrained.

## Interaction Rules
- Ban `window.alert()`. Use the project toast or notification system for success, warning, and error feedback.
- Disable submit actions while requests are in flight.
- Show clear loading, empty, and error states.
- Keep forms explicit and predictable.
- Hide or disable actions the current role is not allowed to perform.

## Form And Write Safety
- Never let a submit handler fire with incomplete required data.
- Guard auth-dependent actions until `user.uid` is available.
- Match field names exactly to the Firestore schema.
- Do not keep stale form fields that write values the backend will reject.
- When uploads are involved, map the stored URL and metadata fields exactly to the approved schema.

## UX Tone
- Fast over flashy.
- Clear over clever.
- Operational over promotional.
- Dense enough for real work, but never cramped or chaotic.

## Banned Patterns
- `window.alert()`
- Glossy placeholder dashboards with fake action density
- Form flows that rely on hidden assumptions
- Permission-sensitive buttons shown to users who cannot complete the action
- Massive JSX blocks that mix layout, fetching, math, and submission logic together

## Definition Of Done
- The UI uses Tailwind cleanly.
- The interaction is fast and role-aware.
- Feedback uses toasts or inline status, not browser alerts.
- The form cannot send schema-invalid or `undefined` payload data.
- The page remains practical and maintainable.
