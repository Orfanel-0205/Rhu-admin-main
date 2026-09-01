// src/pages/DeleteHistory.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  AlertTriangle,
  Archive,
  CalendarDays,
  CheckCircle,
  Download,
  FileSearch,
  Filter,
  History,
  Info,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  TimerReset,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  actorName,
  downloadAuditCsv,
  expireDeletedRecords,
  formatAuditDate,
  getDeleteHistory,
  restoreDeletedRecord,
  type AuditLog,
} from "../services/audit";
import { useLangStore } from "../store/langStore";
import { useToast } from "../contexts/ToastContext";
import {
  getArchiveCountdown,
  type ArchiveUrgency,
} from "../lib/recordLifecycle";
import { usePagination } from "../hooks/usePagination";
import ModuleTabs from "../components/ui/ModuleTabs";
import TablePagination from "../components/ui/TablePagination";
import ConfirmDialog from "../components/ui/ConfirmDialog";

type Filters = {
  search: string;
  module: string;
  severity: string;
  from: string;
  to: string;
};

type HistoryTab =
  | "all"
  | "expired"
  | "archived"
  | "deleted"
  | "completed"
  | "restorable"
  | "overdue_followups"
  | "expired_events"
  | "expired_lab_requests";

const emptyFilters: Filters = {
  search: "",
  module: "",
  severity: "",
  from: "",
  to: "",
};

const RESTORE_WINDOW_DAYS = 30;

// Retention-countdown chip colours, escalating as the restore window nears 0.
function countdownChipStyle(urgency: ArchiveUrgency): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap",
  };

  switch (urgency) {
    case "urgent":
      return { ...base, background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA" };
    case "soon":
      return { ...base, background: "#FFFBEB", color: "#B45309", border: "1px solid #FDE68A" };
    case "expired":
      return { ...base, background: "#F1F5F9", color: "#64748B", border: "1px solid #E2E8F0" };
    default:
      return { ...base, background: "#ECFDF5", color: "#047857", border: "1px solid #A7F3D0" };
  }
}
const EXPIRATION_BATCH_SIZE = 50;

const RESTORABLE_MODULES = [
  "announcements",
  "events",
  "appointments",
  "consultations",
  "inventory",
  "inventory_items",
  "users",
];

