// src/pages/Consultations.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { usePagination } from "../hooks/usePagination";
import TablePagination from "../components/ui/TablePagination";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Archive,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  RefreshCw,
  Search,
  Stethoscope,
  UserCheck,
  Users,
} from "lucide-react";

import {
  buildConsultationStats,
  consultationNeedsSoap,
  formatConsultationDate,
  getChiefComplaint,
  getConsultationMapping,
  getConsultationDate,
  getConsultationNextStep,
  getConsultationStatusLabel,
  getDiagnosisText,
  getDoctorName,
  getFollowupStatus,
  getPatientAgeSex,
  getPatientBarangay,
  getPatientMobile,
  getPatientName,
  type Consultation,
} from "../services/consultations";
import { getConsultations } from "../services/consultations";
import { useAuthStore } from "../store/authStore";
import { isGlobalRhuRole } from "../lib/rhu";

type RhuFilter = "all" | 1 | 2;
import StatusBadge from "../components/ui/StatusBadge";

function truncate(value: string, max = 48): string {
  const text = String(value ?? "").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

type StatusFilter = "all" | "open" | "ongoing" | "completed" | "cancelled";

function statusTone(status?: string | null): CSSProperties {
  switch (status) {
    case "completed":
      return { background: "#DCFCE7", color: "#166534" };
    case "cancelled":
      return { background: "#FEE2E2", color: "#B91C1C" };
    case "ongoing":
      return { background: "#DBEAFE", color: "#1D4ED8" };
    case "open":
    default:
      return { background: "#FEF3C7", color: "#92400E" };
  }
}

function soapTone(item: Consultation): CSSProperties {
  if (item.status === "completed") {
    return { background: "#DCFCE7", color: "#166534" };
  }

  if (consultationNeedsSoap(item)) {
    return { background: "#FEE2E2", color: "#B91C1C" };
  }

  return { background: "#ECFDF5", color: "#047857" };
}

function soapLabel(item: Consultation): string {
  if (item.status === "completed") return "SOAP Complete";
  if (consultationNeedsSoap(item)) return "Needs SOAP";
  return "Ready to Complete";
}

export default function Consultations() {
  const authUser = useAuthStore((state) => state.user);
  // Only global-scope roles (super_admin / MHO) can switch RHU; facility-scoped
  // staff are locked to their own RHU server-side regardless of this control.
  const canFilterRhu = isGlobalRhuRole(authUser);

  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [rhuFilter, setRhuFilter] = useState<RhuFilter>("all");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getConsultations({
        search,
        status,
        rhu_id: rhuFilter === "all" ? undefined : rhuFilter,
        per_page: 100,
      });

      setConsultations(data);
      setLastUpdated(new Date().toISOString());
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Could not load consultations. Please check the backend connection."
      );
    } finally {
      setLoading(false);
    }
  }, [search, status, rhuFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      load();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return consultations.filter((item) => {
      const matchesStatus = status === "all" || item.status === status;

      if (!matchesStatus) return false;

      if (!q) return true;

      const searchable = [
        getPatientName(item),
        getPatientMobile(item),
        getDoctorName(item),
        getChiefComplaint(item),
        getDiagnosisText(item),
        item.subjective,
        item.objective,
        item.assessment,
        item.plan,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(q);
    });
  }, [consultations, search, status]);

  // Part 8 — paginate the already-filtered consultation records.
  const pg = usePagination(filtered, { resetDeps: [filtered] });

  const stats = useMemo(() => buildConsultationStats(filtered), [filtered]);

  const nextConsultation = useMemo(() => {
    return (
      filtered.find(
        (item) =>
          item.status !== "completed" &&
          item.status !== "cancelled" &&
          consultationNeedsSoap(item)
      ) ??
      filtered.find(
        (item) => item.status !== "completed" && item.status !== "cancelled"
      ) ??
      null
    );
  }, [filtered]);

  return (
    <div style={pageStyle}>
      <section style={heroStyle}>
        <div>
          <div style={eyebrowStyle}>Ka-Agapay RHU Consultation Records</div>
          <h1 style={heroTitleStyle}>Consultation Management</h1>
          <p style={heroSubtitleStyle}>
            Review active consultation records, open SOAP documentation, check
            diagnosis status, and make sure every consultation is properly
            documented before completion.
          </p>

          <div style={heroMetaStyle}>
            <span>Total shown: {filtered.length}</span>
            <span>
              Last updated:{" "}
              {lastUpdated
                ? new Date(lastUpdated).toLocaleTimeString("en-PH", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"}
            </span>
          </div>
        </div>

        <div style={nextCardStyle}>
          <div style={eyebrowStyle}>Next Action</div>

          {nextConsultation ? (
            <>
              <strong style={nextNameStyle}>
                {getPatientName(nextConsultation)}
              </strong>
              <span style={mutedWhiteStyle}>
                {formatConsultationDate(getConsultationDate(nextConsultation))} ·{" "}
                {getConsultationStatusLabel(nextConsultation.status)}
              </span>
              <span style={nextStepPillStyle}>
                {getConsultationNextStep(nextConsultation)}
              </span>
            </>
          ) : (
            <>
              <strong style={nextNameStyle}>No active consultation</strong>
              <span style={mutedWhiteStyle}>
                New records from appointments will appear here.
              </span>
            </>
          )}
        </div>
      </section>

      <section style={instructionGridStyle}>
        <InstructionCard
          number="1"
          title="Open Record"
          body="Choose a patient card and open SOAP."
        />
        <InstructionCard
          number="2"
          title="Document Properly"
          body="Fill subjective, objective, assessment, and plan."
        />
        <InstructionCard
          number="3"
          title="Review Before Complete"
          body="Complete only after assessment and treatment plan are ready."
        />
      </section>

      <section style={statsGridStyle}>
        <StatCard
          icon={<ClipboardList size={24} />}
          label="Total"
          value={stats.total}
          hint="Consultation records shown"
          tone="teal"
        />
        <StatCard
          icon={<FileText size={24} />}
          label="Open / Ongoing"
          value={stats.open + stats.ongoing}
          hint="Needs staff action"
          tone="yellow"
        />
        <StatCard
          icon={<AlertTriangle size={24} />}
          label="Needs SOAP"
          value={stats.needsSoap}
          hint="Missing assessment or plan"
          tone="red"
        />
        <StatCard
          icon={<CheckCircle2 size={24} />}
          label="Completed"
          value={stats.completed}
          hint="Finished records"
          tone="green"
        />
      </section>

      <section style={guideStyle}>
        <div style={guideHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>Status Guide</h2>
            <p style={mutedTextStyle}>
              Each record separates source, queue state, consultation stage,
              SOAP, and after-care so one badge does not carry several meanings.
            </p>
          </div>
          <Archive size={22} />
        </div>

        <div style={guideGridStyle}>
          <GuideCard
            label="Appointment"
            body="Booking or request schedule."
          />
          <GuideCard
            label="Queue"
            body="Patient waiting, called, in service, served, no-show, or cancelled."
          />
          <GuideCard
            label="Consultation"
            body="Clinical encounter stage, from not started to completed."
          />
          <GuideCard
            label="SOAP"
            body="Medical documentation status: none, draft, needs review, or finalized."
          />
          <GuideCard
            label="After-care"
            body="Prescription, lab request, follow-up, or referral work."
          />
          <GuideCard
            label="History"
            body="Past or finalized records are kept for viewing, not active work."
          />
        </div>
      </section>

      {error ? (
        <section style={errorStyle}>
          <AlertTriangle size={22} />
          <div>
            <strong>Action needed</strong>
            <p>{error}</p>
          </div>
        </section>
      ) : null}

      <section style={toolbarStyle}>
        <div style={searchBoxStyle}>
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search patient, complaint, diagnosis, staff..."
            style={searchInputStyle}
          />
        </div>

        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
          style={selectStyle}
        >
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="ongoing">Ongoing</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        {canFilterRhu ? (
          <select
            value={String(rhuFilter)}
            onChange={(event) =>
              setRhuFilter(
                event.target.value === "all"
                  ? "all"
                  : (Number(event.target.value) as 1 | 2)
              )
            }
            style={selectStyle}
          >
            <option value="all">All RHUs</option>
            <option value="1">RHU 1</option>
            <option value="2">RHU 2</option>
          </select>
        ) : null}

        <button
          type="button"
          onClick={load}
          disabled={loading}
          style={refreshButtonStyle}
        >
          <RefreshCw size={18} />
          {loading ? "Loading..." : "Refresh"}
        </button>
      </section>

      <section style={boardStyle}>
        <div style={boardHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>Consultation Records</h2>
            <p style={mutedTextStyle}>
              Patient details, source, queue state, consultation stage, SOAP,
              after-care, and next step are separated to avoid mixed meanings.
            </p>
          </div>

          <Stethoscope size={24} />
        </div>

        {loading ? (
          <div style={emptyStyle}>
            <RefreshCw size={28} />
            <strong>Loading consultations...</strong>
            <span>Please wait.</span>
          </div>
        ) : pg.total === 0 ? (
          <div style={emptyStyle}>
            <UserCheck size={28} />
            {search.trim() ? (
              <>
                <strong>No consultations match your search.</strong>
                <span>Try a different name, barangay, or clear the search.</span>
              </>
            ) : rhuFilter === 2 ? (
              <>
                <strong>No RHU 2 consultations found yet.</strong>
                <span>RHU 2 consultations will appear here once recorded.</span>
              </>
            ) : rhuFilter === 1 ? (
              <>
                <strong>No RHU 1 consultations found yet.</strong>
                <span>RHU 1 consultations will appear here once recorded.</span>
              </>
            ) : (
              <>
                <strong>No recent consultation records yet.</strong>
                <span>
                  Records appear here after a patient is attended from the queue or
                  an appointment is started.
                </span>
              </>
            )}
          </div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Patient</th>
                  <th style={thStyle}>Visit</th>
                  <th style={thStyle}>Clinical</th>
                  <th style={thStyle}>Progress</th>
                  <th style={thStyle}>Next Step</th>
                  <th style={thRightStyle}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {pg.pageRows.map((item) => {
                  const mapping = getConsultationMapping(item);
                  const diagnosis = getDiagnosisText(item);
                  const hasDiagnosis = diagnosis !== "No diagnosis yet";
                  const complaint = getChiefComplaint(item);
                  const lifecycle = mapping.lifecycle;
                  const isHistory = lifecycle.isHistory || item.status === "completed";
                  const nextStep = getConsultationNextStep(item);
                  const actionLabel = isHistory
                    ? "View History"
                    : mapping.stage.key === "ready_to_complete"
                    ? "Complete Consultation"
                    : mapping.soap.key === "no_soap"
                    ? "Open SOAP"
                    : "Continue SOAP";

                  return (
                    <tr key={item.id} style={trStyle}>
                      <td style={tdStyle}>
                        {item.user_id ? (
                          <Link
                            to={`/patients/${item.user_id}`}
                            style={{
                              color: "#0F766E",
                              fontWeight: 800,
                              textDecoration: "underline",
                              textUnderlineOffset: 2,
                            }}
                            title="View patient profile"
                          >
                            {getPatientName(item)}
                          </Link>
                        ) : (
                          <div style={cellPrimaryStyle}>{getPatientName(item)}</div>
                        )}
                        <div style={cellMutedStyle}>
                          CON-{String(item.id).padStart(4, "0")} ·{" "}
                          {getPatientMobile(item)}
                        </div>
                        <div style={{ ...cellMutedStyle, marginTop: 4 }}>
                          {getPatientAgeSex(item)} / {getPatientBarangay(item)}
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <div style={cellPrimaryStyle}>
                          {formatConsultationDate(getConsultationDate(item))}
                        </div>
                        <div style={badgeWrapStyle}>
                          <StatusBadge
                            label={mapping.source.label}
                            tone={mapping.source.tone}
                            size="sm"
                            icon={<Users size={13} />}
                          />
                          <StatusBadge
                            label={mapping.queue.label}
                            tone={mapping.queue.tone}
                            size="sm"
                          />
                          <StatusBadge
                            label={lifecycle.label}
                            tone={lifecycle.tone}
                            size="sm"
                            icon={
                              lifecycle.isHistory ? (
                                <Archive size={13} />
                              ) : (
                                <CalendarDays size={13} />
                              )
                            }
                          />
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <div style={cellMutedStyle}>Chief complaint</div>
                        <div style={cellPrimaryStyle} title={complaint}>
                          {truncate(complaint, 64)}
                        </div>
                        <div style={{ ...cellMutedStyle, marginTop: 6 }}>
                          Diagnosis
                        </div>
                        <span
                          style={hasDiagnosis ? cellPrimaryStyle : cellMutedStyle}
                          title={hasDiagnosis ? diagnosis : undefined}
                        >
                          {hasDiagnosis ? truncate(diagnosis) : "—"}
                        </span>
                        <div style={{ ...cellMutedStyle, marginTop: 6 }}>
                          Staff: {getDoctorName(item)}
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <div style={badgeWrapStyle}>
                          <StatusBadge
                            label={mapping.stage.label}
                            tone={mapping.stage.tone}
                            size="sm"
                          />
                          <StatusBadge
                            label={mapping.soap.label}
                            tone={mapping.soap.tone}
                            size="sm"
                          />
                          <StatusBadge
                            label={mapping.afterCare.label}
                            tone={mapping.afterCare.tone}
                            size="sm"
                          />
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <div style={nextStepCellStyle}>{nextStep}</div>
                        <div style={{ ...cellMutedStyle, marginTop: 6 }}>
                          Follow-up: {getFollowupStatus(item)}
                        </div>
                      </td>

                      <td style={tdRightStyle}>
                        <Link
                          to={`/consultations/${item.id}`}
                          style={tableActionStyle}
                        >
                          <FileText size={15} />
                          {actionLabel}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && pg.total > 0 ? (
          <TablePagination
            page={pg.page}
            pageCount={pg.pageCount}
            total={pg.total}
            from={pg.from}
            to={pg.to}
            pageSize={pg.pageSize}
            onPage={pg.setPage}
            onPageSize={pg.setPageSize}
            label="consultations"
          />
        ) : null}
      </section>
    </div>
  );
}

function InstructionCard({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <div style={instructionCardStyle}>
      <div style={instructionNumberStyle}>{number}</div>
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint: string;
  tone: "teal" | "yellow" | "green" | "red";
}) {
  const toneStyle = {
    teal: { background: "#CCFBF1", color: "#0F766E" },
    yellow: { background: "#FEF3C7", color: "#B45309" },
    green: { background: "#DCFCE7", color: "#047857" },
    red: { background: "#FEE2E2", color: "#B91C1C" },
  }[tone];

  return (
    <div style={statCardStyle}>
      <div style={{ ...statIconStyle, ...toneStyle }}>{icon}</div>
      <div>
        <div style={statLabelStyle}>{label}</div>
        <div style={{ ...statValueStyle, color: toneStyle.color }}>{value}</div>
        <div style={statHintStyle}>{hint}</div>
      </div>
    </div>
  );
}

function GuideCard({ label, body }: { label: string; body: string }) {
  return (
    <div style={guideCardStyle}>
      <strong>{label}</strong>
      <span>{body}</span>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoBoxStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const pageStyle: CSSProperties = {
  display: "grid",
  gap: 22,
  paddingBottom: 40,
};

const heroStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 380px)",
  gap: 22,
  alignItems: "stretch",
  padding: 28,
  borderRadius: 28,
  background: "linear-gradient(135deg, #047857 0%, #0F766E 50%, #5EEAD4 100%)",
  color: "#FFFFFF",
  boxShadow: "0 24px 60px rgba(15, 118, 110, 0.22)",
};

const eyebrowStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 1,
  textTransform: "uppercase",
  opacity: 0.9,
};

const heroTitleStyle: CSSProperties = {
  margin: "8px 0 10px",
  fontSize: 36,
  lineHeight: 1.05,
  fontWeight: 950,
};

const heroSubtitleStyle: CSSProperties = {
  margin: 0,
  maxWidth: 760,
  fontSize: 16,
  lineHeight: 1.7,
  opacity: 0.95,
};

const heroMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginTop: 18,
  fontSize: 13,
  fontWeight: 800,
};

const nextCardStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  alignContent: "center",
  padding: 20,
  borderRadius: 22,
  background: "rgba(255,255,255,0.16)",
  border: "1px solid rgba(255,255,255,0.28)",
};

const nextNameStyle: CSSProperties = {
  fontSize: 22,
  lineHeight: 1.2,
};

const mutedWhiteStyle: CSSProperties = {
  fontSize: 14,
  opacity: 0.9,
};

const nextStepPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "9px 12px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.18)",
  fontSize: 13,
  fontWeight: 800,
};

const instructionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 14,
};

const instructionCardStyle: CSSProperties = {
  display: "flex",
  gap: 14,
  alignItems: "flex-start",
  padding: 18,
  borderRadius: 20,
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.05)",
};

const instructionNumberStyle: CSSProperties = {
  width: 38,
  height: 38,
  flex: "0 0 auto",
  display: "grid",
  placeItems: "center",
  borderRadius: 14,
  background: "#047857",
  color: "#FFFFFF",
  fontWeight: 950,
};

const statsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 14,
};

const statCardStyle: CSSProperties = {
  display: "flex",
  gap: 14,
  alignItems: "center",
  minHeight: 112,
  padding: 18,
  borderRadius: 22,
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
};

const statIconStyle: CSSProperties = {
  width: 48,
  height: 48,
  display: "grid",
  placeItems: "center",
  borderRadius: 16,
  flex: "0 0 auto",
};

const statLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 950,
  textTransform: "uppercase",
};

