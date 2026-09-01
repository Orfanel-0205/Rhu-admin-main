// src/services/auth.ts

import apiClient from "../lib/apiClient";
import type { AdminUser } from "../types/cms";

export interface LoginPayload {
  mobile_number: string;
  password: string;
}

export interface LoginResponse {
  message?: string;
  user: AdminUser;
  token: string;
}

export interface StaffRegisterPayload {
  first_name: string;
  middle_name?: string;
  last_name: string;
  email?: string;
  mobile_number: string;
  barangay?: string;
  birthday?: string;
  // No role field on purpose: registrants never pick a role. The final role is
  // assigned by the MHO / Super Admin at approval time, and the backend ignores
  // any role value sent here.
  password: string;
  password_confirmation: string;
  // RHU staff/admin must accept Terms and upload an Employee Identification Card.
  terms_accepted: boolean;
  employee_id: File;
  // Sir Ayco — the signed one-time invite params carried by the /register URL.
  // The backend re-verifies signature → expiry → one-time-use before anything
  // else runs; these are required once registration_invites is live.
  invite_token?: string;
  invite_expires?: string;
  invite_signature?: string;
}

// Fields the Employee-ID OCR autofill returns for the form to pre-fill (editable).
export interface EmployeeIdFields {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  position?: string | null;
  office?: string | null;
  address?: string | null;
  birthday?: string | null;
}

export interface ExtractEmployeeIdResult {
  ok: boolean;
  message?: string;
  fields: EmployeeIdFields;
}

export interface ProfilePayload {
  first_name: string;
  last_name: string;
  email?: string | null;
  mobile_number: string;
  barangay?: string | null;
}

export interface ChangePasswordPayload {
  current_password: string;
  password: string;
  password_confirmation: string;
}

function normalizeUser(raw: any): AdminUser {
  const user = raw?.data ?? raw?.user ?? raw;

  return {
    id: Number(user.id ?? user.user_id ?? 0),
    user_id: Number(user.user_id ?? user.id ?? 0),
    name:
      user.name ||
      [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
      "RHU Staff",
    first_name: user.first_name ?? "",
    last_name: user.last_name ?? "",
    email: user.email ?? "",
    mobile_number: user.mobile_number ?? user.phone ?? "",
    phone: user.phone ?? user.mobile_number ?? "",
    role: user.role ?? "staff",
    status: user.status ?? user.account_status ?? "active",
    account_status: user.account_status ?? user.status ?? "active",
    capabilities: Array.isArray(user.capabilities) ? user.capabilities : [],
    barangay: user.barangay ?? null,
    id_verified: Boolean(user.id_verified),
    ...user,
  } as AdminUser;
}

export const authService = {
  async login(payload: LoginPayload): Promise<LoginResponse> {
    const response = await apiClient.post("/admin/login", payload);

    return {
      message: response.data?.message,
      user: normalizeUser(response.data?.user),
      token: response.data?.token,
    };
  },

  async registerStaff(payload: StaffRegisterPayload) {
    // Multipart because the Employee Identification Card file is uploaded with
    // the registration request and linked to the new pending staff account.
    const form = new FormData();
    form.append("first_name", payload.first_name);
    if (payload.middle_name && payload.middle_name.trim()) {
      form.append("middle_name", payload.middle_name.trim());
    }
    form.append("last_name", payload.last_name);
    if (payload.email) form.append("email", payload.email);
    form.append("mobile_number", payload.mobile_number);
    if (payload.barangay) form.append("barangay", payload.barangay);
    if (payload.birthday) form.append("birthday", payload.birthday);
    form.append("password", payload.password);
    form.append("password_confirmation", payload.password_confirmation);
    form.append("terms_accepted", payload.terms_accepted ? "1" : "0");
    form.append("employee_id", payload.employee_id);

    if (payload.invite_token) form.append("invite_token", payload.invite_token);
    if (payload.invite_expires) form.append("invite_expires", payload.invite_expires);
    if (payload.invite_signature) {
      form.append("invite_signature", payload.invite_signature);
    }

    const response = await apiClient.post("/admin/register", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  // Stateless OCR autofill — sends the Employee ID photo, gets extracted fields
  // back for the form to pre-fill. Persists nothing server-side. Errors are
  // handled inline in the form, so the global error toast is suppressed here.
  async extractEmployeeId(file: File): Promise<ExtractEmployeeIdResult> {
    const form = new FormData();
    form.append("employee_id", file);

    const response = await apiClient.post(
      "/admin/register/extract-employee-id",
      form,
      {
        headers: { "Content-Type": "multipart/form-data" },
        suppressErrorToast: true,
      } as any
    );

    return {
      ok: Boolean(response.data?.data?.ok),
      message: response.data?.message,
      fields: (response.data?.data?.fields ?? {}) as EmployeeIdFields,
    };
  },

  // Canonical Malasiqui barangay list for the registration dropdown.
  async getBarangays(): Promise<string[]> {
    const response = await apiClient.get("/barangays", {
      suppressErrorToast: true,
    } as any);

    const raw = response.data?.data ?? response.data ?? [];

    return (Array.isArray(raw) ? raw : [])
      .map((b: any) =>
        typeof b === "string" ? b : String(b?.name ?? b?.barangay_name ?? "")
      )
      .filter(Boolean)
      .sort((a: string, b: string) => a.localeCompare(b));
  },

  async getMyProfile(): Promise<AdminUser> {
    const response = await apiClient.get("/admin/me");
    return normalizeUser(response.data);
  },

  async updateMyProfile(payload: ProfilePayload): Promise<AdminUser> {
    const response = await apiClient.patch("/admin/profile", payload);
    return normalizeUser(response.data);
  },

  async changePassword(payload: ChangePasswordPayload): Promise<void> {
    await apiClient.patch("/admin/profile/password", payload);
  },

  // Upload/replace the signed-in staff member's profile picture. Reuses the
  // shared POST /profile/avatar endpoint (stores on the public disk); the
  // returned URL is what Team Chat shows as this person's avatar.
  async uploadAvatar(file: File): Promise<{ avatar_url: string | null }> {
    const form = new FormData();
    form.append("avatar", file);

    const response = await apiClient.post("/profile/avatar", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    return {
      avatar_url:
        response.data?.avatar_url ?? response.data?.data?.avatar_url ?? null,
    };
  },

  /**
   * Marks the one-time "Getting Started" tour as shown for the signed-in user
   * so it never auto-opens again. Best-effort: if it fails the tour may open
   * once more on the next login, which is far better than blocking the UI.
   */
  async markOnboardingSeen(): Promise<void> {
    try {
      await apiClient.post("/admin/profile/onboarding-seen");
    } catch {
      // Non-fatal by design.
    }
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post("/admin/logout");
    } catch {
      // Local logout is handled by the auth store even if the backend endpoint is missing.
    }
  },
};

export default authService;