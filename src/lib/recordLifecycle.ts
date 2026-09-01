import type { Tone } from "../theme/tokens";

export type LifecycleStatusKey =
  | "active"
  | "upcoming"
  | "available_today"
  | "pending"
  | "completed"
  | "expired"
  | "warning_expired"
  | "archived"
  | "deleted"
  | "history_only"
  | "overdue_follow_up";

export interface LifecycleStatus {
  key: LifecycleStatusKey;
  label: string;
  tone: Tone;
  reason: string;
  nextStep: string;
  date?: string | null;
  isHistory: boolean;
}

export interface LifecycleOptions {
  module?: string;
  dateFields?: string[];
  endDateFields?: string[];
  statusField?: string;
  completedStatuses?: string[];
  archivedStatuses?: string[];
  deletedStatuses?: string[];
  pendingStatuses?: string[];
  todayLabel?: string;
  activeLabel?: string;
  expiredLabel?: string;
  allowSameDayActive?: boolean;
}

const DEFAULT_DATE_FIELDS = [
  "expires_at",
  "end_date",
  "ends_at",
  "scheduled_at",
  "appointment_date",
  "follow_up_date",
  "available_date",
  "request_date",
  "release_date",
  "event_date",
  "schedule_date",
  "start_date",
  "starts_at",
  "consultation_date",
  "completed_at",
  "created_at",
];

const DEFAULT_END_FIELDS = ["expires_at", "end_date", "ends_at", "valid_until"];

const COMPLETED_STATUSES = ["completed", "released", "dispensed", "sent", "ended", "resolved"];
const ARCHIVED_STATUSES = ["archived", "past", "history", "history_only"];
const DELETED_STATUSES = ["deleted", "soft_deleted", "voided", "cancelled"];
const PENDING_STATUSES = ["pending", "draft", "open", "scheduled", "screened", "active", "ongoing"];

