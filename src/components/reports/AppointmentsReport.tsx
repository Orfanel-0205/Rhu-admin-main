// src/components/reports/AppointmentsReport.tsx
//
// Part 7 — module-scoped Appointments report. Lazy-fetches on mount and renders
// the shared ModuleReport, with a status breakdown summary.

import { useCallback, useEffect, useMemo, useState } from "react";
import ModuleReport, {
  type ModuleReportColumn,
  type ModuleReportStat,
} from "./ModuleReport";
import type { CsvColumn } from "../../services/analytics";
import { getAppointments, type Appointment, type AppointmentUser } from "../../services/appointments";

interface Row {
  id: number;
  patient: string;
  date: string;
  time: string;
  type: string;
  purpose: string;
  status: string;
}

function patientName(user?: AppointmentUser | null): string {
  if (!user) return "—";
  const full = user.full_name || user.name;
  if (full && full.trim()) return full.trim();
  const parts = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return parts || "—";
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
  { key: "date", header: "Date", sortAccessor: (r) => r.date },
  { key: "time", header: "Time", sortAccessor: (r) => r.time },
  { key: "type", header: "Type", sortAccessor: (r) => r.type },
  { key: "purpose", header: "Purpose", sortAccessor: (r) => r.purpose },
  { key: "status", header: "Status", sortAccessor: (r) => r.status },
];

const csvColumns: CsvColumn[] = [
  { key: "patient", label: "Patient" },
  { key: "date", label: "Date" },
  { key: "time", label: "Time" },
  { key: "type", label: "Type" },
  { key: "purpose", label: "Purpose" },
  { key: "status", label: "Status" },
];

export default function AppointmentsReport({ rhuId }: { rhuId: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items: Appointment[] = await getAppointments({ rhu_id: String(rhuId), board: "all" });

      setRows(
        items.map((a) => ({
          id: a.id,
          patient: patientName(a.resident),
          date: fmtDate(a.appointment_date),
          time: a.appointment_time || "—",
          type: a.consultation_type ? String(a.consultation_type) : "onsite",
          purpose: a.purpose || a.reason || "—",
          status: a.status,
        }))
      );
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Failed to load appointments report.");
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
      { label: "Pending", value: count((s) => s === "pending"), tone: "warning" },
      {
        label: "Approved",
        value: count((s) => s === "approved" || s === "confirmed" || s === "scheduled"),
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
      title="Appointments Report"
      subtitle="Appointment records by status, service type, and schedule for this facility."
      loading={loading}
      error={error}
      stats={stats}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      csv={{ filename: "appointments-report", columns: csvColumns }}
      emptyText="No appointments found."
      onRefresh={load}
    />
  );
}
