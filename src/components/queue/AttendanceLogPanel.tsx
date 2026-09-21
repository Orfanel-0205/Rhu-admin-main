// src/components/queue/AttendanceLogPanel.tsx
//
// Today's attendance log, on the Queue screen where the desk is worked.
//
// The Reports version answers a question about a date range. This one answers
// the question a nurse asks at the counter: who have we already seen today,
// and what happened to them. It is the same endpoint; only the framing differs.
//
// ONE ROW PER PERSON
//   Not cards. A ticket card is right for a queue of four people you are about
//   to call; it is wrong for two hundred you have already seen. Rows scan, sort
//   by time, and fit on a screen, and the detail that does not fit goes behind
//   View details rather than being dropped.
//
// WALK-IN AND REMOTE TOGETHER
//   An online consultation never produces a queue ticket, so a log built from
//   the queue alone silently omits everyone seen remotely. Both are listed, and
//   the route is on every row.

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Download, X } from "lucide-react";

import {
  getAttendanceLog,
  type AttendanceLog,
  type AttendanceLogRow,
} from "../../services/queue";

const CHANNEL_LABELS: Record<string, string> = {
  walk_in: "Walk-in",
  booked: "Booked",
  online: "Online / Telemedicine",
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "walk_in", label: "Walk-in" },
  { key: "booked", label: "Booked" },
  { key: "online", label: "Online" },
] as const;

type Filter = (typeof FILTERS)[number]["key"];

function countFor(log: AttendanceLog | null, key: Filter): number {
  if (!log) return 0;
  if (key === "walk_in") return log.meta.walk_in;
  if (key === "booked") return log.meta.booked;
  if (key === "online") return log.meta.online;

  return log.meta.total;
}

