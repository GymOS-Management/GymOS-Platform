# Dependency policy

The frontend analogue of GymOS-Backend's `docs/Engineering/DEPENDENCY_POLICY.md`: an **allowlist, not a
blocklist**, enforced by `scripts/check-dependencies.mjs` in CI. The policy and the check change **in
the same commit** — a policy the check does not enforce is a wish, and a check the policy does not
explain is a mystery.

## Rules

0. **Nothing published in the last two days is installed.** `minimumReleaseAge: 2880` in
   `pnpm-workspace.yaml`. A brand-new version is the window in which a compromised maintainer account
   or a typosquat is most likely to be caught, and this project never needs a package on its release
   day. The setting lives in the repo, not only in a developer's global config, so the lockfile —
   which is the artefact that has to comply — is generated the same way everywhere, CI included.
   `packageManager` pins the pnpm version so nobody's toolchain silently lacks the policy.

   If a resolution is refused, the fix is `pnpm clean --lockfile && pnpm install`, which re-resolves
   to the newest versions _older_ than the cutoff. Relaxing the policy is not the fix.

0b. **No package runs install-time scripts unless it is named in `allowBuilds`,** with a reason. An
install script is arbitrary code execution from a package nobody read.

1. Every package in `dependencies` and `devDependencies` appears in the allowlist below, with its
   licence and the reason it earns its place. Transitive dependencies are not listed (pnpm's lockfile
   pins them), but a direct dependency is a decision.
2. **No GPL or AGPL** anywhere in the tree — this is commercial software. MIT, Apache-2.0, ISC, and
   BSD are fine.
3. Prefer the platform: no date library while `Intl` suffices, no state-management library while
   TanStack Query + React state suffice, no component megalibrary while shadcn-style primitives are
   generated into the repo and owned.
4. API DTO types are **generated** from the backend contract (AD-12) — no package that would replace
   or wrap that (client generators, schema-to-type bridges) without revisiting F1-DESIGN.md D2.

## Allowlist — runtime

| Package                                                              | Licence        | Why                                                               |
| -------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------- |
| next                                                                 | MIT            | The frozen architecture's framework (§4.2).                       |
| react, react-dom                                                     | MIT            | Required by Next.js.                                              |
| @tanstack/react-query                                                | MIT            | Server-state cache; on the spec's approved list.                  |
| react-hook-form, @hookform/resolvers                                 | MIT            | Forms; approved list.                                             |
| zod                                                                  | MIT            | Schema validation; approved list.                                 |
| next-themes                                                          | MIT            | Theme switching; approved list.                                   |
| @radix-ui/react-* (dialog, dropdown-menu, label, select, slot, tabs) | MIT            | Accessible unstyled primitives under the shadcn-style components. |
| class-variance-authority, clsx, tailwind-merge                       | MIT/Apache-2.0 | Class composition for the owned component set.                    |
| lucide-react                                                         | ISC            | Icons (shadcn's pairing).                                         |
| sonner                                                               | MIT            | Toasts.                                                           |

## Allowlist — development

| Package                                                                        | Licence    | Why                                                                  |
| ------------------------------------------------------------------------------ | ---------- | -------------------------------------------------------------------- |
| typescript (^5)                                                                | Apache-2.0 | Pinned to 5.x: the 7.x line is ahead of the toolchain's peer ranges. |
| tailwindcss, @tailwindcss/postcss, postcss                                     | MIT        | Styling; approved list.                                              |
| openapi-typescript                                                             | MIT        | Generates `src/types/api.d.ts` from the backend contract (AD-12/D2). |
| eslint (^9), eslint-config-next                                                | MIT        | Linting; 9.x for the same peer-range reason as TypeScript.           |
| prettier, prettier-plugin-tailwindcss                                          | MIT        | Formatting.                                                          |
| vitest, @vitejs/plugin-react, jsdom                                            | MIT        | Unit tests.                                                          |
| @testing-library/react, @testing-library/jest-dom, @testing-library/user-event | MIT        | Component tests.                                                     |
| @playwright/test                                                               | Apache-2.0 | E2E against the real backend.                                        |
| @types/node, @types/react, @types/react-dom                                    | MIT        | Type definitions.                                                    |

## Adding a package

Add the row here **and** the name to `ALLOWED` in `scripts/check-dependencies.mjs`, in one commit, with
the reason in the row. If the reason is hard to write, the package is hard to justify.
