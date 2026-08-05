import { api, query, setAccessToken, forgetEtags } from './client';
import type {
  AccessToken,
  AuditLogDetail,
  CurrentUser,
  GymDetail,
  InviteUserRequest,
  PagedAuditLogs,
  PagedGyms,
  PagedUsers,
  ProvisionGymRequest,
  RoleDetail,
  UpdateGymBrandingRequest,
  UpdateGymRequest,
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
