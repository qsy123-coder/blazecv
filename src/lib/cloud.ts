import type { ResumeDoc } from "./types";

export interface CloudUser {
  id: string;
  email: string | null;
  phone: string | null;
  hasPassword: boolean;
}

export interface CloudResume {
  doc: ResumeDoc;
  title?: string;
  updatedAt: string;
}

export interface ShareInfo {
  token: string;
  updatedAt: string;
  hasPassword: boolean;
  expiresAt: string | null;
}

export interface ShareOptions {
  password?: string | null;
  expiresInDays?: number | null;
}

export interface CloudResumeSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface CloudSession {
  id: string;
  current: boolean;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error || "请求失败，请稍后再试");
  }
  return data as T;
}

export const cloudApi = {
  me: () => request<{ user: CloudUser | null }>("/api/auth/me"),
  register: (account: string, password: string) =>
    request<{ user: CloudUser }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ account, password }),
    }),
  login: (account: string, password: string) =>
    request<{ user: CloudUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ account, password }),
    }),
  /** 手机号验证码登录；首次登录自动创建账号。 */
  loginWithCode: (account: string, code: string) =>
    request<{ user: CloudUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ account, code }),
    }),
  /** 发送验证码：手机号走短信（login / reset），邮箱走重置邮件（reset）。 */
  sendCode: (account: string, purpose: "login" | "reset" = "login") =>
    request<{ ok: boolean; expiresIn: number; resendIn: number }>(
      "/api/auth/code",
      {
        method: "POST",
        body: JSON.stringify({ account, purpose }),
      },
    ),
  /** 验证码重置密码（未登录）。 */
  resetPassword: (account: string, code: string, password: string) =>
    request<{ ok: boolean }>("/api/auth/reset", {
      method: "POST",
      body: JSON.stringify({ account, code, password }),
    }),
  /** 登录后修改密码。 */
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  /** 当前账号的登录会话（设备）列表。 */
  listSessions: () =>
    request<{ sessions: CloudSession[] }>("/api/auth/sessions"),
  /** 退出指定会话。 */
  revokeSession: (id: string) =>
    request<{ ok: boolean; current?: boolean }>(
      `/api/auth/sessions/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
  /** 退出除当前设备外的所有会话。 */
  revokeOtherSessions: () =>
    request<{ ok: boolean; revoked: number }>(
      "/api/auth/sessions/revoke-others",
      { method: "POST" },
    ),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  pull: () => request<{ resume: CloudResume | null }>("/api/resume"),
  push: (doc: ResumeDoc) =>
    request<{ ok: boolean; id: string; updatedAt: string }>(
      `/api/resumes/${encodeURIComponent(doc.id)}`,
      {
        method: "PUT",
        body: JSON.stringify({ doc }),
      },
    ),
  listResumes: () =>
    request<{ resumes: CloudResumeSummary[] }>("/api/resumes"),
  getResume: (id: string) =>
    request<{
      resume: { id: string; doc: ResumeDoc; title: string; updatedAt: string };
    }>(`/api/resumes/${encodeURIComponent(id)}`),
  deleteResume: (id: string) =>
    request<{ ok: boolean }>(`/api/resumes/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  getShare: () => request<{ share: ShareInfo | null }>("/api/share"),
  createShare: (doc: ResumeDoc, options: ShareOptions = {}) =>
    request<ShareInfo>("/api/share", {
      method: "POST",
      body: JSON.stringify({ doc, ...options }),
    }),
  deleteShare: () => request<{ ok: boolean }>("/api/share", { method: "DELETE" }),
};