function copyForLang(lang: string) {
  const pag = lang === "pag";
  const tag = lang === "tag" || lang === "tl" || lang === "fil";

  return {
    title: pag ? "History" : tag ? "History" : "History",

    subtitle: pag
      ? "Nengnengen, i-restore no safe ni, tan i-expire so daan la ya deleted records pian agnapno so storage."
      : tag
      ? "Suriin, i-restore kung safe pa, at i-expire ang lumang deleted records para hindi mapuno ang storage."
      : "Review, restore when still safe, and expire old deleted records so hosting storage stays controlled.",

    eyebrow: pag ? "RHU Audit Trail" : tag ? "RHU Audit Trail" : "RHU Audit Trail",

    stepText: pag
      ? "Step 1: Suriin so record   Step 2: I-restore no safe   Step 3: I-expire so daan ya non-critical records"
      : tag
      ? "Step 1: Suriin ang record   Step 2: I-restore kung safe   Step 3: I-expire ang lumang non-critical records"
      : "Step 1: Review record   Step 2: Restore if safe   Step 3: Expire old non-critical records",

    refresh: pag ? "I-refresh" : tag ? "I-refresh" : "Refresh",
    exportCsv: "Export CSV",
    apply: pag ? "I-apply" : tag ? "I-apply" : "Apply",
    clear: pag ? "Clear Filter" : tag ? "Clear Filter" : "Clear Filter",
    restore: pag ? "I-restore" : tag ? "I-restore" : "Restore",
    expireOld: pag ? "Expire Old Records" : tag ? "Expire Old Records" : "Expire Old Records",

    searchPlaceholder: pag
      ? "Mananap na action, record, actor..."
      : tag
      ? "Hanapin ang action, record, actor..."
      : "Search action, record, actor...",

    allModules: pag ? "Amin ya Modules" : tag ? "Lahat ng Modules" : "All Modules",
    allSeverity: pag ? "Amin ya Severity" : tag ? "Lahat ng Severity" : "All Severity",
    tabAllHistory: "All History",
    tabExpired: pag ? "Expired" : tag ? "Expired" : "Expired",
    tabArchived: pag ? "Archived" : tag ? "Archived" : "Archived",
    tabDeleted: pag ? "Deleted" : tag ? "Deleted" : "Deleted",
    tabCompleted: pag ? "Completed" : tag ? "Completed" : "Completed",
    tabRestorable: pag ? "Restorable" : tag ? "Puwedeng I-restore" : "Restorable",
    tabOverdueFollowups: pag ? "Overdue Follow-ups" : tag ? "Overdue Follow-ups" : "Overdue Follow-ups",
    tabExpiredEvents: pag ? "Expired Events" : tag ? "Expired Events" : "Expired Events",
    tabExpiredLabRequests: pag ? "Expired Lab Requests" : tag ? "Expired Lab Requests" : "Expired Lab Requests",
    info: "Info",
    warning: "Warning",
    critical: "Critical",

    totalLogs: "Total History Logs",
    deletedRecords: "Deleted Records",
    archivedRecords: "Archived Records",
    restorableRecords: pag ? "Restorable" : tag ? "Puwedeng I-restore" : "Restorable",
    expiredRecords: pag ? "Expired Restore" : tag ? "Expired Restore" : "Expired Restore",

    safetyTitle: pag
      ? "Importanteng paalala"
      : tag
      ? "Mahalagang paalala"
      : "Important reminder",

    safetyBody: pag
      ? "Restore et para labat ed soft-deleted records. Expiration et batch limit labat pian agnapno so hosting, ag-overload so server, tan agna-delete so audit trail."
      : tag
      ? "Ang restore ay para lamang sa soft-deleted records. Ang expiration ay naka-batch limit para hindi mapuno ang hosting, hindi ma-overload ang server, at hindi mabura ang audit trail."
      : "Restore is only for soft-deleted records. Expiration uses small batches so hosting storage is controlled, the server is not overloaded, and the audit trail is preserved.",

    boardTitle: "Audit Trail Records",
    boardSubtitle: pag
      ? "Simple cards pian natatalosan na staff no antoy agawa, siopa so nanggawa, akin, tan no sarag nin i-restore."
      : tag
      ? "Simple cards para maintindihan ng staff kung ano ang nangyari, sino ang gumawa, bakit, at kung puwede pang i-restore."
      : "Simple cards help staff understand what happened, who did it, why, and whether it can still be restored.",

    loading: pag ? "Lo-load so delete history..." : tag ? "Nilo-load ang delete history..." : "Loading delete history...",
    empty: pag ? "Anggapo history ya aromog." : tag ? "Walang history na nahanap." : "No history found.",
    emptyHelp: pag
      ? "Subukan so arum ya filter odino search keyword."
      : tag
      ? "Subukan ang ibang filter o search keyword."
      : "Try another filter or search keyword.",

    dateFrom: "Date From",
    dateTo: "Date To",

    whatHappened: pag ? "Antoy agawa?" : tag ? "Ano ang nangyari?" : "What happened?",
    whoDidIt: pag ? "Siopay nanggawa?" : tag ? "Sino ang gumawa?" : "Who did it?",
    why: pag ? "Akin?" : tag ? "Bakit?" : "Why?",
    record: "Record",
    module: "Module",
    ip: "IP",
    severity: "Severity",
    nextStep: "Next Step",
    restoreStatus: pag ? "Restore Status" : tag ? "Restore Status" : "Restore Status",

    noReason: pag
      ? "Anggapo rason ya na-record."
      : tag
      ? "Walang dahilan na na-record."
      : "No reason recorded.",

    unnamedRecord: pag ? "Anggapo ngaran ya record" : tag ? "Walang pangalan na record" : "Unnamed record",
    unknownActor: pag ? "Ag-amta ya user" : tag ? "Hindi kilalang user" : "Unknown user",
    notAvailable: "—",

    dateError: pag
      ? "Aliwan dugan date range. Dapat mas nauna so Date From nen Date To."
      : tag
      ? "Mali ang date range. Dapat mas nauna ang Date From kaysa Date To."
      : "Invalid date range. Date From must be earlier than Date To.",

    exportEmpty: pag
      ? "Anggapo record ya ie-export."
      : tag
      ? "Walang record na ie-export."
      : "No records to export.",

    restoreConfirm: pag
      ? "I-restore iya ya record?\n\nSarag ya bumalik ed active list no safe ni tan soft-deleted so record."
      : tag
      ? "I-restore ang record na ito?\n\nBabalik ito sa active list kung safe pa at soft-deleted ang record."
      : "Restore this record?\n\nIt will return to the active list if it is still safe and soft-deleted.",

    restored: pag ? "Na-restore so record." : tag ? "Na-restore ang record." : "Record restored.",
    restoreFailed: pag ? "Agnayari ya i-restore so record." : tag ? "Hindi ma-restore ang record." : "Failed to restore record.",

    expireConfirm: pag
      ? `Expire old deleted records?\n\nSayan et batch limit ${EXPIRATION_BATCH_SIZE} records labat. Non-critical modules labat so hard-delete. Audit logs et agna-delete.`
      : tag
      ? `I-expire ang lumang deleted records?\n\nBatch limit ito na ${EXPIRATION_BATCH_SIZE} records lamang. Non-critical modules lang ang hard-delete. Hindi mabubura ang audit logs.`
      : `Expire old deleted records?\n\nThis is limited to ${EXPIRATION_BATCH_SIZE} records per run. Only non-critical modules are hard-deleted. Audit logs are not deleted.`,

    expireDaysPrompt: pag
      ? "Pigay agew antis i-expire? Minimum 30 days."
      : tag
      ? "Ilang araw bago i-expire? Minimum 30 days."
      : "How many days before expiration? Minimum 30 days.",

    expireInvalid: pag
      ? "Invalid retention days. Minimum 30, maximum 3650."
      : tag
      ? "Invalid retention days. Minimum 30, maximum 3650."
      : "Invalid retention days. Minimum 30, maximum 3650.",

    expiredDone: pag
      ? "Expiration complete. Expired records: {count}"
      : tag
      ? "Expiration complete. Expired records: {count}"
      : "Expiration complete. Expired records: {count}",

    nextCritical: pag
      ? "I-review tampol. Critical action so naaramid."
      : tag
      ? "I-review agad. May critical action na nangyari."
      : "Review immediately. A critical action was performed.",

    nextWarning: pag
      ? "Nengnengen so rason tan siguraduhen ya authorized so action."
      : tag
      ? "Suriin ang dahilan at siguraduhing authorized ang action."
      : "Check the reason and confirm the action was authorized.",

    nextInfo: pag
      ? "Record labat parad monitoring. Anggapo urgent action."
      : tag
      ? "Record lamang para sa monitoring. Walang urgent action."
      : "Record only for monitoring. No urgent action needed.",

    restoreAvailable: pag
      ? "Puwede nin i-restore anggan {date}."
      : tag
      ? "Puwede pang i-restore hanggang {date}."
      : "Can be restored until {date}.",

    restoreExpired: pag
      ? "Expired la so restore window. Manual database review la."
      : tag
      ? "Expired na ang restore window. Manual database review na lang."
      : "Restore window expired. Manual database review required.",

    restoreNotDeleted: pag
      ? "Aliwan deleted record. Restore action et ag available."
      : tag
      ? "Hindi ito deleted record. Walang restore action."
      : "This is not a deleted record. Restore is not available.",

    restoreUnsupported: pag
      ? "Sayan module et kailangan manual review bago i-restore."
      : tag
      ? "Ang module na ito ay kailangan ng manual review bago i-restore."
      : "This module requires manual review before restore.",

    modules: {
      announcements: pag ? "Saray Anunsyo" : tag ? "Mga Anunsyo" : "Announcements",
      events: pag ? "Saray Aktibidad" : tag ? "Mga Kaganapan" : "Events",
      appointments: pag ? "Saray Appointment" : tag ? "Mga Appointment" : "Appointments",
      consultations: pag ? "Konsultasyon" : tag ? "Konsultasyon" : "Consultations",
      prescriptions: pag ? "E-Reseta" : tag ? "E-Reseta" : "E-Prescription",
      inventory: pag ? "Imbentaryo" : tag ? "Imbentaryo" : "Inventory",
      users: pag ? "Saray User" : tag ? "Mga User" : "Users",
    },
  };
}

