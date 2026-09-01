// src/pages/Followups.tsx
//
// Health Follow-up board — lists follow-up reminders with summary
// cards, status tabs, search + date filters, pagination and per-row actions.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Copy,
  FileText,
  PhoneCall,
  RefreshCw,
  Search,
  Send,
  XCircle,
} from "lucide-react";

import {
  classifyFollowUp,
  getFollowUpList,
  getFollowUpStatusMeta,
  getFollowUpSummary,
  getFollowUpSmsLabel,
  resendFollowUpSms,
  updateFollowUpStatus,
  type FollowUpBoardStatus,
  type FollowUpReminder,
  type FollowUpSummary,
} from "../services/followups";

const STATUS_TABS: { key: FollowUpBoardStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Due Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "missed", label: "Missed" },
];

function safe(value: unknown): string {
  return String(value ?? "").trim();
}

function patientName(item: FollowUpReminder): string {
  return (
    safe(item.patient_name) ||
    safe(item.user?.full_name) ||
    safe(item.user?.name) ||
    [item.user?.first_name, item.user?.last_name].filter(Boolean).join(" ").trim() ||
    `Patient #${item.user_id ?? item.id}`
  );
}

function barangayLabel(item: FollowUpReminder): string {
  return (
    safe(item.rhu?.name) ||
    safe(item.rhu?.barangay_name) ||
    (item.rhu_id ? `RHU ${item.rhu_id}` : "—")
  );
}

function diagnosisLabel(item: FollowUpReminder): string {
  return (
    safe(item.reason) ||
    safe((item as any).consultation?.diagnosis) ||
    safe((item as any).consultation?.chief_complaint) ||
    safe(item.instructions) ||
    "No reason recorded"
  );
}

