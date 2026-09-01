// src/pages/PatientProfile.tsx
// Per-patient health profile: identity + health summary + full completed-
// consultation history with the SAME ITR/SOAP fields the Reports module uses
// (data comes from DiagnosisItrReportService via /patients/{userId}/profile).
// RHU isolation and archive-not-delete are enforced server-side.

import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  User,
  CalendarDays,
  Stethoscope,
  Activity,
  ClipboardList,
  Eye,
  X,
} from "lucide-react";
import { color, radius } from "../theme/tokens";
import { usePagination } from "../hooks/usePagination";
import TablePagination from "../components/ui/TablePagination";
import { emitToast } from "../lib/toastBus";
import {
  getPatientProfile,
  type PatientProfile as PatientProfileData,
  type ItrConsultation,
} from "../services/patientProfile";

function fmtDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function val(v: any): string {
  const s = String(v ?? "").trim();
  return s === "" ? "—" : s;
}

export default function PatientProfile() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<PatientProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ItrConsultation | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const profile = await getPatientProfile(userId ?? "");
        if (active) setData(profile);
      } catch (err: any) {
        const msg =
          err?.response?.status === 403
            ? "This patient is not in your RHU."
            : err?.response?.data?.message || "Could not load patient profile.";
        if (active) {
          setError(msg);
          emitToast(msg, "error");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const consultations = data?.consultations ?? [];
  const pager = usePagination(consultations, { pageSize: 20, resetDeps: [userId] });

  const summary = data?.summary;
  const patient = data?.patient;

  const summaryCards = useMemo(
    () => [
      {
        label: "Total Visits",
        value: summary?.total_visits ?? 0,
        icon: <Stethoscope size={20} />,
        tint: "#0D9488",
      },
      {
        label: "Last Visit",
        value: fmtDate(summary?.last_visit),
        icon: <CalendarDays size={20} />,
        tint: "#2563EB",
      },
      {
        label: "Most Recent Diagnosis",
        value: val(summary?.recent_diagnosis),
        icon: <Activity size={20} />,
        tint: "#A855F7",
      },
      {
        label: "Follow-ups Needed",
        value: summary?.follow_ups ?? 0,
        icon: <ClipboardList size={20} />,
        tint: "#F59E0B",
      },
    ],
    [summary]
  );

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <button type="button" onClick={() => navigate(-1)} style={backBtnStyle}>
        <ArrowLeft size={16} /> Back
      </button>

      {loading ? (
        <div style={cardStyle}>Loading patient profile…</div>
      ) : error ? (
        <div style={{ ...cardStyle, color: "#B91C1C" }}>{error}</div>
      ) : patient ? (
        <>
          {/* IDENTITY HEADER */}
          <div style={{ ...cardStyle, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div style={avatarStyle}>
              <User size={26} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#0F172A" }}>
                {patient.name}
              </h1>
              <p style={{ margin: "4px 0 0", fontSize: 13.5, color: color.textMuted }}>
                {[
                  patient.age ? `${patient.age} yrs` : null,
                  patient.sex,
                  patient.barangay,
                  patient.rhu_id ? `RHU ${patient.rhu_id}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 12.5, color: color.textMuted }}>
                {[
                  patient.mobile_number ? `📱 ${patient.mobile_number}` : null,
                  patient.philhealth_id ? `PhilHealth: ${patient.philhealth_id}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>

          {/* SUMMARY CARDS */}
          <div style={summaryGridStyle}>
            {summaryCards.map((c) => (
              <div key={c.label} style={cardStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ ...iconChipStyle, color: c.tint, background: `${c.tint}14` }}>
                    {c.icon}
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: color.textMuted }}>
                    {c.label}
                  </span>
                </div>
                <div style={{ marginTop: 8, fontSize: 20, fontWeight: 900, color: "#0F172A" }}>
                  {c.value}
                </div>
              </div>
            ))}
          </div>

          {/* CONSULTATION HISTORY (ITR fields) */}
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${color.line}` }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#0F172A" }}>
                Consultation History (ITR / SOAP)
              </h2>
              <p style={{ margin: "3px 0 0", fontSize: 12.5, color: color.textMuted }}>
                Completed consultation records, most recent first.
              </p>
            </div>

            {consultations.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: color.textMuted }}>
                No completed consultation records for this patient.
              </div>
            ) : (
              <div className="table-wrapper" style={{ border: 0 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Chief Complaint</th>
                      <th>Diagnosis</th>
                      <th>Treatment / Plan</th>
                      <th>Follow-up</th>
                      <th>Attending</th>
                      <th style={{ textAlign: "right", whiteSpace: "nowrap" }}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pager.pageRows.map((c) => (
                      <tr key={c.consultation_id}>
                        <td>{fmtDate(c.consultation_date || c.completed_at)}</td>
                        <td title={c.chief_complaint ?? ""}>{val(c.chief_complaint)}</td>
                        <td title={c.diagnosis ?? ""}>{val(c.diagnosis)}</td>
                        <td title={c.treatment || c.plan || ""}>{val(c.treatment || c.plan)}</td>
                        <td>
                          {c.follow_up_needed ? (
                            <span style={followPillStyle}>
                              {c.follow_up_date_time ? fmtDate(c.follow_up_date_time) : "Yes"}
                            </span>
                          ) : (
                            <span style={{ color: color.textMuted }}>—</span>
                          )}
                        </td>
                        <td>{val(c.attending_staff)}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <button
                            type="button"
                            onClick={() => setSelected(c)}
                            style={viewDetailsBtnStyle}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "#0F766E";
                              e.currentTarget.style.color = "#FFFFFF";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "#F0FDFA";
                              e.currentTarget.style.color = "#0F766E";
                            }}
                          >
                            <Eye size={14} />
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {consultations.length > 0 ? (
              <div style={{ padding: "10px 16px" }}>
                <TablePagination
                  page={pager.page}
                  pageCount={pager.pageCount}
                  total={pager.total}
                  from={pager.from}
                  to={pager.to}
                  pageSize={pager.pageSize}
                  onPage={pager.setPage}
                  onPageSize={pager.setPageSize}
                />
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {/* CONSULTATION DETAIL MODAL */}
      {selected ? (
        <div style={overlayStyle} onClick={() => setSelected(null)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900 }}>
                Consultation · {fmtDate(selected.consultation_date || selected.completed_at)}
              </h3>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close"
                style={{
                  border: "none",
                  background: "#F1F5F9",
                  color: "#475569",
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                }}
              >
                <X size={16} />
              </button>
            </div>

            {[
              ["Chief Complaint", selected.chief_complaint],
              ["Subjective", selected.subjective],
              ["Objective", selected.objective],
              ["Assessment", selected.assessment],
              ["Diagnosis", selected.diagnosis],
              ["Plan", selected.plan],
              ["Treatment", selected.treatment],
              ["Notes", selected.notes],
              [
                "Follow-up",
                selected.follow_up_needed
                  ? `${selected.follow_up_date_time ? fmtDate(selected.follow_up_date_time) + " · " : ""}${
                      selected.follow_up_instructions || selected.follow_up_status || "Needed"
                    }`
                  : "Not needed",
              ],
              ["Attending Staff", selected.attending_staff],
            ]
              .filter(([, v]) => String(v ?? "").trim() !== "" && String(v ?? "").trim() !== "—")
              .map(([label, v]) => (
                <div key={label as string} style={{ marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 900, color: color.textMuted, textTransform: "uppercase" }}>
                    {label}
                  </span>
                  <p style={detailTextStyle}>{val(v)}</p>
                </div>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: color.surface,
  border: `1px solid ${color.line}`,
  borderRadius: radius.lg ?? 16,
  padding: 18,
  marginBottom: 16,
};

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
  gap: 14,
  marginBottom: 16,
};

const avatarStyle: React.CSSProperties = {
  width: 60,
  height: 60,
  borderRadius: 999,
  background: color.brandDark,
  color: "#fff",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
};

const iconChipStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 10,
  display: "grid",
  placeItems: "center",
};

const backBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  marginBottom: 14,
  padding: "8px 12px",
  border: `1px solid ${color.line}`,
  borderRadius: radius.md,
  background: color.surface,
  color: color.slateFg,
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
};

// Compact, clearly-tappable "View" pill for the history table — never wraps.
const viewDetailsBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  whiteSpace: "nowrap",
  padding: "6px 14px",
  borderRadius: 999,
  border: "1px solid #99F6E4",
  background: "#F0FDFA",
  color: "#0F766E",
  fontSize: 12.5,
  fontWeight: 800,
  cursor: "pointer",
  transition: "background 0.15s ease, color 0.15s ease",
};

const followPillStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 999,
  background: "#FEF3C7",
  color: "#92400E",
  fontSize: 11.5,
  fontWeight: 800,
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,.5)",
  display: "grid",
  placeItems: "center",
  padding: 16,
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  width: "min(560px, 100%)",
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
  background: "#fff",
  borderRadius: 16,
  padding: 20,
  boxShadow: "0 24px 60px rgba(15,23,42,.28)",
};

const detailTextStyle: React.CSSProperties = {
  margin: "5px 0 0",
  padding: "9px 12px",
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  borderRadius: 10,
  fontSize: 13.5,
  lineHeight: 1.6,
  color: "#0F172A",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
