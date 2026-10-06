// src/utils/eventReport.ts
//
// The event report as a CSV file and as a printable page (pages/EventReport).
// Every value is escaped: names and notes are typed by people, and the print
// page is real HTML.

import type { EventReport } from "../services/eventRegistrants";

const STATUS_LABEL: Record<string, string> = {
  attended: "Came",
  no_show: "No-show",
  registered: "Not marked",
  cancelled: "Cancelled",
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

export function formatWhen(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  // Quote everything; double any quote. A leading = + - @ is neutralised so a
  // spreadsheet never runs a typed name as a formula.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function csvRows(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function eventReportCsv(report: EventReport): string {
  const { event, summary } = report;

  return [
    csvRows([
      ["Event report"],
      ["Event", event.title],
      ["Date", formatWhen(event.starts_at)],
      ["Ended", formatWhen(event.ends_at)],
      ["Barangays", event.barangays],
      ["Host", event.host_rhu],
      ["Posted by", event.posted_by ?? ""],
      ["Generated", formatWhen(report.generated_at)],
      [],
      ["Registered", summary.registered],
      ["Came", summary.attended],
      ["No-show", summary.no_show],
      ["Not marked", summary.not_marked],
      ["Cancelled", summary.cancelled],
      ["Items handed out", summary.items_dispensed],
      [],
      ["Attendees"],
      ["Name", "Barangay", "Attendance", "Marked by", "Marked at"],
      ...report.attendees.map((row) => [
        row.name,
        row.barangay ?? "",
        statusLabel(row.status),
        row.marked_by ?? "",
        row.marked_at ? formatWhen(row.marked_at) : "",
      ]),
      [],
      ["Handed out (totals)"],
      ["Item", "Unit", "Quantity"],
      ...report.dispensed_totals.map((row) => [row.item, row.unit ?? "", row.quantity]),
      [],
      ["Handed out (each record)"],
      ["Item", "Quantity", "Unit", "Recorded by", "Recorded at", "Reason", "Notes"],
      ...report.dispensed.map((row) => [
        row.item,
        row.quantity,
        row.unit ?? "",
        row.recorded_by ?? "",
        formatWhen(row.recorded_at),
        row.reason ?? "",
        row.notes ?? "",
      ]),
    ]),
  ].join("");
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function table(head: string[], rows: unknown[][], empty: string): string {
  if (rows.length === 0) return `<p class="empty">${esc(empty)}</p>`;

  return `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

export function eventReportHtml(report: EventReport): string {
  const { event, summary } = report;
  const figures: [string, number][] = [
    ["Registered", summary.registered],
    ["Came", summary.attended],
    ["No-show", summary.no_show],
    ["Not marked", summary.not_marked],
    ["Cancelled", summary.cancelled],
    ["Items handed out", summary.items_dispensed],
  ];

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(event.title)} — Event report</title>
<style>
  body { font: 12px/1.45 Arial, sans-serif; color: #0f172a; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; } h2 { font-size: 13px; margin: 18px 0 6px; }
  .meta { color: #475569; margin-bottom: 12px; }
  .figures { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
  .figure { border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; }
  .figure b { display: block; font-size: 16px; }
  table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; }
  th { background: #f1f5f9; } .empty { color: #64748b; }
  .foot { margin-top: 18px; color: #64748b; font-size: 11px; }
</style></head><body>
<h1>${esc(event.title)}</h1>
<div class="meta">${esc(formatWhen(event.starts_at))} · ${esc(event.barangays === "all" ? "All barangays" : event.barangays)} · ${esc(event.host_rhu)}${event.posted_by ? ` · posted by ${esc(event.posted_by)}` : ""}</div>
<div class="figures">${figures.map(([label, value]) => `<div class="figure">${esc(label)}<b>${esc(value)}</b></div>`).join("")}</div>
<h2>Attendees</h2>
${table(
  ["Name", "Barangay", "Attendance", "Marked by", "Marked at"],
  report.attendees.map((row) => [row.name, row.barangay ?? "—", statusLabel(row.status), row.marked_by ?? "—", row.marked_at ? formatWhen(row.marked_at) : "—"]),
  "Nobody registered."
)}
<h2>Handed out</h2>
${table(["Item", "Unit", "Quantity"], report.dispensed_totals.map((row) => [row.item, row.unit ?? "—", row.quantity]), "Nothing was recorded against this event.")}
<h2>Each record</h2>
${table(
  ["Item", "Quantity", "Recorded by", "Recorded at", "Reason"],
  report.dispensed.map((row) => [row.item, `${row.quantity} ${row.unit ?? ""}`.trim(), row.recorded_by ?? "—", formatWhen(row.recorded_at), row.reason ?? "—"]),
  "—"
)}
<div class="foot">Ka-Agapay event report · generated ${esc(formatWhen(report.generated_at))}</div>
</body></html>`;
}
