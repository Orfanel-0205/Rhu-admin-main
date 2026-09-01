// src/components/reports/TelemedicineReport.tsx
//
// Part 7 — module-scoped Telemedicine report. Lazy-fetches on mount and renders
// the shared ModuleReport, with a request-status breakdown summary.

import { useCallback, useEffect, useMemo, useState } from "react";
import ModuleReport, {
  type ModuleReportColumn,
  type ModuleReportStat,
} from "./ModuleReport";
import type { CsvColumn } from "../../services/analytics";
import {
  getTelemedicineRequests,
  type TelemedicineRequest,
} from "../../services/telemedicine";

interface Row {
  id: number;
  patient: string;
  barangay: string;
  complaint: string;
  urgency: string;
  status: string;
  requested: string;
}

function fmtDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

const columns: ModuleReportColumn<Row>[] = [
  { key: "patient", header: "Patient", sortAccessor: (r) => r.patient },
  { key: "complaint", header: "Chief Complaint", sortAccessor: (r) => r.complaint },
  { key: "urgency", header: "Urgency", sortAccessor: (r) => r.urgency },
  { key: "status", header: "Status", sortAccessor: (r) => r.status },
  { key: "requested", header: "Requested", sortAccessor: (r) => r.requested },
];

const csvColumns: CsvColumn[] = [
  { key: "patient", label: "Patient" },
  { key: "barangay", label: "Barangay" },
  { key: "complaint", label: "Chief Complaint" },
  { key: "urgency", label: "Urgency" },
  { key: "status", label: "Status" },
  { key: "requested", label: "Requested" },
];

export default function TelemedicineReport({ rhuId }: { rhuId: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items: TelemedicineRequest[] = await getTelemedicineRequests({ rhu_id: rhuId });

      setRows(
        items.map((t) => ({
          id: t.id,
          patient: t.resident?.name?.trim() || "—",
          barangay: t.resident?.barangay || "",
          complaint: t.chief_complaint || "—",
          urgency: t.urgency_level || "routine",
          status: t.status,
          requested: fmtDate(t.created_at),
        }))
      );
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Failed to load telemedicine report.");
    } finally {
      setLoading(false);
    }
  }, [rhuId]);

  useEffect(() => {
    load();
  }, [load]);

  const stats: ModuleReportStat[] = useMemo(() => {
    const count = (fn: (s: string) => boolean) => rows.filter((r) => fn(r.status)).length;
    return [
      { label: "Total", value: rows.length },
      {
        label: "Pending / Screening",
        value: count((s) => s === "pending" || s === "screening" || s === "screened"),
        tone: "warning",
      },
      {
        label: "Scheduled",
        value: count((s) => s === "scheduled" || s === "endorsed_to_doctor"),
      },
      { label: "Completed", value: count((s) => s === "completed"), tone: "success" },
      {
        label: "Cancelled / Rejected",
        value: count((s) => s === "cancelled" || s === "rejected"),
        tone: "danger",
      },
    ];
  }, [rows]);

  return (
    <ModuleReport<Row>
      title="Telemedicine Report"
      subtitle="Teleconsultation requests by urgency and status for this facility."
      loading={loading}
      error={error}
      stats={stats}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      csv={{ filename: "telemedicine-report", columns: csvColumns }}
      emptyText="No telemedicine requests found."
      onRefresh={load}
    />
  );
}