function moduleOptions(c: ReturnType<typeof copyForLang>) {
  return [
    { value: "", label: c.allModules },
    { value: "announcements", label: c.modules.announcements },
    { value: "events", label: c.modules.events },
    { value: "appointments", label: c.modules.appointments },
    { value: "consultations", label: c.modules.consultations },
    { value: "prescriptions", label: c.modules.prescriptions },
    { value: "inventory", label: c.modules.inventory },
    { value: "users", label: c.modules.users },
  ];
}

function historyTabOptions(c: ReturnType<typeof copyForLang>): Array<{
  value: HistoryTab;
  label: string;
}> {
  return [
    { value: "all", label: c.tabAllHistory },
    { value: "expired", label: c.tabExpired },
    { value: "archived", label: c.tabArchived },
    { value: "deleted", label: c.tabDeleted },
    { value: "completed", label: c.tabCompleted },
    { value: "restorable", label: c.tabRestorable },
    { value: "overdue_followups", label: c.tabOverdueFollowups },
    { value: "expired_events", label: c.tabExpiredEvents },
    { value: "expired_lab_requests", label: c.tabExpiredLabRequests },
  ];
}

function actionLabel(action: string) {
  return String(action || "Action")
    .replace(/\./g, " ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getReason(log: AuditLog, c: ReturnType<typeof copyForLang>) {
  return (
    log.metadata?.reason ||
    log.metadata?.delete_reason ||
    log.metadata?.archive_reason ||
    log.old_values?.delete_reason ||
    log.old_values?.archive_reason ||
    c.noReason
  );
}

function severityMeta(severity?: string | null) {
  const safe = String(severity || "info").toLowerCase();

  if (safe === "critical") {
    return {
      label: "CRITICAL",
      icon: <ShieldAlert size={15} />,
      style: {
        background: "#FEE2E2",
        color: "#991B1B",
        border: "1px solid #FECACA",
      } as CSSProperties,
    };
  }

  if (safe === "warning") {
    return {
      label: "WARNING",
      icon: <AlertTriangle size={15} />,
      style: {
        background: "#FEF3C7",
        color: "#92400E",
        border: "1px solid #FDE68A",
      } as CSSProperties,
    };
  }

  return {
    label: "INFO",
    icon: <Info size={15} />,
    style: {
      background: "#D1FAE5",
      color: "#065F46",
      border: "1px solid #A7F3D0",
    } as CSSProperties,
  };
}

function nextStep(log: AuditLog, c: ReturnType<typeof copyForLang>) {
  const severity = String(log.severity || "info").toLowerCase();

  if (severity === "critical") return c.nextCritical;
  if (severity === "warning") return c.nextWarning;

  return c.nextInfo;
}

function isDeletedAction(log: AuditLog) {
  const action = String(log.action || "").toLowerCase();

  return (
    action.includes("deleted") ||
    action.includes("delete") ||
    action.includes("soft_deleted")
  );
}

function moduleKey(log: AuditLog) {
  return String(log.module || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function addDays(dateValue: string, days: number) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setDate(date.getDate() + days);

  return date;
}

function restoreDeadline(log: AuditLog) {
  return addDays(log.created_at, RESTORE_WINDOW_DAYS);
}

function canRestore(log: AuditLog) {
  if (!isDeletedAction(log)) return false;

  const module = moduleKey(log);

  if (!RESTORABLE_MODULES.includes(module)) {
    return false;
  }

  const deadline = restoreDeadline(log);

  if (!deadline) return false;

  return new Date() <= deadline;
}

function isRestoreExpired(log: AuditLog) {
  if (!isDeletedAction(log)) return false;

  const deadline = restoreDeadline(log);
  return Boolean(deadline && new Date() > deadline);
}

function logSearchText(log: AuditLog) {
  return [
    log.module,
    log.action,
    log.subject_type,
    log.subject_label,
    log.metadata?.reason,
    log.metadata?.lifecycle_status,
    log.metadata?.record_type,
    log.metadata?.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesHistoryTab(log: AuditLog, tab: HistoryTab) {
  if (tab === "all") return true;

  const text = logSearchText(log);
  const action = String(log.action || "").toLowerCase();
  const module = moduleKey(log);

  if (tab === "deleted") return isDeletedAction(log);
  if (tab === "archived") return action.includes("archived") || text.includes("archived");
  if (tab === "completed") return action.includes("completed") || text.includes("completed");
  if (tab === "restorable") return canRestore(log);
  if (tab === "expired") {
    return isRestoreExpired(log) || action.includes("expired") || text.includes("expired");
  }
  if (tab === "overdue_followups") {
    return text.includes("overdue") || (module.includes("follow") && text.includes("follow"));
  }
  if (tab === "expired_events") {
    return module.includes("event") && (action.includes("expired") || text.includes("expired"));
  }
  if (tab === "expired_lab_requests") {
    return (
      (module.includes("prescription") || module.includes("lab")) &&
      text.includes("lab") &&
      (action.includes("expired") || text.includes("expired"))
    );
  }

  return true;
}

function restoreStatusText(log: AuditLog, c: ReturnType<typeof copyForLang>) {
  if (!isDeletedAction(log)) return c.restoreNotDeleted;

  const module = moduleKey(log);

  if (!RESTORABLE_MODULES.includes(module)) {
    return c.restoreUnsupported;
  }

  const deadline = restoreDeadline(log);

  if (!deadline) return c.restoreExpired;

  if (new Date() > deadline) return c.restoreExpired;

  return c.restoreAvailable.replace(
    "{date}",
    deadline.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  );
}

function formatMessage(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((result, [key, value]) => {
    return result.split(`{${key}}`).join(String(value));
  }, template);
}

export default function DeleteHistory() {
  const lang = useLangStore((state) => state.lang);
  const c = copyForLang(lang);
  const toast = useToast();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [historyTab, setHistoryTab] = useState<HistoryTab>("all");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(emptyFilters);

  const [loading, setLoading] = useState(true);
  const [restoreId, setRestoreId] = useState<number | null>(null);
  const [expiring, setExpiring] = useState(false);
  const [expireConfirmOpen, setExpireConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const load = useCallback(
    async (activeFilters: Filters = appliedFilters) => {
      setLoading(true);
      setError("");

      try {
        const result = await getDeleteHistory({
          search: activeFilters.search.trim() || undefined,
          module: activeFilters.module || undefined,
          severity: activeFilters.severity || undefined,
          from: activeFilters.from || undefined,
          to: activeFilters.to || undefined,
          per_page: 100,
        });

        setLogs(result.data);
      } catch (err: any) {
        setError(
          err?.response?.data?.message ||
            err?.message ||
            "Failed to load delete history."
        );
      } finally {
        setLoading(false);
      }
    },
    [appliedFilters]
  );

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    return {
      total: logs.length,
      deleted: logs.filter((log) => isDeletedAction(log)).length,
      archived: logs.filter((log) =>
        String(log.action || "").toLowerCase().includes("archived")
      ).length,
      restorable: logs.filter((log) => canRestore(log)).length,
      expired: logs.filter((log) => {
        if (!isDeletedAction(log)) return false;

        const deadline = restoreDeadline(log);

        return Boolean(deadline && new Date() > deadline);
      }).length,
    };
  }, [logs]);

  const visibleLogs = useMemo(() => {
    return logs.filter((log) => matchesHistoryTab(log, historyTab));
  }, [logs, historyTab]);

  // Part 8 — paginate the archived-record card list (reset on tab/filter change).
  const pg = usePagination(visibleLogs, { resetDeps: [visibleLogs] });

  function flash(message: string) {
    toast.success(message);
    setSaved(message);
    window.setTimeout(() => setSaved(""), 2800);
  }

  function applyFilters() {
    if (filters.from && filters.to && filters.from > filters.to) {
      toast.warning(c.dateError);
      return;
    }

    setAppliedFilters(filters);
  }

  function clearFilters() {
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
  }

  function exportCsv() {
    if (logs.length === 0) {
      toast.warning(c.exportEmpty);
      return;
    }

    downloadAuditCsv("ka-agapay-delete-history.csv", logs);
    flash("CSV exported.");
  }

  async function onRestore(log: AuditLog) {
    if (!canRestore(log)) return;

    const confirmed = window.confirm(c.restoreConfirm);

    if (!confirmed) return;

    setRestoreId(log.id);
    setError("");

    try {
      await restoreDeletedRecord(log.id);
      flash(c.restored);
      await load();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          c.restoreFailed
      );
    } finally {
      setRestoreId(null);
    }
  }

  // This is the ONLY genuinely irreversible delete in the app — it hard-deletes
  // non-critical records in batches, with no recycle bin behind it — so it gets
  // the same type-to-confirm friction. There is no single record name to retype
  // here (it is a bulk purge), so the typed token is the fixed word EXPIRE.
  function onExpireOldRecords() {
    setExpireConfirmOpen(true);
  }

  async function confirmExpireOldRecords() {
    setExpireConfirmOpen(false);

    const input = window.prompt(c.expireDaysPrompt, String(RESTORE_WINDOW_DAYS));
    const retentionDays = Number.parseInt(String(input || ""), 10);

    if (
      Number.isNaN(retentionDays) ||
      retentionDays < 30 ||
      retentionDays > 3650
    ) {
      toast.warning(c.expireInvalid);
      return;
    }

    setExpiring(true);
    setError("");

    try {
      const result = await expireDeletedRecords({
        retention_days: retentionDays,
        batch_size: EXPIRATION_BATCH_SIZE,
        dry_run: false,
      });

      flash(formatMessage(c.expiredDone, { count: result.expired_count ?? 0 }));
      await load();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to expire old records."
      );
    } finally {
      setExpiring(false);
    }
  }

  return (
    <div className="delete-history-shell">
      <main className="delete-history-main">
        <style>{pageStyles}</style>

        <section className="history-hero">
          <div>
            <div className="hero-kicker">
              <ShieldAlert size={16} />
              {c.eyebrow}
            </div>

            <h1>{c.title}</h1>
            <p>{c.subtitle}</p>
            <div className="hero-steps">{c.stepText}</div>
          </div>

          <div className="hero-actions">
            <button onClick={() => load()} className="hero-white-btn">
              <RefreshCw size={16} />
              {c.refresh}
            </button>

            <button onClick={exportCsv} className="hero-white-btn">
              <Download size={16} />
              {c.exportCsv}
            </button>

            <button
              onClick={onExpireOldRecords}
              className="hero-white-btn danger"
              disabled={expiring}
            >
              {expiring ? <RefreshCw size={16} /> : <TimerReset size={16} />}
              {c.expireOld}
            </button>
          </div>
        </section>

        {saved && (
          <div className="success-message">
            <CheckCircle size={17} />
            {saved}
          </div>
        )}

        {error && (
          <div className="error-message">
            <AlertTriangle size={17} />
            {error}
          </div>
        )}

        <section className="metric-grid">
          <MetricCard
            label={c.totalLogs}
            value={stats.total}
            icon={<History size={22} />}
          />
          <MetricCard
            label={c.deletedRecords}
            value={stats.deleted}
            icon={<Trash2 size={22} />}
          />
          <MetricCard
            label={c.archivedRecords}
            value={stats.archived}
            icon={<Archive size={22} />}
          />
          <MetricCard
            label={c.restorableRecords}
            value={stats.restorable}
            icon={<Undo2 size={22} />}
            good={stats.restorable > 0}
          />
          <MetricCard
            label={c.expiredRecords}
            value={stats.expired}
            icon={<TimerReset size={22} />}
            warning={stats.expired > 0}
          />
        </section>

        <section className="safety-banner">
          <AlertTriangle size={18} />
          <div>
            <strong>{c.safetyTitle}</strong>
            <p>{c.safetyBody}</p>
          </div>
        </section>

        <section className="filter-panel">
          <div className="search-box">
            <Search size={17} />
            <input
              value={filters.search}
              onChange={(event) =>
                setFilters({ ...filters, search: event.target.value })
              }
              placeholder={c.searchPlaceholder}
            />
          </div>

          <select
            value={filters.module}
            onChange={(event) =>
              setFilters({ ...filters, module: event.target.value })
            }
          >
            {moduleOptions(c).map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={filters.severity}
            onChange={(event) =>
              setFilters({ ...filters, severity: event.target.value })
            }
          >
            <option value="">{c.allSeverity}</option>
            <option value="info">{c.info}</option>
            <option value="warning">{c.warning}</option>
            <option value="critical">{c.critical}</option>
          </select>

          <label className="date-filter">
            <span>{c.dateFrom}</span>
            <input
              type="date"
              value={filters.from}
              onChange={(event) =>
                setFilters({ ...filters, from: event.target.value })
              }
            />
          </label>

          <label className="date-filter">
            <span>{c.dateTo}</span>
            <input
              type="date"
              value={filters.to}
              onChange={(event) =>
                setFilters({ ...filters, to: event.target.value })
              }
            />
          </label>

          <button onClick={applyFilters} className="apply-btn">
            <Filter size={16} />
            {c.apply}
          </button>

          <button onClick={clearFilters} className="clear-btn">
            <RotateCcw size={16} />
            {c.clear}
          </button>
        </section>

        {/* Panelist follow-up round: standardized segmented-pill navigation
            (shared ModuleTabs) replacing the page-local .history-tabs styling. */}
        <section style={{ padding: "2px 0" }}>
          <ModuleTabs
            tabs={historyTabOptions(c).map((tab) => ({
              key: tab.value,
              label: tab.label,
            }))}
            active={historyTab}
            onChange={(key) => setHistoryTab(key as HistoryTab)}
          />
        </section>

        <section className="history-board">
          <div className="board-header">
            <div>
              <h2>{c.boardTitle}</h2>
              <p>{c.boardSubtitle}</p>
            </div>
          </div>

          {loading ? (
            <div className="empty-state">
              <RefreshCw size={28} />
              <strong>{c.loading}</strong>
            </div>
          ) : pg.total === 0 ? (
            <div className="empty-state">
              <FileSearch size={28} />
              <strong>{c.empty}</strong>
              <span>{c.emptyHelp}</span>
            </div>
          ) : (
            <>
              <div className="audit-card-list">
                {pg.pageRows.map((log) => (
                  <AuditCard
                    key={log.id}
                    log={log}
                    copy={c}
                    restoring={restoreId === log.id}
                    onRestore={() => onRestore(log)}
                  />
                ))}
              </div>

              <TablePagination
                page={pg.page}
                pageCount={pg.pageCount}
                total={pg.total}
                from={pg.from}
                to={pg.to}
                pageSize={pg.pageSize}
                onPage={pg.setPage}
                onPageSize={pg.setPageSize}
                label="archived records"
              />
            </>
          )}
        </section>
      </main>

      <ConfirmDialog
        open={expireConfirmOpen}
        title="Permanently expire old deleted records"
        tone="danger"
        confirmLabel="Continue"
        busy={expiring}
        matchText="EXPIRE"
        matchLabel={
          <>
            Type <code>EXPIRE</code> to confirm this permanent deletion
          </>
        }
        message={
          <>
            This <strong>permanently hard-deletes</strong> old soft-deleted
            records from non-critical modules, in batches of{" "}
            {EXPIRATION_BATCH_SIZE}. Unlike every other delete in this system,
            these records <strong>cannot be restored</strong> afterwards. Audit
            logs are never deleted. You will be asked for the retention window
            next.
          </>
        }
        onConfirm={confirmExpireOldRecords}
        onCancel={() => setExpireConfirmOpen(false)}
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  warning,
  good,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  warning?: boolean;
  good?: boolean;
}) {
  return (
    <div
      className={`metric-card ${warning ? "warning" : ""} ${
        good ? "good" : ""
      }`}
    >
      <div className="metric-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function AuditCard({
  log,
  copy,
  restoring,
  onRestore,
}: {
  log: AuditLog;
  copy: ReturnType<typeof copyForLang>;
  restoring: boolean;
  onRestore: () => void;
}) {
  const severity = severityMeta(log.severity);
  const reason = getReason(log, copy);
  const restorable = canRestore(log);
  // Countdown computed from the archive time (audit created_at) + the single
  // RESTORE_WINDOW_DAYS source of truth — no separate stored expiry.
  const countdown = getArchiveCountdown(log.created_at, RESTORE_WINDOW_DAYS);

  return (
    <article className="audit-card">
      <div className="audit-card-top">
        <div>
          <span className="audit-date">
            <CalendarDays size={15} />
            {formatAuditDate(log.created_at)}
          </span>

          <h3>{actionLabel(log.action)}</h3>
        </div>

        <div className="top-pill-row">
          <span className="severity-pill" style={severity.style}>
            {severity.icon}
            {severity.label}
          </span>

          <span
            style={countdownChipStyle(countdown.urgency)}
            title={
              countdown.isExpired
                ? `The ${RESTORE_WINDOW_DAYS}-day restore window has passed. The record is kept as historical data and is no longer restorable from here — it is not deleted.`
                : `Restorable for ${countdown.daysLeft} more day(s) before it becomes historical.`
            }
          >
            <TimerReset size={13} />
            {countdown.label}
          </span>

          {restorable && (
            <button
              type="button"
              className="restore-btn"
              onClick={onRestore}
              disabled={restoring}
            >
              {restoring ? <RefreshCw size={15} /> : <Undo2 size={15} />}
              {restoring ? "Restoring..." : copy.restore}
            </button>
          )}
        </div>
      </div>

      <div className="audit-grid">
        <InfoBlock
          label={copy.record}
          value={log.subject_label || copy.unnamedRecord}
          helper={`ID: ${log.subject_id || copy.notAvailable}`}
        />

        <InfoBlock
          label={copy.whoDidIt}
          value={actorName(log) || copy.unknownActor}
          helper={log.user_role || copy.notAvailable}
        />

        <InfoBlock
          label={copy.module}
          value={log.module || copy.notAvailable}
          helper={copy.whatHappened}
        />

        <InfoBlock
          label={copy.ip}
          value={log.ip_address || copy.notAvailable}
          helper={copy.severity}
        />
      </div>

      <div className="restore-status-box">
        <strong>{copy.restoreStatus}</strong>
        <p>{restoreStatusText(log, copy)}</p>
      </div>

      <div className="reason-box">
        <strong>{copy.why}</strong>
        <p>{reason}</p>
      </div>

      <div className="next-step-box">
        <strong>{copy.nextStep}</strong>
        <p>{nextStep(log, copy)}</p>
      </div>
    </article>
  );
}

function InfoBlock({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="info-block">
      <span>{label}</span>
      <strong>{value}</strong>
      {helper && <small>{helper}</small>}
    </div>
  );
}

const pageStyles = `
.delete-history-shell {
  min-height: 100vh;
  background: #F8FAFC;
}

.delete-history-main {
  min-height: 100vh;
  padding: 24px;
  transition: margin-left .2s ease;
}

.delete-history-main * {
  box-sizing: border-box;
}

.history-hero {
  background: linear-gradient(135deg, #064E3B 0%, #0D9488 55%, #5EEAD4 100%);
  color: white;
  border-radius: 28px;
  padding: 30px 32px;
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  gap: 24px;
  box-shadow: 0 18px 50px rgba(6, 95, 70, .16);
  margin-bottom: 18px;
}

.hero-kicker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .08em;
  opacity: .95;
}

.history-hero h1 {
  margin: 12px 0 8px;
  font-size: clamp(30px, 4vw, 44px);
  line-height: 1.05;
  font-weight: 950;
}

.history-hero p {
  max-width: 850px;
  margin: 0;
  line-height: 1.6;
  font-size: 15px;
  color: rgba(255,255,255,.93);
}

.hero-steps {
  margin-top: 18px;
  font-size: 13px;
  font-weight: 900;
  color: rgba(255,255,255,.96);
}

.hero-actions {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex-wrap: wrap;
}

.hero-white-btn {
  border: 0;
  border-radius: 14px;
  padding: 12px 16px;
  background: white;
  color: #0F766E;
  font-weight: 950;
  cursor: pointer;
  display: inline-flex;
  gap: 8px;
  align-items: center;
  white-space: nowrap;
}

.hero-white-btn.danger {
  color: #991B1B;
}

.hero-white-btn:disabled {
  opacity: .6;
  cursor: not-allowed;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(170px, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.metric-card {
  background: white;
  border: 1px solid #E5E7EB;
  border-radius: 20px;
  padding: 18px;
  display: flex;
  gap: 14px;
  align-items: center;
  box-shadow: 0 10px 28px rgba(15, 23, 42, .04);
}

.metric-card.warning {
  background: #FFFBEB;
  border-color: #FDE68A;
}

.metric-card.good {
  background: #ECFDF5;
  border-color: #A7F3D0;
}

.metric-icon {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  color: #0F766E;
  background: #CCFBF1;
  flex-shrink: 0;
}

.metric-card.warning .metric-icon {
  color: #92400E;
  background: #FEF3C7;
}

.metric-card.good .metric-icon {
  color: #065F46;
  background: #D1FAE5;
}

.metric-card strong {
  display: block;
  font-size: 28px;
  color: #111827;
  line-height: 1;
}

.metric-card span {
  display: block;
  margin-top: 5px;
  font-weight: 900;
  color: #475569;
  font-size: 13px;
}

.safety-banner {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  background: #FFFBEB;
  border: 1px solid #FDE68A;
  color: #92400E;
  border-radius: 18px;
  padding: 14px 16px;
  margin-bottom: 18px;
}

.safety-banner strong {
  display: block;
  color: #78350F;
  margin-bottom: 2px;
}

.safety-banner p {
  margin: 0;
  color: #92400E;
  font-size: 13px;
  line-height: 1.45;
}

.success-message,
.error-message {
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 16px;
  padding: 13px 16px;
  font-weight: 900;
  margin-bottom: 18px;
}

.success-message {
  background: #DCFCE7;
  color: #166534;
  border: 1px solid #BBF7D0;
}

.error-message {
  background: #FEE2E2;
  color: #991B1B;
  border: 1px solid #FECACA;
}

.filter-panel {
  background: white;
  border: 1px solid #E5E7EB;
  border-radius: 22px;
  padding: 16px;
  display: grid;
  grid-template-columns: minmax(280px, 1fr) 180px 170px 150px 150px auto auto;
  gap: 10px;
  align-items: end;
  box-shadow: 0 10px 28px rgba(15, 23, 42, .04);
  margin-bottom: 18px;
}

.history-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 18px;
}

.history-tabs button {
  min-height: 38px;
  border: 1px solid #CBD5E1;
  border-radius: 999px;
  background: #FFFFFF;
  color: #334155;
  padding: 0 13px;
  font-weight: 950;
  cursor: pointer;
}

.history-tabs button.active {
  background: #0F766E;
  border-color: #0F766E;
  color: #FFFFFF;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  border-radius: 14px;
  height: 46px;
  padding: 0 13px;
  color: #64748B;
}

.search-box input {
  border: 0;
  outline: none;
  background: transparent;
  height: 100%;
  width: 100%;
  color: #0F172A;
  font-size: 14px;
}

.filter-panel select,
.filter-panel input[type="date"] {
  width: 100%;
  min-height: 46px;
  border: 1px solid #CBD5E1;
  border-radius: 14px;
  background: white;
  padding: 0 12px;
  outline: none;
  color: #0F172A;
  font-size: 14px;
}

.date-filter {
  display: grid;
  gap: 5px;
}

.date-filter span {
  font-size: 11px;
  color: #64748B;
  font-weight: 900;
  text-transform: uppercase;
}

.apply-btn,
.clear-btn {
  min-height: 46px;
  border: 0;
  border-radius: 14px;
  font-weight: 950;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 15px;
  white-space: nowrap;
}

.apply-btn {
  background: #0D9488;
  color: white;
}

.clear-btn {
  background: #F1F5F9;
  color: #334155;
}

.history-board {
  background: white;
  border: 1px solid #E5E7EB;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 10px 28px rgba(15, 23, 42, .04);
}

.board-header {
  padding: 20px 22px;
  border-bottom: 1px solid #E5E7EB;
}

.board-header h2 {
  margin: 0;
  color: #0F172A;
  font-size: 20px;
  font-weight: 950;
}

.board-header p {
  margin: 6px 0 0;
  color: #64748B;
  font-size: 13px;
}

.audit-card-list {
  display: grid;
  gap: 14px;
  padding: 16px;
}

.audit-card {
  border: 1px solid #E2E8F0;
  border-radius: 20px;
  padding: 16px;
  background: #FFFFFF;
}

.audit-card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 14px;
}

.audit-date {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #64748B;
  font-size: 12px;
  font-weight: 800;
}

.audit-card h3 {
  margin: 6px 0 0;
  color: #111827;
  font-size: 18px;
  font-weight: 950;
}

.top-pill-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.severity-pill,
.restore-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 950;
  white-space: nowrap;
}

.restore-btn {
  border: 1px solid #A7F3D0;
  color: #065F46;
  background: #ECFDF5;
  cursor: pointer;
}

.restore-btn:disabled {
  opacity: .6;
  cursor: not-allowed;
}

.audit-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.info-block {
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  border-radius: 16px;
  padding: 12px;
  min-width: 0;
}

.info-block span {
  display: block;
  color: #64748B;
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  margin-bottom: 5px;
}

.info-block strong {
  display: block;
  color: #0F172A;
  font-size: 13px;
  word-break: break-word;
}

.info-block small {
  display: block;
  margin-top: 4px;
  color: #64748B;
  font-size: 12px;
}

.restore-status-box,
.reason-box,
.next-step-box {
  border-radius: 16px;
  padding: 12px;
  margin-top: 10px;
}

.restore-status-box {
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
}

.reason-box {
  background: #FFFBEB;
  border: 1px solid #FDE68A;
}

.next-step-box {
  background: #ECFDF5;
  border: 1px solid #A7F3D0;
}

.restore-status-box strong,
.reason-box strong,
.next-step-box strong {
  display: block;
  color: #0F172A;
  font-size: 13px;
  margin-bottom: 4px;
}

.restore-status-box p,
.reason-box p,
.next-step-box p {
  margin: 0;
  color: #475569;
  font-size: 13px;
  line-height: 1.45;
}

.empty-state {
  margin: 18px;
  padding: 34px;
  border: 1px dashed #CBD5E1;
  border-radius: 20px;
  color: #64748B;
  display: grid;
  place-items: center;
  gap: 8px;
  text-align: center;
}

.empty-state strong {
  color: #0F172A;
  font-size: 18px;
}

.empty-state span {
  color: #64748B;
  font-size: 13px;
}

@media (max-width: 1350px) {
  .metric-grid {
    grid-template-columns: repeat(3, minmax(170px, 1fr));
  }

  .filter-panel {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .search-box {
    grid-column: 1 / -1;
  }

  .audit-grid {
    grid-template-columns: repeat(2, minmax(150px, 1fr));
  }
}

@media (max-width: 900px) {
  .delete-history-main {
    padding: 16px;
  }

  .history-hero {
    flex-direction: column;
  }

  .hero-actions,
  .hero-actions button {
    width: 100%;
  }

  .metric-grid {
    grid-template-columns: repeat(2, minmax(170px, 1fr));
  }
}

@media (max-width: 720px) {
  .history-hero {
    padding: 24px;
    border-radius: 22px;
  }

  .metric-grid,
  .filter-panel,
  .audit-grid {
    grid-template-columns: 1fr;
  }

  .audit-card-top {
    flex-direction: column;
  }

  .top-pill-row {
    justify-content: flex-start;
  }
}
`;
