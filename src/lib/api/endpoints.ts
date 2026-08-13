import { api, query, setAccessToken, forgetEtags } from './client';
import type {
  AccessToken,
  ActivityEntry,
  AssignSubscriptionRequest,
  AuditLogDetail,
  CancelSubscriptionRequest,
  ChurnPoint,
  CreatePlanRequest,
  CurrentUser,
  DashboardHealth,
  DashboardSummary,
  FeatureListItem,
  GrowthPoint,
  GymDetail,
  InvoiceDetail,
  InvoiceListItem,
  InviteUserRequest,
  PagedAuditLogs,
  PagedGyms,
  PagedInvoices,
  PagedPlans,
  PagedUsers,
  PlanDetail,
  ProvisionGymRequest,
  ResolvedFeatureDetail,
  RevenuePoint,
  RoleDetail,
  SetGymFeaturesRequest,
  SetPlanFeaturesRequest,
  SetPlanPriceRequest,
  SubscriptionDetail,
  UpdateFeatureRequest,
  UpdateGymBrandingRequest,
  UpdateGymRequest,
  UpdatePlanRequest,
  UpdateUserRequest,
  UserDetail,
} from '@/types/api';

/**
 * One function per API operation, grouped by module — the shape §4.2 describes.
 *
 * Thin on purpose: these translate arguments into a path and nothing more. Every cross-cutting concern
 * (auth, refresh, `If-Match`, problem parsing) lives in `client.ts`, so a screen cannot opt out of one
 * by accident.
 */

export interface PageParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  search?: string;
}

export const auth = {
  signIn: (email: string, password: string) =>
    api.post<AccessToken>('/auth/login', { email, password }, { anonymous: true }),

  /** Ends the session server-side and clears the refresh cookie. 204, so nothing comes back. */
  signOut: async () => {
    try {
      await api.post<void>('/auth/logout');
    } finally {
      // Cleared even if the call failed: the operator asked to leave, and a token kept "just in case"
      // is a token still able to act.
      setAccessToken(null);
      forgetEtags();
    }
  },

  me: () => api.get<CurrentUser>('/auth/me'),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<void>('/auth/change-password', { currentPassword, newPassword }),

  /**
   * Is an activation link still usable? Anonymous — the person holding it cannot sign in, which is
   * the situation it exists to resolve.
   *
   * Answers validity and nothing else: no email, no name, no roles. Every failure (unknown,
   * expired, already used, account gone) is the same 404 with the same body, deliberately — a
   * distinct "expired" would confirm the token had once been real. So the console can only say
   * "this link is no longer usable", never why.
   */
  checkActivationLink: (token: string, signal?: AbortSignal) =>
    api.get<void>(`/auth/set-password${query({ token })}`, signal, { anonymous: true }),

  /** Consumes the link and sets the password. Anonymous, for the same reason. */
  setPassword: (token: string, newPassword: string) =>
    api.post<void>('/auth/set-password', { token, newPassword }, { anonymous: true }),
};

export const gyms = {
  list: (
    params: PageParams & { status?: string; country?: string; includeDeleted?: boolean } = {},
    signal?: AbortSignal,
  ) => api.get<PagedGyms>(`/gyms${query({ ...params })}`, signal),

  get: (gymId: string, signal?: AbortSignal) => api.get<GymDetail>(`/gyms/${gymId}`, signal),

  provision: (body: ProvisionGymRequest) => api.post<GymDetail>('/gyms', body),

  // `precondition: true` sends the ETag remembered from the matching GET. The API requires it on PUT
  // and answers 428 without one, which is what makes the omission impossible to ship unnoticed.
  update: (gymId: string, body: UpdateGymRequest) =>
    api.put<GymDetail>(`/gyms/${gymId}`, body, { precondition: true }),

  updateBranding: (gymId: string, body: UpdateGymBrandingRequest, rowVersion: string) =>
    api.put<GymDetail>(`/gyms/${gymId}/branding`, body, { precondition: rowVersion }),

  activate: (gymId: string) => api.post<GymDetail>(`/gyms/${gymId}/activate`),

  suspend: (gymId: string, reason: string) =>
    api.post<GymDetail>(`/gyms/${gymId}/suspend`, { reason }),

  reactivate: (gymId: string) => api.post<GymDetail>(`/gyms/${gymId}/reactivate`),

  /**
   * Soft-deletes the gym. `confirmation` must be the gym's slug, typed by the operator — the API
   * refuses without it (AD-6), and prefilling it would confirm nothing.
   */
  remove: (gymId: string, confirmation: string) =>
    api.delete<void>(`/gyms/${gymId}`, { confirmation }),

  /** The whole catalogue resolved for this gym, with the layer that decided each answer. */
  features: (gymId: string, signal?: AbortSignal) =>
    api.get<ResolvedFeatureDetail[]>(`/gyms/${gymId}/features`, signal),

  /**
   * No `precondition`, deliberately: each override is its own aggregate keyed on (gym, feature) and
   * the request merges per key, so two operators editing different features do not conflict at all
   * (Features.md, "Where If-Match is required, and where it is not").
   */
  setFeatures: (gymId: string, body: SetGymFeaturesRequest) =>
    api.put<ResolvedFeatureDetail[]>(`/gyms/${gymId}/features`, body),
};

