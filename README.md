# GymOS-Platform

The GymOS **Super Admin web application** — the platform operator console
(dashboard, gym/tenant management, subscriptions & billing, platform users, feature
flags, monitoring, settings). Next.js / TypeScript / Tailwind / shadcn/ui, per the
frozen architecture in [GymOS-Specification](../GymOS-Specification)
(frontend layout: ARCHITECTURE.md §4.2; repository map: **ADR-52**).

**Status: not started.** Scaffolding lands with the first UI milestone; the API it
consumes is being built in [GymOS-Backend](../GymOS-Backend).

Standing rules:

- API types are **generated from the backend's OpenAPI document** per version
  (AD-12/AD-37) — no hand-written DTO types.
- The sidebar renders the permission- and feature-filtered tree from `/api/v1/navigation`;
  `usePermission()` hides UI but never authorizes (AD-5/AD-22).
- UI scope obeys the Golden Rule (PRODUCT-PRINCIPLES.md): fewest clicks to complete a
  task beats polish; screens ship trimmed against "does this reduce work?".