const statValueStyle: CSSProperties = {
  marginTop: 2,
  fontSize: 28,
  fontWeight: 950,
};

const statHintStyle: CSSProperties = {
  marginTop: 4,
  color: "#64748B",
  fontSize: 12,
  lineHeight: 1.35,
};

const guideStyle: CSSProperties = {
  padding: 18,
  borderRadius: 22,
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.05)",
};

const guideHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  alignItems: "flex-start",
  marginBottom: 14,
};

const guideGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const guideCardStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  padding: 12,
  borderRadius: 14,
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  color: "#334155",
  fontSize: 13,
  lineHeight: 1.45,
};

const errorStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  padding: 18,
  borderRadius: 18,
  background: "#FEF2F2",
  color: "#991B1B",
  border: "1px solid #FECACA",
};

const toolbarStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(280px, 1fr) 180px 140px",
  gap: 10,
  alignItems: "center",
  padding: 16,
  borderRadius: 18,
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.05)",
};

const searchBoxStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 46,
  padding: "0 12px",
  borderRadius: 12,
  background: "#F8FAFC",
  border: "1px solid #E5E7EB",
};

const searchInputStyle: CSSProperties = {
  flex: 1,
  border: 0,
  outline: "none",
  background: "transparent",
  fontWeight: 700,
};