export const users = {
  list: (params: PageParams & { status?: string } = {}, signal?: AbortSignal) =>
    api.get<PagedUsers>(`/users${query({ ...params })}`, signal),

  get: (userId: string, signal?: AbortSignal) => api.get<UserDetail>(`/users/${userId}`, signal),

  invite: (body: InviteUserRequest) => api.post<UserDetail>('/users', body),

  update: (userId: string, body: UpdateUserRequest) =>
    api.put<UserDetail>(`/users/${userId}`, body, { precondition: true }),

  setRoles: (userId: string, roleIds: string[], rowVersion: string) =>
    api.put<UserDetail>(`/users/${userId}/roles`, { roleIds }, { precondition: rowVersion }),

  suspend: (userId: string, reason: string) =>
    api.post<UserDetail>(`/users/${userId}/suspend`, { reason }),

  reactivate: (userId: string) => api.post<UserDetail>(`/users/${userId}/reactivate`),

  /**
   * Sends the activation link again — the recovery path when an invitation never arrived.
   *
   * Only for an administrator who has never activated; the API refuses an established one with
   * `users.not_pending_activation`, because that case wants a password reset and the two messages
   * read very differently.
   */
  resendInvitation: (userId: string) => api.post<void>(`/users/${userId}/resend-invitation`),

  /**
   * Emails the account's owner a one-time link. **It does not set a password** — an administrator
   * who could set another administrator's password would hold a credential that is no longer one
   * (ARCHITECTURE.md §3.6).
   */
  sendPasswordReset: (userId: string) => api.post<void>(`/users/${userId}/reset-password`),
};

export const roles = {
  list: (signal?: AbortSignal) => api.get<RoleDetail[]>('/roles', signal),
};

export const auditLogs = {
  list: (
    params: PageParams & {
      action?: string;
      entityType?: string;
      entityId?: string;
      userId?: string;
      from?: string;
      to?: string;
    } = {},
    signal?: AbortSignal,
  ) => api.get<PagedAuditLogs>(`/audit-logs${query({ ...params })}`, signal),

  get: (auditLogId: string, signal?: AbortSignal) =>
    api.get<AuditLogDetail>(`/audit-logs/${auditLogId}`, signal),
};

export const plans = {
  list: (
    params: PageParams & { includeInactive?: boolean; isPublic?: boolean } = {},
    signal?: AbortSignal,
  ) => api.get<PagedPlans>(`/plans${query({ ...params })}`, signal),

  get: (planId: string, signal?: AbortSignal) => api.get<PlanDetail>(`/plans/${planId}`, signal),

  create: (body: CreatePlanRequest) => api.post<PlanDetail>('/plans', body),

  update: (planId: string, body: UpdatePlanRequest) =>
    api.put<PlanDetail>(`/plans/${planId}`, body, { precondition: true }),

  activate: (planId: string, rowVersion: string) =>
    api.post<PlanDetail>(`/plans/${planId}/activate`, undefined, { precondition: rowVersion }),

  deactivate: (planId: string, rowVersion: string) =>
    api.post<PlanDetail>(`/plans/${planId}/deactivate`, undefined, { precondition: rowVersion }),

  /** Upsert by (cycle, currency): "the annual euro price is X" is one intent, not read-then-write. */
  setPrice: (planId: string, body: SetPlanPriceRequest, rowVersion: string) =>
    api.put<PlanDetail>(`/plans/${planId}/prices`, body, { precondition: rowVersion }),

  removePrice: (planId: string, planPriceId: string, rowVersion: string) =>
    api.delete<PlanDetail>(`/plans/${planId}/prices/${planPriceId}`, { precondition: rowVersion }),

  /** Returns the plan: features are part of it. */
  features: (planId: string, signal?: AbortSignal) =>
    api.get<PlanDetail>(`/plans/${planId}/features`, signal),

  setFeatures: (planId: string, body: SetPlanFeaturesRequest, rowVersion: string) =>
    api.put<PlanDetail>(`/plans/${planId}/features`, body, { precondition: rowVersion }),
};

export const features = {
  /** Not paged: the catalogue is seeded and there are twelve keys. */
  list: (signal?: AbortSignal) => api.get<FeatureListItem[]>('/features', signal),

  /**
   * Copy, default and premium. The key is absent because it is immutable — a field the server
   * ignores is worse than no field (FeatureContracts.cs).
   */
  update: (featureId: string, body: UpdateFeatureRequest, rowVersion: string) =>
    api.put<FeatureListItem>(`/features/${featureId}`, body, { precondition: rowVersion }),
};

