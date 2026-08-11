import '@testing-library/jest-dom/vitest';

/**
 * Pin the locale that `Intl.NumberFormat(undefined, …)` resolves to, for this test process only.
 *
 * `formatMoney` (src/lib/utils/format.ts) passes `undefined` as the locale on purpose — production
 * must render money in the *reader's* browser locale, same as `formatDateTime` renders dates in the
 * reader's zone. tests/unit/format.test.ts and tests/unit/price-editor.test.tsx assert against literal
 * strings ("1,234.50", "€49.99"), which only hold for locales that use a comma thousands separator, a
 * period decimal, and a symbol placed directly before the digits. A CI runner whose OS locale resolves
 * to e.g. fr-FR would render "49,99 €" instead and fail those assertions for a reason unrelated to the
 * code under test.
 *
 * The obvious fix — set `LANG`/`LC_ALL`/`NODE_ICU_DATA` before the process starts — was tried and does
 * NOT work on Windows: Node's bundled full-ICU reads the default locale from the Win32 user-locale API
 * here, not from POSIX env vars, so those three were confirmed (empirically, not assumed) to have zero
 * effect on `Intl.NumberFormat().resolvedOptions().locale`. So the locale is pinned by intercepting the
 * constructor instead: only the `locales === undefined` case is redirected to a fixed locale; a caller
 * that explicitly names a locale still gets exactly that locale, unpinned. `formatMoney` always calls
 * with `undefined`, so this changes nothing about *which argument* it passes — only what that argument
 * resolves to inside this test process.
 */
// A `class ... extends Intl.NumberFormat` subclass was tried first and rejected: ES6 classes cannot be
// invoked without `new`, but ECMA-402 specifies `Intl.NumberFormat(...)` (no `new`) as legal, and it was
// only luck that nothing in this codebase calls it that way today. A `Proxy` preserves both calling
// forms, and `supportedLocalesOf` and other statics, by forwarding everything except the locale argument
// straight to the real constructor.
const OriginalNumberFormat = Intl.NumberFormat;

const substituteUndefinedLocale = (
  args: unknown[],
): [string | string[] | undefined, Intl.NumberFormatOptions | undefined] => {
  const [locales, options] = args as [
    string | string[] | undefined,
    Intl.NumberFormatOptions | undefined,
  ];
  return [locales ?? 'en-US', options];
};

Intl.NumberFormat = new Proxy(OriginalNumberFormat, {
  construct(target, args, newTarget) {
    return Reflect.construct(target, substituteUndefinedLocale(args), newTarget);
  },
  apply(target, _thisArg, args) {
    return Reflect.construct(target, substituteUndefinedLocale(args));
  },
}) as typeof Intl.NumberFormat;
