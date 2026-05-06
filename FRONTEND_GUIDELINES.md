# Frontend Guidelines

## Tech Stack & Libraries

- Framework: React 19 with TypeScript.
- Build tool: Vite.
- Styling: Tailwind CSS 4 via `@tailwindcss/vite` and global tokens in `src/index.css`.
- Routing: `react-router` with nested authenticated routes.
- Backend client: `@supabase/supabase-js`.
- Auth/data context: `src/lib/AuthContext.tsx` and Supabase-backed profile data.
- Icons: `lucide-react`.
- Animation: `motion/react`.
- Charts: `recharts`.
- CSV parsing: `papaparse` for Grab Daily Sales ingestion.
- Supabase environment variables must use Vite-native `import.meta.env`, specifically `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Component Architecture

- `src/main.tsx` mounts the React app and imports global CSS.
- `src/App.tsx` is the route authority.
  - Wraps the app in `AuthProvider`.
  - Uses `BrowserRouter`, `Routes`, and nested `Route` definitions.
  - Uses `ProtectedRoute` for authenticated shell access.
  - Uses `RoleGuard` for role-restricted pages.
- `src/components/Layout.tsx` is the authenticated app shell.
  - Owns the sidebar navigation.
  - Filters navigation items by `adminOnly` and `allowedRoles`.
  - Provides the mobile drawer and responsive layout wrapper.
  - Renders child pages through `<Outlet />`.
  - Wraps route transitions with `AnimatePresence` and `motion.div`.
- `src/pages/*` contains feature-level page modules.
  - Each major module is a page component: `Dashboard`, `Tasks`, `Events`, `Inbox`, `Mascots`, `DeliveryPromos`, `Sales`, `Settings`, and related marketing pages.
  - Pages commonly define local TypeScript types, row normalizers, form state builders, fetch functions, mutation handlers, and drawer/modal JSX in the same file.
  - Keep edits surgical inside the owning page unless a shared hook/helper is already established.
- `src/components/Skeleton.tsx` is the current shared UI primitive for loading states.
- `src/lib/*` contains shared frontend infrastructure.
  - `supabase.ts` creates the Supabase client.
  - `AuthContext.tsx` owns auth/session/profile state.
  - `supabaseData.ts` provides normalization helpers and `subscribeToTable`.
  - `privateStorage.ts` converts storage object paths into signed URLs.
  - `useCampaigns.ts` and `useDashboardData.ts` are shared data hooks.

## State & Data Fetching

- Page state is primarily managed with `useState`, `useEffect`, and `useMemo`.
- Always wait for auth and profile state before fetching user-scoped data.
  - Typical guards check `user`, `userData`, `userData.role`, `userData.id`, and `userData.outlet_id`.
- Supabase reads use direct query builders:
  - `supabase.from(table).select(...)`
  - `.eq(...)`, `.in(...)`, `.not(...)`, `.order(...)`, `.limit(...)`
- Supabase writes use explicit payload objects with schema-aligned field names.
  - Do not send `undefined`.
  - Use `null`, empty strings, or omit fields intentionally based on the table contract.
  - Normalize role values to lowercase before role checks or payload writes.
- RPC calls are used for backend-owned operations, such as `import_sales_budget`.
- Realtime updates use either:
  - Direct `supabase.channel(...).on('postgres_changes', ...).subscribe()`
  - The shared `subscribeToTable(channelName, table, onChange)` helper.
- Every realtime subscription must be cleaned up with `supabase.removeChannel(channel)` or the unsubscribe function returned by `subscribeToTable`.
- Row data is normalized before rendering.
  - Prefer local `normalize*` helpers or shared helpers from `supabaseData.ts`.
  - Convert dates, UUIDs, numbers, and optional strings before placing them in UI state.
- Storage uploads must use private bucket object paths.
  - Upload through `supabase.storage.from(bucket).upload(...)`.
  - Display files through `createPrivateStorageUrl(...)`.
  - Do not rely on public URLs for private evidence/proof assets.
- User feedback follows the existing local `feedback` state pattern.
  - Log technical details with `console.error`.
  - Show concise user-facing success/error copy in page-level alert blocks.

## Styling Rules

- The visual language is professional, dense, operational, and "Tokyo-Venzer" in spirit: crisp monochrome surfaces, high information density, restrained color, hard edges, and utility-first layout.
- Prefer practical control-center UI over marketing-style presentation.
  - No decorative hero sections for app modules.
  - No ornamental gradients, blobs, or card-heavy landing-page composition inside the product shell.
- Use Tailwind utility classes directly in `className`.
- Global CSS intentionally normalizes visual noise.
  - `.rounded*` classes are forced to `border-radius: 0`.
  - `.shadow*` classes are forced to no shadow.
  - Neutral and semantic color utilities are mapped to CSS variables in `src/index.css`.
- Standard page layout pattern:
  - Root: `space-y-6 pb-12`
  - Header: `flex flex-col gap-4 md:flex-row md:items-center md:justify-between`
  - Content cards: `border border-neutral-100 bg-white p-6`
  - Dense grids: `grid grid-cols-1 gap-6 md:grid-cols-*` or `xl:grid-cols-*`
- Standard typography pattern:
  - Page title: `text-3xl font-bold tracking-tight text-neutral-900`
  - Section title: `text-lg` or `text-xl` with `font-bold`
  - Supporting copy: `text-sm text-neutral-500`
  - Small labels/badges: `text-[10px]` or `text-[11px]`, `font-bold`, `uppercase`, `tracking-wider`
- Standard controls:
  - Buttons are usually `inline-flex items-center gap-2`, with `lucide-react` icons.
  - Inputs/selects/textareas use neutral backgrounds, borders, compact padding, and focus rings.
  - Disabled states must be visible with `disabled:cursor-not-allowed` and muted backgrounds/text.
- Drawers and modals follow the right-side panel pattern.
  - Overlay: `fixed inset-0 z-40 bg-neutral-900/30 backdrop-blur-sm`
  - Panel: `fixed right-0 top-0 bottom-0 z-50 flex w-full max-w-md flex-col border-l border-neutral-200 bg-white`
  - Header/footer sections use `border-neutral-100` and `bg-neutral-50`.
- Status should be visible but restrained.
  - Use compact uppercase badges.
  - Prefer semantic colors only for status, warnings, and errors.
- Keep UI role-aware.
  - Do not show write actions that RLS will reject.
  - Route guards, sidebar visibility, and page-level controls must stay aligned with Supabase RLS.