function staffLabel(item: FollowUpReminder): string {
  const c = (item as any).createdBy || (item as any).created_by_user;
  return (
    safe(c?.full_name) ||
    [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim() ||
    (item.created_by ? `Staff #${item.created_by}` : "—")
  );
}

function followUpDateTime(item: FollowUpReminder): string {
  const raw =
    item.follow_up_at ||
    item.follow_up_date ||
    item.follow_up_start_date ||
    "";

  if (!raw) return "No schedule";

  const date = new Date(
    item.follow_up_at
      ? raw
      : `${raw}T${item.follow_up_time || "09:00"}`
  );

  if (Number.isNaN(date.getTime())) return safe(raw);

  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(value: string, max = 70): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export default function Followups() {
  const navigate = useNavigate();

  const [items, setItems] = useState<FollowUpReminder[]>([]);
  const [summary, setSummary] = useState<FollowUpSummary>({
    total: 0,
    overdue: 0,
    due_today: 0,
    upcoming: 0,
    completed_this_month: 0,
    missed: 0,
  });

  const [status, setStatus] = useState<FollowUpBoardStatus>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [list, sum] = await Promise.all([
        getFollowUpList({ status, search, date_from: dateFrom, date_to: dateTo, page, per_page: 20 }),
        getFollowUpSummary(),
      ]);

      setItems(list.data);
      setLastPage(list.last_page);
      setTotal(list.total);
      setSummary(sum);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Could not load follow-ups. Please check the backend connection."
      );
    } finally {
      setLoading(false);
    }
  }, [status, search, dateFrom, dateTo, page]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Reset to page 1 whenever a filter changes.
  useEffect(() => {
    setPage(1);
  }, [status, search, dateFrom, dateTo]);

  function flash(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 3500);
  }

  async function runAction(
    item: FollowUpReminder,
    action: () => Promise<any>,
    okMessage: string
  ) {
    setActionId(item.id);
    setError("");

    try {
      await action();
      flash(okMessage);
      await load();
    } catch (err: any) {
      setError(
        err?.response?.data?.message || err?.message || "Action failed. Please try again."
      );
    } finally {
      setActionId(null);
    }
  }

  function openConsultation(item: FollowUpReminder) {
    if (item.consultation_id) {
      navigate(`/consultations/${item.consultation_id}`);
    } else {
      navigate("/consultations");
    }
  }

  async function copyNumber(item: FollowUpReminder) {
    const number = safe(item.mobile_number);
    if (!number) {
      flash("No mobile number on file.");
      return;
    }
    try {
      await navigator.clipboard.writeText(number);
      flash(`Copied ${number}`);
    } catch {
      flash(number);
    }
  }

  const summaryCards = useMemo(
    () => [
      { label: "Total follow-ups", value: summary.total, tone: "neutral" as const },
      { label: "Overdue", value: summary.overdue, tone: "danger" as const },
      { label: "Due today", value: summary.due_today, tone: "warning" as const },
      { label: "Upcoming", value: summary.upcoming, tone: "info" as const },
      { label: "Completed this month", value: summary.completed_this_month, tone: "success" as const },
      { label: "Missed / not contacted", value: summary.missed, tone: "danger" as const },
    ],
    [summary]
  );

  return (
    <div className="no-page-overflow" style={pageStyle}>
      <section style={heroStyle}>
        <div style={{ minWidth: 0 }}>
          <div style={eyebrowStyle}>Ka-Agapay RHU Follow-ups</div>
          <h1 style={heroTitleStyle}>Health Follow-up</h1>
          <p style={heroSubtitleStyle}>
            Track overdue, due today, upcoming, and completed patient follow-ups.
          </p>
        </div>

        <button type="button" onClick={load} disabled={loading} style={refreshButtonStyle}>
          <RefreshCw size={18} />
          {loading ? "Loading..." : "Refresh"}
        </button>
      </section>

      {message ? (
        <div style={successBannerStyle}>
          <CheckCircle2 size={18} />
          {message}
        </div>
      ) : null}

      {error ? (
        <div style={errorBannerStyle}>
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : null}

      <section style={summaryGridStyle}>
        {summaryCards.map((card) => (
          <div key={card.label} style={{ ...summaryCardStyle, ...summaryToneStyle(card.tone) }}>
            <strong style={summaryValueStyle}>{card.value}</strong>
            <span style={summaryLabelStyle}>{card.label}</span>
          </div>
        ))}
      </section>

      <div className="status-tabs" style={tabsWrapStyle}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`status-tab${status === tab.key ? " active" : ""}`}
            onClick={() => setStatus(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section style={toolbarStyle}>
        <div style={searchBoxStyle}>
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search patient, mobile, barangay, reason..."
            style={searchInputStyle}
          />
        </div>

        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>From</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
        </label>

        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>To</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
        </label>

        {(dateFrom || dateTo || search) && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setDateFrom("");
              setDateTo("");
            }}
            style={clearButtonStyle}
          >
            Clear
          </button>
        )}
      </section>

      <section style={boardCardStyle} className="board-card">
        <div className="responsive-table" style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Patient</th>
                <th style={thStyle}>Mobile</th>
                <th style={thStyle}>Barangay / RHU</th>
                <th style={thStyle}>Follow-up</th>
                <th style={thStyle}>Reason / Diagnosis</th>
                <th style={thStyle}>Consultation</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Staff</th>
                <th style={thStyle}>SMS</th>
                <th style={thRightStyle}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td style={emptyCellStyle} colSpan={10}>
                    Loading follow-ups...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td style={emptyCellStyle} colSpan={10}>
                    No follow-ups match the current filters.
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const meta = getFollowUpStatusMeta(classifyFollowUp(item));
                  const busy = actionId === item.id;
                  const closed = ["completed", "cancelled"].includes(
                    String(item.status || "").toLowerCase()
                  );
                  const reason = diagnosisLabel(item);

                  return (
                    <tr key={item.id} style={trStyle}>
                      <td style={tdStyle}>
                        <div style={cellPrimaryStyle}>{patientName(item)}</div>
                        <div style={cellMutedStyle}>#{item.id}</div>
                      </td>

                      <td style={tdStyle}>{safe(item.mobile_number) || "—"}</td>

                      <td style={tdStyle}>{barangayLabel(item)}</td>

                      <td style={tdStyle}>
                        <div style={cellPrimaryStyle}>{followUpDateTime(item)}</div>
                        {item.urgency ? (
                          <div style={cellMutedStyle}>{safe(item.urgency)}</div>
                        ) : null}
                      </td>

                      <td style={tdStyle}>
                        <span title={reason}>{truncate(reason)}</span>
                      </td>

                      <td style={tdStyle}>
                        {item.consultation_id ? (
                          <button
                            type="button"
                            onClick={() => openConsultation(item)}
                            style={linkButtonStyle}
                          >
                            #{item.consultation_id}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>

                      <td style={tdStyle}>
                        <span
                          style={{
                            ...badgeStyle,
                            background: meta.bg,
                            color: meta.color,
                            borderColor: meta.border,
                          }}
                        >
                          {meta.label}
                        </span>
                      </td>

                      <td style={tdStyle}>{staffLabel(item)}</td>

                      <td style={tdStyle}>{getFollowUpSmsLabel(item)}</td>

                      <td style={tdRightStyle}>
                        <div className="responsive-actions" style={actionsStyle}>
                          {item.consultation_id ? (
                            <button
                              type="button"
                              onClick={() => openConsultation(item)}
                              style={smallNeutralStyle}
                              title="Open the linked consultation / SOAP"
                            >
                              <FileText size={14} />
                              Consultation
                            </button>
                          ) : null}

                          {!closed ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                runAction(
                                  item,
                                  () => updateFollowUpStatus(item.id, "completed"),
                                  "Follow-up marked completed."
                                )
                              }
                              style={smallSuccessStyle}
                            >
                              <CheckCircle2 size={14} />
                              Complete
                            </button>
                          ) : null}

                          {!closed && item.consultation_id ? (
                            <button
                              type="button"
                              onClick={() => openConsultation(item)}
                              style={smallNeutralStyle}
                              title="Reschedule from the consultation follow-up editor"
                            >
                              <CalendarClock size={14} />
                              Reschedule
                            </button>
                          ) : null}

                          {safe(item.mobile_number) ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  runAction(
                                    item,
                                    () => resendFollowUpSms(item.id),
                                    "SMS reminder sent."
                                  )
                                }
                                style={smallNeutralStyle}
                              >
                                <Send size={14} />
                                SMS
                              </button>

                              <button
                                type="button"
                                onClick={() => copyNumber(item)}
                                style={smallNeutralStyle}
                                title="Copy mobile number"
                              >
                                <PhoneCall size={14} />
                                Copy
                              </button>
                            </>
                          ) : null}

                          {!closed ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                runAction(
                                  item,
                                  () => updateFollowUpStatus(item.id, "cancelled"),
                                  "Follow-up cancelled."
                                )
                              }
                              style={smallDangerStyle}
                            >
                              <XCircle size={14} />
                              Cancel
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div style={paginationStyle}>
          <span style={cellMutedStyle}>
            {total} follow-up{total === 1 ? "" : "s"} · Page {page} of {lastPage}
          </span>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={pageButtonStyle}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= lastPage || loading}
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              style={pageButtonStyle}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function summaryToneStyle(tone: "neutral" | "danger" | "warning" | "info" | "success"): CSSProperties {
  switch (tone) {
    case "danger":
      return { background: "#FEF2F2", borderColor: "#FECACA", color: "#B91C1C" };
    case "warning":
      return { background: "#FFF7ED", borderColor: "#FED7AA", color: "#C2410C" };
    case "info":
      return { background: "#EFF6FF", borderColor: "#BFDBFE", color: "#1D4ED8" };
    case "success":
      return { background: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" };
    default:
      return { background: "#FFFFFF", borderColor: "#E2E8F0", color: "#0F172A" };
  }
}

const pageStyle: CSSProperties = {
  display: "grid",
  gap: 18,
  padding: "24px 28px 48px",
  background: "#F8FAFC",
  minHeight: "100vh",
  minWidth: 0,
  maxWidth: "100%",
  overflowX: "hidden",
  color: "#0F172A",
};

const heroStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 16,
  alignItems: "center",
  justifyContent: "space-between",
  borderRadius: 24,
  padding: 28,
  background: "linear-gradient(135deg, #047857 0%, #14B8A6 100%)",
  color: "#FFFFFF",
  boxShadow: "0 18px 45px rgba(15, 118, 110, 0.22)",
};

const eyebrowStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.92,
};

const heroTitleStyle: CSSProperties = {
  margin: "8px 0 6px",
  fontSize: "clamp(26px, 3.4vw, 34px)",
  lineHeight: 1.05,
  fontWeight: 950,
};

const heroSubtitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 700,
  opacity: 0.95,
  maxWidth: 620,
};

const refreshButtonStyle: CSSProperties = {
  height: 46,
  border: "none",
  borderRadius: 14,
  background: "rgba(255,255,255,0.18)",
  color: "#FFFFFF",
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  padding: "0 18px",
  fontWeight: 900,
  cursor: "pointer",
};

const successBannerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 16px",
  borderRadius: 14,
  background: "#ECFDF5",
  border: "1px solid #A7F3D0",
  color: "#047857",
  fontWeight: 800,
};

const errorBannerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 16px",
  borderRadius: 14,
  background: "#FEF2F2",
  border: "1px solid #FECACA",
  color: "#B91C1C",
  fontWeight: 800,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
  gap: 12,
};

const summaryCardStyle: CSSProperties = {
  border: "1px solid #E2E8F0",
  borderRadius: 16,
  padding: 16,
  display: "grid",
  gap: 4,
  minWidth: 0,
};

const summaryValueStyle: CSSProperties = {
  fontSize: 30,
  lineHeight: 1,
  fontWeight: 950,
};

const summaryLabelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  opacity: 0.85,
};

const tabsWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const toolbarStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
  gap: 12,
  alignItems: "end",
  padding: 16,
  borderRadius: 18,
  border: "1px solid #E2E8F0",
  background: "#FFFFFF",
};

const searchBoxStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  padding: "0 14px",
  height: 46,
  borderRadius: 12,
  border: "1px solid #CBD5E1",
  background: "#F8FAFC",
  gridColumn: "1 / -1",
};

const searchInputStyle: CSSProperties = {
  width: "100%",
  border: "none",
  outline: "none",
  background: "transparent",
  color: "#0F172A",
  fontWeight: 700,
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#64748B",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const inputStyle: CSSProperties = {
  height: 44,
  borderRadius: 12,
  border: "1px solid #CBD5E1",
  padding: "0 12px",
  fontWeight: 800,
  color: "#0F172A",
  background: "#FFFFFF",
};

const clearButtonStyle: CSSProperties = {
  height: 44,
  alignSelf: "end",
  border: "1px solid #CBD5E1",
  borderRadius: 12,
  background: "#FFFFFF",
  color: "#0F172A",
  fontWeight: 900,
  cursor: "pointer",
  padding: "0 16px",
};

const boardCardStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 18,
  borderRadius: 20,
  border: "1px solid #E2E8F0",
  background: "#FFFFFF",
  boxShadow: "0 16px 32px rgba(15, 23, 42, 0.05)",
};

const tableWrapStyle: CSSProperties = {
  width: "100%",
  overflowX: "auto",
  borderRadius: 14,
  border: "1px solid #E2E8F0",
};

const tableStyle: CSSProperties = {
  width: "100%",
  minWidth: 1180,
  borderCollapse: "collapse",
  background: "#FFFFFF",
};

const thStyle: CSSProperties = {
  padding: "13px 14px",
  background: "#F8FAFC",
  color: "#334155",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  fontWeight: 900,
  textAlign: "left",
  borderBottom: "1px solid #E2E8F0",
  whiteSpace: "nowrap",
};

const thRightStyle: CSSProperties = {
  ...thStyle,
  textAlign: "right",
};

const trStyle: CSSProperties = {
  borderBottom: "1px solid #EEF2F7",
};

const tdStyle: CSSProperties = {
  padding: "14px",
  verticalAlign: "top",
  color: "#0F172A",
  fontSize: 13.5,
  fontWeight: 700,
};

const tdRightStyle: CSSProperties = {
  ...tdStyle,
  textAlign: "right",
};

const emptyCellStyle: CSSProperties = {
  padding: "40px 16px",
  textAlign: "center",
  color: "#64748B",
  fontWeight: 800,
};

const cellPrimaryStyle: CSSProperties = {
  fontWeight: 950,
  color: "#0F172A",
};

const cellMutedStyle: CSSProperties = {
  display: "block",
  marginTop: 4,
  color: "#64748B",
  fontSize: 12,
  fontWeight: 700,
};

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const linkButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#0F766E",
  fontWeight: 900,
  cursor: "pointer",
  padding: 0,
};

const actionsStyle: CSSProperties = {
  justifyContent: "flex-end",
};

const smallButtonBase: CSSProperties = {
  minHeight: 32,
  border: "1px solid transparent",
  borderRadius: 10,
  padding: "6px 10px",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const smallNeutralStyle: CSSProperties = {
  ...smallButtonBase,
  background: "#F1F5F9",
  color: "#0F172A",
};

const smallSuccessStyle: CSSProperties = {
  ...smallButtonBase,
  background: "#DCFCE7",
  color: "#166534",
};

const smallDangerStyle: CSSProperties = {
  ...smallButtonBase,
  background: "#FEE2E2",
  color: "#B91C1C",
};

const paginationStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 12,
};

const pageButtonStyle: CSSProperties = {
  border: "1px solid #CBD5E1",
  borderRadius: 10,
  background: "#FFFFFF",
  color: "#0F172A",
  fontWeight: 900,
  padding: "8px 14px",
  cursor: "pointer",
};
