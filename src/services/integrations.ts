// src/services/integrations.ts
//
// Settings > API keys. Super admin only; the backend refuses everyone else.
//
// Nothing here ever receives a key back from the server. A saved secret is
// reported as where it comes from and its last four characters, so this
// module only ever sends keys, never holds one that the user did not type.

import apiClient from "../lib/apiClient";

export type IntegrationId = "gemini" | "semaphore" | "ocr_space" | "jaas";

/**
 * Where a field's value comes from.
 *
 *   saved       entered on this page, encrypted on the server
 *   server      the server's own .env file
 *   none        not set anywhere
 *   unreadable  saved here, but cannot be decrypted (the server's app key
 *               changed); the server default is being used until it is saved again
 */
export type FieldSource = "saved" | "server" | "none" | "unreadable";

export interface IntegrationField {
  label: string;
  secret: boolean;
  /** Whether the page offers "View". The server checks again, with the password. */
  revealable: boolean;
  source: FieldSource;
  /** For identifiers the value; for secrets only a hint such as "Ends in 4f2a". */
  display: string | null;
}

export interface IntegrationStatus {
  label: string;
  customised: boolean;
  fields: Record<string, IntegrationField>;
  updated_at: string | null;
  updated_by: string | null;
}

export interface IntegrationTestResult {
  ok: boolean;
  message: string;
  warning?: string;
  details?: {
    credit_balance?: number;
    account_name?: string;
    approved_sender_names?: string[];
    model?: string;
    fingerprint?: string;
  };
}

export type IntegrationValues = Partial<Record<string, string>>;

/**
 * The panel shows every outcome in place, so the client's automatic error
 * toast would only repeat it.
 */
// apiClient reads this flag from the request config; Axios's type does not
// declare it, so it is cast the same way the other services pass it.
const QUIET = { suppressErrorToast: true } as any;

export async function getIntegrations(): Promise<Record<IntegrationId, IntegrationStatus>> {
  const response = await apiClient.get("/admin/settings/integrations");
  return response.data?.integrations ?? {};
}

/** Try values without saving them. */
export async function testIntegration(
  id: IntegrationId,
  values: IntegrationValues
): Promise<IntegrationTestResult> {
  const response = await apiClient.post(
    `/admin/settings/integrations/${id}/test`,
    onlyFilled(values),
    QUIET
  );

  return response.data?.result;
}

export interface SaveOutcome {
  saved: boolean;
  message: string;
  result?: IntegrationTestResult;
  integrations?: Record<IntegrationId, IntegrationStatus>;
}

/**
 * Test, then save if the test passed.
 *
 * A failed test comes back as HTTP 422 with the test result, which is an
 * expected outcome here rather than an error, so it is returned, not thrown.
 */
export async function saveIntegration(
  id: IntegrationId,
  values: IntegrationValues
): Promise<SaveOutcome> {
  try {
    const response = await apiClient.put(
      `/admin/settings/integrations/${id}`,
      onlyFilled(values),
      QUIET
    );

    return {
      saved: true,
      message: response.data?.message ?? "Saved.",
      result: response.data?.result,
      integrations: response.data?.integrations,
    };
  } catch (error: unknown) {
    const data = (error as { response?: { status?: number; data?: any } })?.response;

    if (data?.status === 422) {
      return {
        saved: false,
        message: data.data?.message ?? "Not saved.",
        result: data.data?.result,
      };
    }

    throw error;
  }
}

/** Drop the saved values so the server's .env applies again. */
export async function resetIntegration(id: IntegrationId): Promise<SaveOutcome> {
  const response = await apiClient.delete(`/admin/settings/integrations/${id}`, QUIET);

  return {
    saved: true,
    message: response.data?.message ?? "Reset.",
    integrations: response.data?.integrations,
  };
}

export interface RevealOutcome {
  ok: boolean;
  /** The key, only when ok. Held in component state and nowhere else. */
  value?: string;
  /** How long the page may show it before hiding it again. */
  visibleSeconds?: number;
  message?: string;
  attemptsLeft?: number;
  locked?: boolean;
}

/**
 * Show one key in full. The super admin's own password is required every time.
 *
 * A wrong password (422) and a lockout (429) are expected answers here, so
 * they come back as outcomes for the dialog to show, not as thrown errors.
 * The server answers 422 rather than 401 for a wrong password on purpose:
 * the client treats any 401 as an expired session and signs the user out.
 */
export async function revealIntegrationField(
  id: IntegrationId,
  field: string,
  password: string
): Promise<RevealOutcome> {
  try {
    const response = await apiClient.post(
      `/admin/settings/integrations/${id}/reveal`,
      { field, password },
      QUIET
    );

    return {
      ok: true,
      value: String(response.data?.value ?? ""),
      visibleSeconds: Number(response.data?.visible_seconds ?? 30),
    };
  } catch (error: unknown) {
    const response = (error as { response?: { status?: number; data?: any } })?.response;

    if (response && [404, 422, 429].includes(response.status ?? 0)) {
      return {
        ok: false,
        message: response.data?.message ?? "The key could not be shown.",
        attemptsLeft: response.data?.attempts_left,
        locked: response.status === 429 || response.data?.locked === true,
      };
    }

    throw error;
  }
}

/** Blank means "keep the current value", so blanks are not sent at all. */
function onlyFilled(values: IntegrationValues): Record<string, string> {
  const filled: Record<string, string> = {};

  for (const [key, value] of Object.entries(values)) {
    const trimmed = String(value ?? "").trim();

    if (trimmed) filled[key] = trimmed;
  }

  return filled;
}
