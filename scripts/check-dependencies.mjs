// The enforcer half of docs/DEPENDENCY_POLICY.md — the frontend's ForbiddenPackagesTests.
// A direct dependency absent from the allowlist fails CI; the fix is a policy row and an entry
// here, in the same commit, with a reason.
import { readFileSync } from 'node:fs';

const ALLOWED = new Set([
  // runtime
  'next',
  'react',
  'react-dom',
  '@tanstack/react-query',
  'react-hook-form',
  '@hookform/resolvers',
  'zod',
  'next-themes',
  '@radix-ui/react-dialog',
  '@radix-ui/react-dropdown-menu',
  '@radix-ui/react-label',
  '@radix-ui/react-select',
  '@radix-ui/react-slot',
  '@radix-ui/react-tabs',
  'class-variance-authority',
  'clsx',
  'tailwind-merge',
  'lucide-react',
  'sonner',

  // development
  'typescript',
  'tailwindcss',
  '@tailwindcss/postcss',
  'postcss',
  'openapi-typescript',
  'eslint',
  'eslint-config-next',
  'prettier',
  'prettier-plugin-tailwindcss',
  'vitest',
  '@vitejs/plugin-react',
  'jsdom',
  '@testing-library/react',
  '@testing-library/jest-dom',
  '@testing-library/user-event',
  '@playwright/test',
  '@types/node',
  '@types/react',
  '@types/react-dom',
]);

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const declared = [
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.devDependencies ?? {}),
];

const violations = declared.filter((name) => !ALLOWED.has(name));
const stale = [...ALLOWED].filter((name) => !declared.includes(name));

if (violations.length > 0) {
  console.error(
    'Packages not in the dependency policy (add a row to docs/DEPENDENCY_POLICY.md and an entry to ' +
      'this allowlist, in the same commit, with a reason):\n  ' +
      violations.join('\n  '),
  );
  process.exit(1);
}

if (stale.length > 0) {
  // A stale entry silently excuses whatever package later takes that name.
  console.error('Allowlist entries for packages no longer used:\n  ' + stale.join('\n  '));
  process.exit(1);
}

console.log(`dependency policy: ${declared.length} packages, all allowed.`);