export const subscriptions = {
  get: (gymId: string, signal?: AbortSignal) =>
    api.get<SubscriptionDetail>(`/gyms/${gymId}/subscription`, signal),

  /** No precondition: this endpoint neither takes nor needs `If-Match` (D5). */
  assign: (gymId: string, body: AssignSubscriptionRequest) =>
    api.put<SubscriptionDetail>(`/gyms/${gymId}/subscription`, body),

  cancel: (gymId: string, body: CancelSubscriptionRequest) =>
    api.post<SubscriptionDetail>(`/gyms/${gymId}/subscription/cancel`, body),

  /** Withdraws a scheduled cancellation; the subscription was never not-Active. */
  resume: (gymId: string) => api.post<SubscriptionDetail>(`/gyms/${gymId}/subscription/resume`),

  convertTrial: (gymId: string) =>
    api.post<SubscriptionDetail>(`/gyms/${gymId}/subscription/convert-trial`),

  setPaymentState: (gymId: string, pastDue: boolean) =>
    api.post<SubscriptionDetail>(`/gyms/${gymId}/subscription/payment-state`, { pastDue }),

  history: (gymId: string, signal?: AbortSignal) =>
    api.get<SubscriptionDetail[]>(`/gyms/${gymId}/subscription/history`, signal),
};

export const invoices = {
  list: (
    params: PageParams & { status?: string; gymId?: string; overdue?: boolean } = {},
    signal?: AbortSignal,
  ) => api.get<PagedInvoices>(`/invoices${query({ ...params })}`, signal),

  get: (invoiceId: string, signal?: AbortSignal) =>
    api.get<InvoiceDetail>(`/invoices/${invoiceId}`, signal),

  /** Returns every invoice for the gym; an unknown gym is an empty list, not a 404. */
  listForGym: (gymId: string, signal?: AbortSignal) =>
    api.get<InvoiceListItem[]>(`/gyms/${gymId}/invoices`, signal),

  /**
   * Three headers: the idempotency key (minted at intent, D1), the precondition, and the bearer
   * token. `paymentReference` is optional but offered, because "which payment settled this?" is the
   * first question a billing dispute asks.
   */
  markPaid: (
    invoiceId: string,
    paymentReference: string | null,
    rowVersion: string,
    idempotencyKey: string,
  ) =>
    api.post<InvoiceDetail>(
      `/invoices/${invoiceId}/mark-paid`,
      { paymentReference },
      { precondition: rowVersion, idempotencyKey },
    ),

  /** `confirmation` is the invoice number, typed by the operator — prefilling it confirms nothing. */
  void: (invoiceId: string, confirmation: string, rowVersion: string) =>
    api.post<InvoiceDetail>(`/invoices/${invoiceId}/void`, undefined, {
      confirmation,
      precondition: rowVersion,
    }),
};

/**
 * What is true **right now** — computed live from `gyms` and `gym_subscriptions` on every request
 * (Analytics.md §1). This is why the dashboard moves the moment a gym is assigned while no
 * `/analytics` series does until the next night's job runs, and why F3 D7 labels the two differently
 * on screen.
 *
 * `activity` is gated on `audit.read` while the other two need `analytics.read` — a deliberate split
 * (SupportAgent holds the first and not the second), which is why the dashboard resolves permissions
 * per panel rather than per page (D6).
 */
export const dashboard = {
  summary: (signal?: AbortSignal) => api.get<DashboardSummary>('/dashboard/summary', signal),

  health: (signal?: AbortSignal) => api.get<DashboardHealth>('/dashboard/health', signal),

  /** `limit` is clamped 1–100 server-side; the default is 20. */
  activity: (limit?: number, signal?: AbortSignal) =>
    api.get<ActivityEntry[]>(`/dashboard/activity${query({ limit })}`, signal),
};

/**
 * What was true **on a given day** — read only from the nightly `daily_platform_stats` read model.
 *
 * **These endpoints return only the days that exist.** A night the stats job did not run is absent
 * from the response, never zero-filled, because zeros would draw a chart to the floor and read as
 * "every gym vanished that night" (Analytics.md §2, pinned by
 * `AGapInTheSeriesIsReturnedAsAGapAndNeverAsZeros`). Callers must not rebuild a continuous axis from
 * `from`/`to` and default the missing days — see `@/lib/analytics/series` (D3).
 *
 * `from` and `to` are both required, and the inclusive span may not exceed 366 days; either mistake
 * is `analytics.range_invalid` (400).
 */
export const analytics = {
  revenue: (from: string, to: string, signal?: AbortSignal) =>
    api.get<RevenuePoint[]>(`/analytics/revenue${query({ from, to })}`, signal),

  gymsGrowth: (from: string, to: string, signal?: AbortSignal) =>
    api.get<GrowthPoint[]>(`/analytics/gyms-growth${query({ from, to })}`, signal),

  churn: (from: string, to: string, signal?: AbortSignal) =>
    api.get<ChurnPoint[]>(`/analytics/churn${query({ from, to })}`, signal),
};
