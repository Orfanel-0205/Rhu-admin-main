// src/components/reports/AttendanceReport.tsx
//
// How many people the RHU saw, for a day or any range of dates.
//
// This is the figure the municipality asks for and staff have been counting by
// hand off the queue board. Two distinctions are built into it, because both
// get lost when the number is counted by hand and both change what the number
// means:
//
//   VISITS vs ATTENDEES. One patient coming three times in a month is three
//   visits and one attendee. Quote only visits and you overstate how many
//   people were reached; quote only attendees and you hide the workload. Both
//   are shown, next to each other, so neither can be mistaken for the other.
//
//   BOOKED vs WALK-IN. People reach an RHU two ways. Counting only the queue
//   misses every patient who was expected, and the gap between booked and kept
//   is the number worth acting on -- a morning of empty slots is staff time
//   already paid for.

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { CalendarCheck, Download, ListOrdered, Users } from "lucide-react";

import {
  getAttendanceLog,
  getAttendanceReport,
  type AttendanceLog,
  type AttendanceReport as Report,
} from "../../services/queue";

const CHANNEL_LABELS: Record<string, string> = {
  walk_in: "Walk-in",
  booked: "Booked",
  online: "Online / Telemedicine",
};

const SERVICE_LABELS: Record<string, string> = {
  opd_consultation: "OPD Consultation",
  prenatal_checkup: "Prenatal Check-up",
  immunization: "Immunization",
  family_planning: "Family Planning",
  tb_dots: "TB-DOTS",
  laboratory: "Laboratory",
  dental: "Dental",
  emergency: "Emergency",
  medicine_release: "Medicine Release",
};

const CHANNEL_FILTERS = [
  { key: "all", label: "All" },
  { key: "walk_in", label: "Walk-in" },
  { key: "booked", label: "Booked" },
  { key: "online", label: "Online / Telemedicine" },
] as const;

function channelCount(log: AttendanceLog, key: string): number {
  if (key === "walk_in") return log.meta.walk_in;
  if (key === "booked") return log.meta.booked;
  if (key === "online") return log.meta.online;

  return log.meta.total;
}

