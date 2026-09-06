// src/services/settings.ts
//
// Real server-backed settings, replacing the localStorage blob the Settings
// page used to read and write ("ka_agapay_admin_settings_v2").
//
// There is deliberately no local caching layer here. The old page's whole
// problem was that the browser was the source of truth; every read below goes
// to the server, and every write returns the server's version of the section
// so the UI renders what was actually stored rather than what was typed.

import apiClient from "../lib/apiClient";

export interface FacilitySettings {
  facility_name: string | null;
  address: string | null;
  contact_number: string | null;
  email: string | null;
  operating_hours: string | null;
}

export interface NotificationSettings {
  sms_provider: string | null;
  appointment_reminder_hours: number;
  queue_alert_ahead: number;
}

export interface SecuritySettings {
  max_login_attempts: number;
  session_timeout_minutes: number | null;
}

/**
 * Server-reported facts the browser must not invent.
 *
 * `sms_api_key_configured` in particular replaces a hardcoded `true` that made
 * an unconfigured install display "Configured". The key itself is never sent.
 *
 * The `*_enforced` flags let the UI say plainly which saved values actually
 * change behaviour, instead of leaving a reader to assume they all do.
 */
export interface SettingsMeta {
  sms_api_key_configured: boolean;
  sms_sender_name: string;
  sms_provider_actual: string;
  session_lifetime_minutes_actual: number;
  session_timeout_enforced: boolean;
  max_login_attempts_enforced: boolean;
  sms_settings_enforced: boolean;
}

export interface AdminSettings {
  rhu_id: number;
  rhu_label: string | null;
  facility: FacilitySettings;
  notifications: NotificationSettings;
  security: SecuritySettings;
  meta: SettingsMeta;
}

export const settingsService = {
  async get(): Promise<AdminSettings> {
    const response = await apiClient.get("/admin/settings");
    return response.data as AdminSettings;
  },

  async saveFacility(values: FacilitySettings): Promise<AdminSettings> {
    const response = await apiClient.put("/admin/settings/facility", values);
    return response.data as AdminSettings;
  },

  async saveNotifications(values: NotificationSettings): Promise<AdminSettings> {
    const response = await apiClient.put("/admin/settings/notifications", values);
    return response.data as AdminSettings;
  },

  async saveSecurity(values: SecuritySettings): Promise<AdminSettings> {
    const response = await apiClient.put("/admin/settings/security", values);
    return response.data as AdminSettings;
  },
};

/**
 * Turn a Laravel error into something a person can act on.
 *
 * 422 carries per-field messages; showing them beats a generic "save failed",
 * which is the kind of message that sends staff to the developer instead of to
 * the field they mistyped.
 */
export function settingsErrorMessages(error: unknown): string[] {
  const response = (error as { response?: { status?: number; data?: unknown } })?.response;
  const data = response?.data as
    | { message?: string; errors?: Record<string, string[]> }
    | undefined;

  if (data?.errors) {
    const messages = Object.values(data.errors).flat();
    if (messages.length > 0) return messages;
  }

  if (response?.status === 403) {
    return ["Your role is not allowed to change this section."];
  }

  if (data?.message) return [data.message];

  return ["Could not reach the server. Your changes were not saved."];
}

export default settingsService;