const selectStyle: CSSProperties = {
  minHeight: 46,
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  background: "#F8FAFC",
  padding: "0 12px",
  fontWeight: 800,
  color: "#334155",
};

const refreshButtonStyle: CSSProperties = {
  minHeight: 46,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  border: 0,
  borderRadius: 999,
  background: "#047857",
  color: "#FFFFFF",
  fontWeight: 950,
  cursor: "pointer",
};

const boardStyle: CSSProperties = {
  padding: 22,
  borderRadius: 18,
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  boxShadow: "0 18px 42px rgba(15, 23, 42, 0.07)",
};

const boardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 18,
};

const sectionTitleStyle: CSSProperties = {
  margin: "0 0 6px",
  fontSize: 22,
  fontWeight: 950,
  color: "#0F172A",
};

const mutedTextStyle: CSSProperties = {
  margin: 0,
  color: "#64748B",
  fontSize: 13,
  lineHeight: 1.5,
};

const cardsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
  gap: 16,
};

const consultationCardStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 18,
  borderRadius: 18,
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
};

const cardTopStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  alignItems: "flex-start",
};

const cardIdStyle: CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 900,
  textTransform: "uppercase",
};

const patientNameStyle: CSSProperties = {
  margin: "4px 0",
  fontSize: 20,
  fontWeight: 950,
  color: "#0F172A",
};

const mobileStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  color: "#64748B",
  fontSize: 13,
  fontWeight: 700,
};

const badgeColumnStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  alignItems: "flex-end",
};

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 28,
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 950,
  whiteSpace: "nowrap",
};

const infoGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const infoBoxStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  padding: 12,
  borderRadius: 14,
  background: "#F8FAFC",
  color: "#334155",
};

const complaintBoxStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 14,
  borderRadius: 14,
  background: "#F8FAFC",
  color: "#334155",
};

const nextStepBoxStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: 12,
  borderRadius: 14,
  background: "#ECFDF5",
  color: "#047857",
  fontWeight: 900,
};

const actionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "center",
};

const openButtonStyle: CSSProperties = {
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  borderRadius: 999,
  padding: "0 16px",
  background: "#047857",
  color: "#FFFFFF",
  fontWeight: 950,
  textDecoration: "none",
};

const emptyStyle: CSSProperties = {
  minHeight: 220,
  display: "grid",
  placeItems: "center",
  gap: 8,
  textAlign: "center",
  borderRadius: 16,
  background: "#F8FAFC",
  color: "#64748B",
};

const tableWrapStyle: CSSProperties = {
  width: "100%",
  overflowX: "auto",
  border: "1px solid #E2E8F0",
  borderRadius: 14,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 14,
  minWidth: 1040,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "12px 14px",
  background: "#F8FAFC",
  color: "#475569",
  fontWeight: 900,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: ".03em",
  borderBottom: "1px solid #E2E8F0",
  whiteSpace: "nowrap",
};

const thRightStyle: CSSProperties = { ...thStyle, textAlign: "right" };

const trStyle: CSSProperties = {
  borderBottom: "1px solid #F1F5F9",
};

const tdStyle: CSSProperties = {
  padding: "12px 14px",
  color: "#0F172A",
  verticalAlign: "top",
};

const tdRightStyle: CSSProperties = { ...tdStyle, textAlign: "right" };

const cellPrimaryStyle: CSSProperties = {
  color: "#0F172A",
  fontWeight: 800,
};

const cellMutedStyle: CSSProperties = {
  color: "#64748B",
  fontSize: 12,
  fontWeight: 600,
};

const badgeWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginTop: 7,
  alignItems: "center",
};

const nextStepCellStyle: CSSProperties = {
  maxWidth: 260,
  color: "#0F766E",
  fontSize: 13,
  lineHeight: 1.45,
  fontWeight: 800,
};

const tableBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const tableActionStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 12px",
  borderRadius: 999,
  background: "#047857",
  color: "#FFFFFF",
  fontWeight: 800,
  textDecoration: "none",
  whiteSpace: "nowrap",
};