export function normalizeLifecycleValue(value?: string | null): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function parseRecordDate(value?: string | null): Date | null {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function isSameRecordDay(value?: string | null, now = new Date()): boolean {
  const date = parseRecordDate(value);
  if (!date) return false;

  return startOfDay(date).getTime() === startOfDay(now).getTime();
}

export function isPastDate(value?: string | null, now = new Date()): boolean {
  const date = parseRecordDate(value);
  if (!date) return false;

  return endOfDay(date).getTime() < startOfDay(now).getTime();
}

export function isFutureDate(value?: string | null, now = new Date()): boolean {
  const date = parseRecordDate(value);
  if (!date) return false;

  return startOfDay(date).getTime() > startOfDay(now).getTime();
}

export function firstDateField(record: Record<string, any>, fields: string[]): string | null {
  for (const field of fields) {
    const value = record?.[field];
    if (typeof value === "string" && parseRecordDate(value)) {
      return value;
    }
  }

  return null;
}

function lifecycle(
  key: LifecycleStatusKey,
  label: string,
  tone: Tone,
  reason: string,
  nextStep: string,
  date?: string | null
): LifecycleStatus {
  return {
    key,
    label,
    tone,
    reason,
    nextStep,
    date,
    isHistory: ["expired", "archived", "deleted", "history_only", "completed"].includes(key),
  };
}

export function getRecordLifecycleStatus(
  record: Record<string, any> | null | undefined,
  options: LifecycleOptions = {}
): LifecycleStatus {
  const source = record ?? {};
  const status = normalizeLifecycleValue(
    source[options.statusField ?? "status"] ?? source.lifecycle_status
  );

  const completed = options.completedStatuses ?? COMPLETED_STATUSES;
  const archived = options.archivedStatuses ?? ARCHIVED_STATUSES;
  const deleted = options.deletedStatuses ?? DELETED_STATUSES;
  const pending = options.pendingStatuses ?? PENDING_STATUSES;

  const dateFields = options.dateFields ?? DEFAULT_DATE_FIELDS;
  const endDateFields = options.endDateFields ?? DEFAULT_END_FIELDS;
  const endDate = firstDateField(source, endDateFields);
  const primaryDate = endDate ?? firstDateField(source, dateFields);
  const moduleName = options.module ?? "record";

  if (deleted.includes(status)) {
    return lifecycle(
      "deleted",
      "History",
      "danger",
      "This record is deleted or cancelled and is kept for audit history.",
      "View only unless a safe restore action is available.",
      primaryDate
    );
  }

  if (archived.includes(status) || source.archived_at) {
    return lifecycle(
      "archived",
      "Archived",
      "slate",
      "This record was archived and should not appear as an active task.",
      "Keep for records or renew with a new date when appropriate.",
      source.archived_at ?? primaryDate
    );
  }

  if (completed.includes(status)) {
    return lifecycle(
      "completed",
      "Completed",
      "success",
      "The workflow is complete and retained for records and reports.",
      "View only. Create a new record for new care activity.",
      primaryDate
    );
  }

  if (primaryDate && isPastDate(primaryDate)) {
    const isFollowUp = moduleName === "follow_up" || source.follow_up_date;
    const isLab = moduleName === "lab_request" || source.form_type === "lab_request";

    if (isFollowUp) {
      return lifecycle(
        "overdue_follow_up",
        "Overdue Follow-up",
        "warning",
        "The follow-up date already passed but the reminder is not completed.",
        "Contact the patient or reschedule the follow-up.",
        primaryDate
      );
    }

    return lifecycle(
      isLab ? "expired" : "history_only",
      isLab ? "Expired Lab Request" : options.expiredLabel ?? "History",
      isLab ? "warning" : "slate",
      `The ${moduleName} date has passed, so it should not look active.`,
      isLab
        ? "Review the request. Release the PDF if still valid, or renew/update the schedule."
        : "Keep for records. Renew with a new date only after staff review.",
      primaryDate
    );
  }

  if (primaryDate && isSameRecordDay(primaryDate)) {
    return lifecycle(
      "available_today",
      options.todayLabel ?? "Available Today",
      "brand",
      "This record is scheduled or valid for today.",
      "Handle during today's workflow or update the schedule if it cannot proceed.",
      primaryDate
    );
  }

  if (primaryDate && isFutureDate(primaryDate)) {
    return lifecycle(
      "upcoming",
      "Upcoming",
      "info",
      "This record has a future date.",
      "Prepare and monitor until the scheduled date.",
      primaryDate
    );
  }

  if (pending.includes(status)) {
    return lifecycle(
      status === "draft" ? "pending" : "active",
      status === "draft" ? "Pending" : options.activeLabel ?? "Active",
      status === "draft" ? "warning" : "info",
      "This record is still part of the active workflow.",
      "Review and complete the required staff action.",
      primaryDate
    );
  }

  return lifecycle(
    "active",
    options.activeLabel ?? "Active",
    "info",
    "No expiration date was detected, so this record remains visible.",
    "Review the record and update its status when done.",
    primaryDate
  );
}

// ── Recycle-bin retention countdown ─────────────────────────────────────────
// Part 6: a soft-deleted record stays RESTORABLE for `windowDays` after it was
// archived; past that it becomes HISTORICAL (the backend restore() refuses it —
// the data is NOT destroyed). This computes the visible countdown from the
// archive timestamp alone (usually the delete audit log's created_at), so there
// is a single source of truth. It does NOT trigger any deletion.

export type ArchiveUrgency = "safe" | "soon" | "urgent" | "expired";

export interface ArchiveCountdown {
  windowDays: number;
  daysLeft: number; // whole days until the restore window closes (0 once past)
  isExpired: boolean; // true = restore window closed → historical
  urgency: ArchiveUrgency;
  label: string;
}

export function getArchiveCountdown(
  archivedAt?: string | null,
  windowDays = 30,
  now: Date = new Date()
): ArchiveCountdown {
  const archived = parseRecordDate(archivedAt);

  if (!archived) {
    return {
      windowDays,
      daysLeft: windowDays,
      isExpired: false,
      urgency: "safe",
      label: `Restorable · ${windowDays} days`,
    };
  }

  const expiry = new Date(archived.getTime() + windowDays * 86_400_000);
  const msLeft = expiry.getTime() - now.getTime();

  if (msLeft <= 0) {
    return {
      windowDays,
      daysLeft: 0,
      isExpired: true,
      urgency: "expired",
      label: "Restore window closed (historical)",
    };
  }

  const daysLeft = Math.max(1, Math.ceil(msLeft / 86_400_000));
  const urgency: ArchiveUrgency =
    daysLeft <= 3 ? "urgent" : daysLeft <= 7 ? "soon" : "safe";

  return {
    windowDays,
    daysLeft,
    isExpired: false,
    urgency,
    label: `Restorable · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`,
  };
}
