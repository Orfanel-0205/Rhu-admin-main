// src/services/registrationInvites.ts
//
// Sir Ayco — signed, unique, one-time staff registration invite links.
// validateInvite() is PUBLIC (the /register page replays its query string);
// generate/list/revoke are Super-Admin-only.

import apiClient from "../lib/apiClient";

export interface InviteQueryParams {
  token: string;
  expires: string;
  signature: string;
}

export interface InviteValidationResult {
  valid: boolean;
  /**
   * Distinct failure modes, per panelist requirement:
   * missing_invite | invalid_signature | expired | not_found | revoked |
   * already_used | valid | legacy_open
   */
  code: string;
  message: string;
  data?: {
    intended_for?: string | null;
    mobile_number?: string | null;
    expires_at?: string | null;
  } | null;
}

export interface GeneratedInvite {
  id: number;
  /** Full shareable signed link — shown exactly once. */
  url: string;
  signed_api_url: string;
  token: string;
  token_hash: string;
  intended_for: string | null;
  mobile_number: string | null;
  expires_at: string | null;
  status: string;
}

export interface InviteListRow {
  id: number;
  intended_for: string | null;
  mobile_number: string | null;
  token_hash_preview: string;
  status: "active" | "used" | "expired" | "revoked";
  expires_at: string | null;
  used_at: string | null;
  used_by: string | null;
  created_by: string | null;
  created_at: string | null;
}

export const registrationInviteService = {
  /** Public — the /register page verifies its link before showing the form. */
  async validateInvite(params: InviteQueryParams): Promise<InviteValidationResult> {
    try {
      const response = await apiClient.get("/admin/register/validate-invite", {
        params,
        suppressErrorToast: true,
      } as any);

      return response.data as InviteValidationResult;
    } catch (err: any) {
      const data = err?.response?.data;
      if (data && typeof data.valid === "boolean") {
        return data as InviteValidationResult;
      }

      return {
        valid: false,
        code: "network_error",
        message:
          "We could not verify your registration link right now. Please check your connection and try again.",
      };
    }
  },

  /** Super Admin — generate a new signed link (returned exactly once). */
  async generate(payload: {
    intended_for?: string;
    mobile_number?: string;
    expires_in_minutes?: number;
  }): Promise<{ message: string; data: GeneratedInvite }> {
    const response = await apiClient.post("/admin/registration-invites", payload);
    return response.data;
  },

  /** Super Admin — recent invites with status (never the raw token). */
  async list(): Promise<InviteListRow[]> {
    const response = await apiClient.get("/admin/registration-invites", {
      suppressErrorToast: true,
    } as any);
    return (response.data?.data ?? []) as InviteListRow[];
  },

  /** Super Admin — soft-invalidate an unused link. */
  async revoke(id: number): Promise<void> {
    await apiClient.patch(`/admin/registration-invites/${id}/revoke`);
  },
};

export default registrationInviteService;
