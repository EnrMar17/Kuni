@AGENTS.md

# Kuni project instructions

## Stack

- Next.js 16 App Router, React 19, TypeScript 5 and Tailwind CSS 4.
- Supabase Auth/Postgres with RLS is the target backend; UI may use explicit fixtures until integration.
- Zod schemas in `src/contracts/` are the boundary between UI, Server Actions and backend work.

## Structure

- `src/app/(auth)/`: public authentication routes.
- `src/app/(protected)/`: authenticated clinical pages.
- `src/actions/`: Server Actions; authorization must be checked inside every action.
- `src/components/`: shared UI.
- `src/lib/queries/`: read models and temporary fixtures.
- `src/lib/auth/`: session and unit/room authorization helpers.
- `src/contracts/`: shared DTOs, schemas and action result types.

## Conventions

- Keep routes as Server Components unless browser state or React form state requires a Client Component.
- Validate untrusted form and route data with Zod.
- Every clinical read/write is scoped by `unit_id`; selecting a room never expands authorization.
- Use the exact SQL states documented in `README.md` and `src/contracts/`.
- Keep adherence and response coverage separate; zero denominator is “Sin datos”.
- Label fixtures and simulations clearly. Never present rule-based priority as a validated prediction.
- Preserve Spanish (`es-MX`) for user-facing clinical UI and error messages.

## Verification

- Lint: `npm run lint`
- Types: `npx tsc --noEmit`
- Production build: `npm run build`
- Tests belong under `tests/unit`, `tests/integration` or `tests/e2e` as the suite grows.
