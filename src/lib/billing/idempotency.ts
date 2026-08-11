/**
 * One idempotency key per operator intent (F2-DESIGN.md D1).
 *
 * Call this where the operator confirms — in the dialog's submit handler — and hold the result for
 * that mutation. Calling it inside a `mutationFn` would mint a new key on every React Query retry,
 * which is the failure this exists to prevent.
 *
 * A UUID, per the backend's API_STANDARDS §10: keys are scoped `(tenant, operation, key)`, so two
 * callers choosing the same non-random key for the same operation collide.
 */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