function clockOf(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(String(value).replace(" ", "T"));

  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function serviceLabel(value: string): string {
  return String(value ?? "").replace(/_/g, " ");
}

export default function AttendanceLogPanel({ rhuId }: { rhuId: number }) {
  const [log, setLog] = useState<AttendanceLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [detail, setDetail] = useState<AttendanceLogRow | null>(null);

  const load = useCallback(
    async (next: Filter) => {
      setLoading(true);

      try {
        setLog(await getAttendanceLog({ rhu_id: rhuId, channel: next }));
      } catch {
        setLog(null);
      } finally {
        setLoading(false);
      }
    },
    [rhuId]
  );

  useEffect(() => {
    void load(filter);
    // Reloading on filter change is handled by pick(); this is the first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rhuId]);

  function pick(next: Filter) {
    setFilter(next);
    void load(next);
  }

  function downloadCsv() {
    if (!log) return;

    const rows = [
      ["Reference", "Patient", "How seen", "Service", "Barangay", "Time", "Served by"],
      ...log.rows.map((row) => [
        row.reference,
        row.patient,
        CHANNEL_LABELS[row.channel] ?? row.channel,
        serviceLabel(row.service),
        row.barangay ?? "",
        clockOf(row.seen_at),
        row.served_by ?? "",
      ]),
    ];

    const csv = rows
      .map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(","))
      .join("\n");

    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "attendance_today.csv";
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={toolbarStyle}>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {FILTERS.map(({ key, label }) => (
            <button key={key} type="button" onClick={() => pick(key)} style={chipStyle(filter === key)}>
              {label} ({countFor(log, key)})
            </button>
          ))}
        </div>

        <button type="button" style={csvButtonStyle} onClick={downloadCsv} disabled={!log?.rows.length}>
          <Download size={15} /> CSV
        </button>
      </div>

      {loading ? (
        <div style={emptyStyle}>Loading today's attendance…</div>
      ) : !log || log.rows.length === 0 ? (
        <div style={emptyStyle}>
          <strong style={{ display: "block", color: "#0F172A", marginBottom: 4 }}>
            Nobody recorded as seen today yet.
          </strong>
          A patient appears here once their ticket is marked Complete, or once an online
          consultation is completed.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Time</th>
                <th style={thStyle}>Ticket</th>
                <th style={thStyle}>Patient</th>
                <th style={thStyle}>How seen</th>
                <th style={thStyle}>Service</th>
                <th style={thStyle}>Barangay</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Details</th>
              </tr>
            </thead>

            <tbody>
              {log.rows.map((row, index) => (
                <tr key={row.channel + row.reference + index} style={trStyle}>
                  <td style={tdStyle}>{clockOf(row.seen_at)}</td>
                  <td style={{ ...tdStyle, fontWeight: 800 }}>{row.reference}</td>
                  <td style={{ ...tdStyle, fontWeight: 800, color: "#0F172A" }}>{row.patient}</td>
                  <td style={tdStyle}>
                    <span style={channelChipStyle(row.channel)}>
                      {CHANNEL_LABELS[row.channel] ?? row.channel}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textTransform: "capitalize" }}>{serviceLabel(row.service)}</td>
                  <td style={tdStyle}>{row.barangay ?? "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    <button type="button" style={detailButtonStyle} onClick={() => setDetail(row)}>
                      View details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && <DetailModal row={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function DetailModal({ row, onClose }: { row: AttendanceLogRow; onClose: () => void }) {
  return (
    <div style={backdropStyle} onClick={onClose} role="presentation">
      <div style={modalStyle} onClick={(event) => event.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{row.reference}</div>
            <h3 style={{ margin: "2px 0 0", fontSize: 19, fontWeight: 950 }}>{row.patient}</h3>
          </div>

          <button type="button" onClick={onClose} style={closeButtonStyle} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "grid", gap: 10, padding: 18 }}>
          <Row label="How they were seen" value={CHANNEL_LABELS[row.channel] ?? row.channel} />
          <Row label="Service" value={serviceLabel(row.service)} />
          <Row label="Barangay" value={row.barangay ?? "Not recorded"} />
          <Row label="Status" value={String(row.status ?? "—").replace(/_/g, " ")} />

          {/* The timings are the point of the detail view: they are what turns
              "this person attended" into "this is how long they waited". */}
          <Row label="Ticket issued" value={clockOf(row.seen_at)} />
          <Row label="Called" value={clockOf(row.called_at)} />
          <Row label="Service started" value={clockOf(row.started_at)} />
          <Row label="Service ended" value={clockOf(row.ended_at)} />
          <Row label="Served by" value={row.served_by ?? "Not recorded"} />

          {row.priority_score > 0 && (
            <Row label="Priority score" value={String(row.priority_score)} />
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={detailRowStyle}>
      <span style={{ color: "#64748B" }}>{label}</span>
      <strong style={{ textTransform: "capitalize" }}>{value}</strong>
    </div>
  );
}

const toolbarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "2px solid #E2E8F0",
  fontSize: 11.5,
  fontWeight: 900,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: 0.4,
  whiteSpace: "nowrap",
};

const trStyle: CSSProperties = { background: "#FFFFFF" };

const tdStyle: CSSProperties = {
  padding: "11px 12px",
  borderBottom: "1px solid #F1F5F9",
  color: "#334155",
  whiteSpace: "nowrap",
};

const emptyStyle: CSSProperties = {
  padding: "22px 18px",
  textAlign: "center",
  color: "#64748B",
  fontSize: 13,
  background: "#F8FAFC",
  borderRadius: 14,
};

function chipStyle(active: boolean): CSSProperties {
  return {
    padding: "8px 14px",
    borderRadius: 999,
    border: active ? "1px solid #047857" : "1px solid #E2E8F0",
    background: active ? "#047857" : "#FFFFFF",
    color: active ? "#FFFFFF" : "#334155",
    fontSize: 12.5,
    fontWeight: 800,
    cursor: "pointer",
  };
}

function channelChipStyle(channel: string): CSSProperties {
  const palette: Record<string, [string, string]> = {
    walk_in: ["#ECFDF5", "#047857"],
    booked: ["#EFF6FF", "#1D4ED8"],
    online: ["#F5F3FF", "#6D28D9"],
  };

  const pair = palette[channel] ?? ["#F1F5F9", "#334155"];

  return {
    padding: "3px 10px",
    borderRadius: 999,
    background: pair[0],
    color: pair[1],
    fontSize: 11.5,
    fontWeight: 800,
    whiteSpace: "nowrap",
  };
}

const detailButtonStyle: CSSProperties = {
  padding: "7px 12px",
  borderRadius: 999,
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F172A",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const csvButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 14px",
  borderRadius: 999,
  border: "1px solid #A7F3D0",
  background: "#ECFDF5",
  color: "#047857",
  fontSize: 12.5,
  fontWeight: 800,
  cursor: "pointer",
};

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,.45)",
  display: "grid",
  placeItems: "center",
  padding: 16,
  zIndex: 1400,
};

const modalStyle: CSSProperties = {
  width: "min(460px, 100%)",
  background: "#FFFFFF",
  borderRadius: 18,
  overflow: "hidden",
  boxShadow: "0 24px 60px rgba(15,23,42,.35)",
};

const modalHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  padding: "16px 18px",
  background: "linear-gradient(135deg, #064E3B, #0F766E)",
  color: "#F8FAFC",
};

const closeButtonStyle: CSSProperties = {
  border: 0,
  background: "rgba(255,255,255,.18)",
  color: "#FFFFFF",
  borderRadius: 999,
  width: 32,
  height: 32,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
};

const detailRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  fontSize: 13,
  borderBottom: "1px dashed #E2E8F0",
  paddingBottom: 7,
};
