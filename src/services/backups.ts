// src/services/backups.ts
//
// Phase 1 — real backup status, replacing the Settings panel's localStorage
// timestamp. Read-only by design: the panel reports what cron did on the
// droplet, and nothing the browser does can create a backup record.

import apiClient from "../lib/apiClient";

export type BackupHealth = "never" | "healthy" | "stale" | "unprotected" | "unknown";

export type BackupRunStatus = "running" | "success" | "failed";

export type BackupOffsiteStatus = "pending" | "uploaded" | "failed" | "skipped";

export interface BackupRun {
  id: number;
  started_at: string | null;
  finished_at: string | null;
  status: BackupRunStatus;
  offsite_status: BackupOffsiteStatus;
  file_name: string | null;
  file_size_bytes: number | null;
  duration_seconds: number | null;
  trigger: string;
  error_message: string | null;
}

export interface BackupStatus {
  configured: boolean;
  health: BackupHealth;
  stale_after_hours?: number;
  message?: string;
  last_success: BackupRun | null;
  runs: BackupRun[];
}

export const backupsService = {
  async status(limit = 10): Promise<BackupStatus> {
    const response = await apiClient.get("/admin/backups/status", {
      params: { limit },
    });

    const payload = response.data ?? {};

    return {
      configured: Boolean(payload.configured),
      health: (payload.health as BackupHealth) ?? "unknown",
      stale_after_hours: payload.stale_after_hours,
      message: payload.message,
      last_success: payload.last_success ?? null,
      runs: Array.isArray(payload.runs) ? payload.runs : [],
    };
  },
};

export function formatBytes(bytes: number | null): string {
  if (bytes === null || Number.isNaN(bytes)) return "—";
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function formatRunTime(iso: string | null): string {
  if (!iso) return "—";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default backupsService;
