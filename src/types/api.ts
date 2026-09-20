import type { components } from './api.d';

/**
 * Named aliases over the generated schemas (AD-12: one source of truth).
 *
 * Everything here is a re-export, never a redefinition. A hand-written interface that mirrors a DTO is
 * the drift the generated types exist to prevent — it compiles happily while the API changes underneath
 * it. If a shape you need is missing, regenerate with `pnpm gen:api`; do not add it by hand.
 */
type Schemas = components['schemas'];

export type CurrentUser = Schemas['CurrentUserResponse'];
export type AccessToken = Schemas['AccessTokenResponse'];
export type SignInRequest = Schemas['SignInRequest'];
export type ChangePasswordRequest = Schemas['ChangePasswordRequest'];
export type ProblemDetails = Schemas['ProblemDetails'];

export type GymListItem = Schemas['GymListItem'];
export type GymDetail = Schemas['GymDetail'];
export type GymBrandingDetail = Schemas['GymBrandingDetail'];
export type ProvisionGymRequest = Schemas['ProvisionGymRequest'];
export type UpdateGymRequest = Schemas['UpdateGymRequest'];
export type UpdateGymBrandingRequest = Schemas['UpdateGymBrandingRequest'];
export type SuspendGymRequest = Schemas['SuspendGymRequest'];
export type PagedGyms = Schemas['PagedResultOfGymListItem'];

export type UserListItem = Schemas['UserListItem'];
export type UserDetail = Schemas['UserDetail'];
export type InviteUserRequest = Schemas['InviteUserRequest'];
export type UpdateUserRequest = Schemas['UpdateUserRequest'];
export type SetUserRolesRequest = Schemas['SetUserRolesRequest'];
export type SuspendUserRequest = Schemas['SuspendUserRequest'];
export type RoleSummary = Schemas['RoleSummary'];
export type RoleDetail = Schemas['RoleDetail'];
export type PagedUsers = Schemas['PagedResultOfUserListItem'];

export type AuditLogListItem = Schemas['AuditLogListItem'];
export type AuditLogDetail = Schemas['AuditLogDetail'];
export type PagedAuditLogs = Schemas['PagedResultOfAuditLogListItem'];

/**
 * Gym lifecycle states, by name as the API reports them.
 *
 * The API sends `status` as a plain string, so this is the console's reading of that contract rather
 * than something generated. Numeric values are stable per ARCHITECTURE.md §2.2, but the wire format is
 * the name.
 */
export const GYM_STATUSES = ['Provisioning', 'Active', 'Suspended', 'Deleted'] as const;
export type GymStatus = (typeof GYM_STATUSES)[number];

