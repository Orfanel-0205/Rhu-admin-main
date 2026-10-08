// src/pages/EventReport.tsx
//
// THE RECORD OF AN EVENT: who registered, who came (marked on the
// registrants page), and what was handed out (stock-outs on the inventory
// page that name the event). Built from the live records each time, so a mark
// or a stock-out recorded after the day still counts. When an event ends its
// staff are sent a link here (events:close-ended).

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, Printer, RefreshCw } from "lucide-react";

import { getEventReport, type EventReport as Report } from "../services/eventRegistrants";
import { attendanceLabel, eventReportCsv, eventReportHtml, formatWhen } from "../utils/eventReport";

const cardStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: 18,
  padding: 18,
  marginBottom: 16,
};

const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 8px", fontSize: 12, color: "#475569" };
const tdStyle: React.CSSProperties = { padding: "10px 8px", borderTop: "1px solid #F1F5F9" };

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export default function EventReport() {
  const navigate = useNavigate();
  const { id } = useParams();
  const eventId = Number(id);

  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await getEventReport(eventId));
    } catch (err: any) {
      setError(err?.response?.data?.message || "Could not load the event report.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const print = () => {
    if (!report) return;
    const page = window.open("", "_blank", "width=900,height=1100");
    if (!page) return;
    page.document.write(eventReportHtml(report));
    page.document.close();
    page.focus();
    page.print();
  };

  const figures = report
    ? ([
        ["Registered in the app", report.summary.registered, "#0F172A"],
        ["Came (registered)", report.summary.attended, "#047857"],
        ["Walk-ins", report.summary.walk_ins, "#3730A3"],
        ["Total present", report.summary.present, "#047857"],
        ["No-show", report.summary.no_show, "#B91C1C"],
        ["Not marked", report.summary.not_marked, "#B45309"],
        ["Cancelled", report.summary.cancelled, "#64748B"],
        ["Items handed out", report.summary.items_dispensed, "#1D4ED8"],
      ] as const)
    : [];

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <button className="btn-secondary" onClick={() => navigate(`/cms/events/${eventId}/registrants`)}
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <ArrowLeft size={16} /> Registrants
        </button>
        <div style={{ flex: "1 1 auto" }} />
        <button className="btn-secondary" onClick={() => void load()} disabled={loading}
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <RefreshCw size={16} /> Refresh
        </button>
        <button className="btn-secondary" disabled={!report}
          onClick={() => report && download(`event-${eventId}-report.csv`, eventReportCsv(report))}
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Download size={16} /> Download CSV
        </button>
        <button className="btn-primary" disabled={!report} onClick={print}
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Printer size={16} /> Print
        </button>
      </div>

      {loading && !report ? <div style={cardStyle}>Loading the event report…</div> : null}
      {error ? <div style={{ ...cardStyle, color: "#B91C1C" }}>{error}</div> : null}

      {report ? (
        <>
          <div style={cardStyle}>
            <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>{report.event.title}</h1>
            <div style={{ color: "#475569" }}>
              {formatWhen(report.event.starts_at)} ·{" "}
              {report.event.barangays === "all" ? "All barangays" : report.event.barangays} · {report.event.host_rhu}
              {report.event.posted_by ? ` · posted by ${report.event.posted_by}` : ""}
            </div>
            {!report.event.has_ended ? (
              <p style={{ margin: "10px 0 0", color: "#B45309", fontWeight: 700 }}>
                This event has not ended yet; these are the figures so far.
              </p>
            ) : null}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))", gap: 12, marginBottom: 16 }}>
            {figures.map(([label, value, color]) => (
              <div key={label} style={{ ...cardStyle, marginBottom: 0 }}>
                <div style={{ fontSize: 12, color: "#64748B", fontWeight: 700 }}>{label}</div>
                <strong style={{ fontSize: 26, color }}>{value}</strong>
              </div>
            ))}
          </div>

          <div style={cardStyle}>
            <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>Attendees</h2>
            {report.attendees.length === 0 ? (
              <p style={{ color: "#64748B", margin: 0 }}>Nobody registered.</p>
            ) : (
              <div className="responsive-table">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Barangay</th>
                      <th style={thStyle}>Attendance</th>
                      <th style={thStyle}>Marked by</th>
                      <th style={thStyle}>Marked at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.attendees.map((row) => (
                      <tr key={row.id}>
                        <td data-label="Name" style={{ ...tdStyle, fontWeight: 700 }}>{row.name}</td>
                        <td data-label="Barangay" style={tdStyle}>{row.barangay ?? "—"}</td>
                        <td data-label="Attendance" style={tdStyle}>{attendanceLabel(row)}</td>
                        <td data-label="Marked by" style={tdStyle}>{row.marked_by ?? "—"}</td>
                        <td data-label="Marked at" style={tdStyle}>{row.marked_at ? formatWhen(row.marked_at) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {report.summary.not_marked > 0 ? (
              <p style={{ margin: "10px 0 0", color: "#B45309" }}>
                {report.summary.not_marked} registrant(s) not marked yet. Mark them on the registrants page.
              </p>
            ) : null}
          </div>

          <div style={cardStyle}>
            <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>Handed out</h2>
            {report.dispensed_totals.length === 0 ? (
              <p style={{ color: "#64748B", margin: 0 }}>
                Nothing was recorded against this event. When stock is handed out at an event, choose the event on
                the inventory stock-out form.
              </p>
            ) : (
              <div className="responsive-table">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Item</th>
                      <th style={thStyle}>Quantity</th>
                      <th style={thStyle}>Recorded by</th>
                      <th style={thStyle}>Recorded at</th>
                      <th style={thStyle}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.dispensed.map((row) => (
                      <tr key={row.id}>
                        <td data-label="Item" style={{ ...tdStyle, fontWeight: 700 }}>{row.item}</td>
                        <td data-label="Quantity" style={tdStyle}>{`${row.quantity} ${row.unit ?? ""}`.trim()}</td>
                        <td data-label="Recorded by" style={tdStyle}>{row.recorded_by ?? "—"}</td>
                        <td data-label="Recorded at" style={tdStyle}>{formatWhen(row.recorded_at)}</td>
                        <td data-label="Reason" style={tdStyle}>{row.reason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ margin: "10px 0 0", color: "#334155" }}>
                  Totals:{" "}
                  {report.dispensed_totals.map((row) => `${row.item} ${row.quantity} ${row.unit ?? ""}`.trim()).join(" · ")}
                </p>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
