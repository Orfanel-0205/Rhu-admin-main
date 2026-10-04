// src/lib/apiClient.ts

import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { emitDuck } from "./duckBus";
import { emitToast, toUserErrorMessage } from "./toastBus";

function cleanUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

const RAW_API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1";

const API_BASE_URL = cleanUrl(RAW_API_BASE_URL);

function getStoredToken(): string | null {
  return localStorage.getItem("ka_agapay_token");
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getStoredToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

function clearSessionAndRedirect(): void {
  localStorage.removeItem("ka_agapay_token");
  localStorage.removeItem("ka_agapay_user");

  // Vite/browser-safe dynamic import. Do not use require() in TS/Vite.
  void import("../store/authStore")
    .then(({ useAuthStore }) => {
      useAuthStore.getState().clearAuth?.();
    })
    .catch(() => {
      // Safe fallback. The hard redirect below still clears the session.
    });

  if (
    typeof window !== "undefined" &&
    !window.location.pathname.includes("/login")
  ) {
    window.location.href = "/login";
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<any>) => {
    if (error.response?.status === 401) {
      clearSessionAndRedirect();
      return Promise.reject(error);
    }

    // Global safety net: a failed MUTATING request (or any request that opts in
    // with { showErrorToast: true }) must never fail silently. This guarantees a
    // visible toast even when a caller forgot to handle the error. Callers that
    // render their own error UI can opt out with { suppressErrorToast: true }.
    const config: any = error.config ?? {};
    const method = String(config.method ?? "get").toLowerCase();
    const isMutation = ["post", "put", "patch", "delete"].includes(method);
    const canceled = axios.isCancel?.(error) || error.code === "ERR_CANCELED";
    const status = error.response?.status ?? 0;
    const data = error.response?.data ?? {};

    // The whole system is down for an update: say so once, full-screen, for
    // every request -- a page that only loads data would otherwise just sit
    // there empty. See components/DuckStatus.tsx.
    if (status === 503 && !canceled && emitDuck({ kind: "maintenance" })) {
      return Promise.reject(error);
    }

    if (!canceled && !config.suppressErrorToast && (isMutation || config.showErrorToast)) {
      // "Your role can't do this" and "the server broke" get a duck with the
      // server's explanation; a sign-in code step is also a 403 but is not a
      // refusal, and screens that handle their own errors opted out above.
      const duck =
        status === 403 && !data?.code_required
          ? emitDuck({ kind: "forbidden", message: data?.message })
          : status >= 500
            ? emitDuck({ kind: "server_error" })
            : false;

      if (!duck) {
        emitToast(toUserErrorMessage(error), "error");
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;