export const USER_STATUSES = ['PendingActivation', 'Active', 'Suspended'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export type PlanListItem = Schemas['PlanListItem'];
export type PlanDetail = Schemas['PlanDetail'];
export type PlanPriceDetail = Schemas['PlanPriceDetail'];
export type CreatePlanRequest = Schemas['CreatePlanRequest'];
export type UpdatePlanRequest = Schemas['UpdatePlanRequest'];
export type SetPlanPriceRequest = Schemas['SetPlanPriceRequest'];
export type PagedPlans = Schemas['PagedResultOfPlanListItem'];

export type FeatureListItem = Schemas['FeatureListItem'];
export type ResolvedFeatureDetail = Schemas['ResolvedFeatureDetail'];
export type UpdateFeatureRequest = Schemas['UpdateFeatureRequest'];
export type SetPlanFeaturesRequest = Schemas['SetPlanFeaturesRequest'];
export type SetGymFeaturesRequest = Schemas['SetGymFeaturesRequest'];
export type PlanFeatureRequest = Schemas['PlanFeatureRequest'];
export type GymFeatureRequest = Schemas['GymFeatureRequest'];

export type SubscriptionDetail = Schemas['SubscriptionDetail'];
export type GymSubscriptionSummary = Schemas['GymSubscriptionSummary'];
export type PendingPlanChangeDetail = Schemas['PendingPlanChangeDetail'];
export type AssignSubscriptionRequest = Schemas['AssignSubscriptionRequest'];
export type CancelSubscriptionRequest = Schemas['CancelSubscriptionRequest'];

export type InvoiceListItem = Schemas['InvoiceListItem'];
export type InvoiceDetail = Schemas['InvoiceDetail'];
export type InvoiceLineDetail = Schemas['InvoiceLineDetail'];
export type MarkInvoicePaidRequest = Schemas['MarkInvoicePaidRequest'];
export type PagedInvoices = Schemas['PagedResultOfInvoiceListItem'];

/**
 * An amount with its currency. Money never travels as a bare decimal (backend rule R4), and on this
 * side that is what stops a screen adding two currencies together — see `MRR` below.
 */
export type MoneyDto = Schemas['MoneyDto'];

export type DashboardSummary = Schemas['DashboardSummary'];
export type DashboardHealth = Schemas['DashboardHealth'];
export type HealthCheckStatus = Schemas['HealthCheckStatus'];
export type ActivityEntry = Schemas['ActivityEntry'];

export type RevenuePoint = Schemas['RevenuePoint'];
export type GrowthPoint = Schemas['GrowthPoint'];
export type ChurnPoint = Schemas['ChurnPoint'];

export type MonitoringOverview = Schemas['MonitoringOverview'];
export type JobStateDto = Schemas['JobStateDto'];
export type JobRunDto = Schemas['JobRunDto'];
export type JobRunsPage = Schemas['JobRunsPage'];
export type OutboxDepth = Schemas['OutboxDepth'];
export type ProcessMetrics = Schemas['ProcessMetrics'];

/**
 * A run's status by name, as the API reports it and as `/monitoring/jobs/{name}/runs?status=`
 * accepts it (parsed case-insensitively server-side — Monitoring.md §7).
 */
export const JOB_RUN_STATUSES = ['Running', 'Succeeded', 'Failed'] as const;
export type JobRunStatus = (typeof JOB_RUN_STATUSES)[number];

export type SettingView = Schemas['SettingView'];
export type SettingValueWrite = Schemas['SettingValueWrite'];
export type UpdateSettingsRequest = Schemas['UpdateSettingsRequest'];
export type SetMaintenanceModeRequest = Schemas['SetMaintenanceModeRequest'];
export type SmtpConnectionTestResult = Schemas['SmtpConnectionTestResult'];

/**
 * The five categories `PlatformSettingDefinitions.All` declares (Settings.md §1). Maintenance is
 * listed because `GET /settings?category=Maintenance` is how the banner reads it — but it is never
 * a tab and never sent to `PUT /settings`, which refuses it (D7).
 */
export const SETTING_CATEGORIES = [
  'General',
  'Email',
  'Security',
  'Maintenance',
  'Retention',
] as const;
export type SettingCategory = (typeof SETTING_CATEGORIES)[number];

/**
 * What a sensitive value reads as once a row exists, and what a PUT would send to mean
 * "unchanged" — which this console never does: an unchanged row is simply not sent (D6).
 * `PlatformSettingDefinitions.Mask`, byte for byte.
 */
export const SETTING_MASK = '••••';

/**
 * Subscription lifecycle, by name as the API reports it. `Canceled` and `Expired` are deliberately
 * distinct: cancellation is a decision and expiry is a failure to collect, and M5's churn figure
 * depends on never collapsing them.
 */
export const SUBSCRIPTION_STATUSES = [
  'Trialing',
  'Active',
  'PastDue',
  'Canceled',
  'Expired',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** `Draft` is declared by the API but has no producer yet; it is listed for completeness only. */
export const INVOICE_STATUSES = ['Draft', 'Issued', 'Paid', 'Overdue', 'Void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