function serviceLabel(key: string): string {
  return SERVICE_LABELS[key] ?? key.replace(/_/g, " ");
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function AttendanceReport({
  rhuId,
  from,
  to,
}: {
  rhuId: number;
  /** Defaults to today when the page has no range applied. */
  from?: string;
  to?: string;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // The list of who came, fetched only when asked for. On a busy day it is
  // a thousand rows, and nobody opening Reports wants to wait for them.
  const [log, setLog] = useState<AttendanceLog | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [channel, setChannel] = useState<"all" | "walk_in" | "booked" | "online">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      setReport(await getAttendanceReport({ rhu_id: rhuId, from, to }));
    } catch (err: any) {
      setError(err?.response?.data?.message || "Could not load attendance for this period.");
    } finally {
      setLoading(false);
    }
  }, [rhuId, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadLog = useCallback(
    async (next: typeof channel) => {
      setLogLoading(true);

      try {
        setLog(await getAttendanceLog({ rhu_id: rhuId, from, to, channel: next }));
      } catch {
        setLog(null);
      } finally {
        setLogLoading(false);
      }
    },
    [rhuId, from, to]
  );

  function openLog() {
    setLogOpen(true);
    void loadLog(channel);
  }

  function pickChannel(next: typeof channel) {
    setChannel(next);
    void loadLog(next);
  }

  function downloadLogCsv() {
    if (!log) return;

    const rows = [
      ["Reference", "Patient", "How they were seen", "Service", "Date / time"],
      ...log.rows.map((row) => [
        row.reference,
        row.patient,
        CHANNEL_LABELS[row.channel] ?? row.channel,
        row.service.replace(/_/g, " "),
        row.seen_at,
      ]),
    ];

    const csv = rows
          .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
          .join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `attendance_log_${log.meta.from}_to_${log.meta.to}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  function downloadCsv() {
    if (!report) return;

    const rows: string[][] = [
      ["Ka-Agapay RHU attendance"],
      ["Period", `${report.from} to ${report.to}`],
      ["Facility", `RHU ${report.rhu_id ?? ""}`],
      [],
      ["Measure", "Count"],
      ["Visits (times someone was served)", String(report.totals.visits)],
      ["Attendees (different people served)", String(report.totals.attendees)],
      ["Queue tickets issued", String(report.totals.issued)],
      ["Did not answer when called", String(report.totals.no_show)],
      ["Skipped", String(report.totals.skipped)],
      ["Cancelled", String(report.totals.cancelled)],
      ["Still open", String(report.totals.still_open)],
      [],
      ["Appointments booked", String(report.appointments.booked)],
      ["Appointments kept", String(report.appointments.kept)],
      ["Appointments cancelled", String(report.appointments.cancelled)],
      ["Booked but did not arrive", String(report.appointments.did_not_arrive)],
      [],
      ["Date", "Visits"],
      ...report.by_day.map((row) => [row.date, String(row.visits)]),
      [],
      ["Service", "Visits"],
      ...report.by_service.map((row) => [serviceLabel(row.service_type), String(row.visits)]),
    ];

    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `attendance_${report.from}_to_${report.to}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div style={noticeStyle}>Loading attendance…</div>;
  }

  if (error) {
    return <div style={{ ...noticeStyle, color: "#B91C1C" }}>{error}</div>;
  }

  if (!report) return null;

  const { totals, appointments } = report;
  const repeatVisits = Math.max(0, totals.visits - totals.attendees);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={headerStyle}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 950 }}>Attendance</h3>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#475569" }}>
            {report.from === report.to
              ? formatDate(report.from)
              : `${formatDate(report.from)} – ${formatDate(report.to)}`}
          </p>
        </div>

        <button type="button" style={csvButtonStyle} onClick={downloadCsv}>
          <Download size={15} /> CSV
        </button>
      </div>

      <div style={statGridStyle}>
        <Stat
          label="Total attendees"
          value={totals.attendees}
          helper="Different people seen"
          icon={<Users size={18} />}
          strong
        />
        <Stat
          label="Total visits"
          value={totals.visits}
          helper={repeatVisits > 0 ? `${repeatVisits} repeat visit(s)` : "No repeat visits"}
          icon={<CalendarCheck size={18} />}
          strong
        />
        <Stat label="Appointments booked" value={appointments.booked} helper="Expected this period" />
        <Stat label="Appointments kept" value={appointments.kept} helper="Seen through" />
      </div>

      <div style={statGridStyle}>
        <Stat label="Queue tickets issued" value={totals.issued} helper="Including walk-ins" />
        <Stat
          label="Booked, did not arrive"
          value={appointments.did_not_arrive}
          helper="Neither seen nor cancelled"
        />
        <Stat label="Did not answer" value={totals.no_show} helper="Called, no response" />
        <Stat label="Still open" value={totals.still_open} helper="Not yet closed" />
      </div>

      {report.by_day.length > 1 && (
        <Panel title="By day">
          {report.by_day.map((row) => (
            <Line key={row.date} label={formatDate(row.date)} value={row.visits} />
          ))}
        </Panel>
      )}

      {report.by_service.length > 0 && (
        <Panel title="By service">
          {report.by_service.map((row) => (
            <Line key={row.service_type} label={serviceLabel(row.service_type)} value={row.visits} />
          ))}
        </Panel>
      )}

      {/* The list of who came. Behind a button because on a busy day this is
          a thousand rows, and most visits to this tab only want the totals. */}
      {!logOpen ? (
        <button type="button" style={openLogButtonStyle} onClick={openLog}>
          <ListOrdered size={16} />
          View attendance log ({totals.visits + report.appointments.kept} record(s))
        </button>
      ) : (
        <div style={panelStyle}>
          <div style={{ ...headerStyle, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 900 }}>Attendance log</div>
              <div style={{ fontSize: 12, color: "#64748B" }}>
                Walk-ins come from the queue. Online consultations never get a queue
                ticket, so both are listed together here.
              </div>
            </div>

            <button type="button" style={csvButtonStyle} onClick={downloadLogCsv}>
              <Download size={15} /> CSV
            </button>
          </div>

          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
            {CHANNEL_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => pickChannel(key)}
                style={chipStyle(channel === key)}
              >
                {label}
                {log ? " (" + channelCount(log, key) + ")" : ""}
              </button>
            ))}
          </div>

          {logLoading ? (
            <div style={noticeStyle}>Loading the log...</div>
          ) : !log || log.rows.length === 0 ? (
            <div style={noticeStyle}>No attendance recorded for this period.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Reference</th>
                    <th style={thStyle}>Patient</th>
                    <th style={thStyle}>How seen</th>
                    <th style={thStyle}>Service</th>
                    <th style={thStyle}>Date / time</th>
                  </tr>
                </thead>

                <tbody>
                  {log.rows.map((row, index) => (
                    <tr key={row.channel + "-" + row.reference + "-" + index}>
                      <td style={tdStyle}>{row.reference}</td>
                      <td style={{ ...tdStyle, fontWeight: 800 }}>{row.patient}</td>
                      <td style={tdStyle}>
                        <span style={channelChipStyle(row.channel)}>
                          {CHANNEL_LABELS[row.channel] ?? row.channel}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textTransform: "capitalize" }}>
                        {serviceLabel(row.service)}
                      </td>
                      <td style={tdStyle}>{row.seen_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {totals.visits === 0 && (
        <div style={noticeStyle}>
          Nobody was recorded as served in this period. If patients were seen, their queue tickets may
          not have been marked complete.
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  helper,
  icon,
  strong = false,
}: {
  label: string;
  value: number;
  helper: string;
  icon?: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div style={{ ...statStyle, borderColor: strong ? "#A7F3D0" : "#E2E8F0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: "#047857" }}>
        {icon}
        <span style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>{label}</span>
      </div>

      <div style={{ fontSize: strong ? 30 : 24, fontWeight: 950, color: "#0F172A" }}>{value}</div>
      <div style={{ fontSize: 11.5, color: "#64748B" }}>{helper}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={panelStyle}>
      <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "grid", gap: 6 }}>{children}</div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div style={lineStyle}>
      <span style={{ textTransform: "capitalize" }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const statGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const statStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  padding: "14px 16px",
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: 14,
};

const panelStyle: CSSProperties = {
  padding: "14px 16px",
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: 14,
};

const lineStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  fontSize: 13,
  color: "#334155",
  borderBottom: "1px dashed #E2E8F0",
  paddingBottom: 5,
};

const noticeStyle: CSSProperties = {
  padding: "14px 16px",
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  borderRadius: 14,
  fontSize: 13,
  color: "#475569",
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "2px solid #E2E8F0",
  fontSize: 11.5,
  fontWeight: 900,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: 0.4,
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "9px 10px",
  borderBottom: "1px solid #F1F5F9",
  color: "#0F172A",
  whiteSpace: "nowrap",
};

function chipStyle(active: boolean): CSSProperties {
  return {
    padding: "7px 12px",
    borderRadius: 999,
    border: active ? "1px solid #047857" : "1px solid #E2E8F0",
    background: active ? "#047857" : "#FFFFFF",
    color: active ? "#FFFFFF" : "#334155",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  };
}

/** Colour-coded so a page of rows can be scanned by route at a glance. */
function channelChipStyle(channel: string): CSSProperties {
  const palette: Record<string, [string, string]> = {
    walk_in: ["#ECFDF5", "#047857"],
    booked: ["#EFF6FF", "#1D4ED8"],
    online: ["#F5F3FF", "#6D28D9"],
  };

  const pair = palette[channel] ?? ["#F1F5F9", "#334155"];

  return {
    padding: "3px 9px",
    borderRadius: 999,
    background: pair[0],
    color: pair[1],
    fontSize: 11.5,
    fontWeight: 800,
    whiteSpace: "nowrap",
  };
}

const openLogButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "13px 18px",
  borderRadius: 14,
  border: "1px solid #A7F3D0",
  background: "#ECFDF5",
  color: "#047857",
  fontSize: 14,
  fontWeight: 900,
  cursor: "pointer",
};

const csvButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid #A7F3D0",
  background: "#ECFDF5",
  color: "#047857",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};
