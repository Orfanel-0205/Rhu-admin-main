// src/components/reports/QueueReport.tsx
//
// Part 7 — module-scoped Queue report. Lazy-fetches on mount and renders the
// shared ModuleReport. Summary comes from /queue/summary; the table from /queue.

import { useCallback, useEffect, useMemo, useState } from "react";
import ModuleReport, {
  type ModuleReportColumn,
  type ModuleReportStat,
} from "./ModuleReport";
import type { CsvColumn } from "../../services/analytics";
import { getQueueStatus, getQueueSummary } from "../../services/queue";

interface Row {
  id: string;
  ticket: string;
  patient: string;
  service: string;
  priority: string;
  status: string;
  position: number | null;
  barangay: string;
}

const columns: ModuleReportColumn<Row>[] = [
  { key: "ticket", header: "Ticket", sortAccessor: (r) => r.ticket },
  { key: "patient", header: "Patient", sortAccessor: (r) => r.patient },
  { key: "service", header: "Service", sortAccessor: (r) => r.service },
  { key: "priority", header: "Priority", sortAccessor: (r) => r.priority },
  { key: "status", header: "Status", sortAccessor: (r) => r.status },
  {
    key: "position",
    header: "Position",
    align: "right",
    sortAccessor: (r) => r.position,
    render: (r) => (r.position == null ? "—" : r.position),
  },
];

const csvColumns: CsvColumn[] = [
  { key: "ticket", label: "Ticket" },
  { key: "patient", label: "Patient" },
  { key: "barangay", label: "Barangay" },
  { key: "service", label: "Service" },
  { key: "priority", label: "Priority" },
  { key: "status", label: "Status" },
  { key: "position", label: "Queue Position" },
];

export default function QueueReport({ rhuId }: { rhuId: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState({ waiting: 0, inService: 0, served: 0, avgWait: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sum, tickets] = await Promise.all([
        getQueueSummary({ rhu_id: rhuId }),
        getQueueStatus({ rhu_id: rhuId }),
      ]);

      setSummary({
        waiting: sum.currently_waiting || sum.waiting,
        inService: sum.in_service,
        served: sum.total_served_today,
        avgWait: Math.round(sum.average_wait_minutes),
      });

      setRows(
        tickets.map((t) => ({
          id: String(t.id),
          ticket: t.ticket_number,
          patient: t.patient_name || t.resident_name || "—",
          service: t.service_label || String(t.service_type),
          priority: t.priority_display_label || t.priority_category || "Regular",
          status: t.status,
          position: t.queue_position ?? null,
          barangay: t.patient_barangay || "",
        }))
      );
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Failed to load queue report.");
    } finally {
      setLoading(false);
    }
  }, [rhuId]);

  useEffect(() => {
    load();
  }, [load]);

  const stats: ModuleReportStat[] = useMemo(
    () => [
      {
        label: "Waiting",
        value: summary.waiting,
        tone: summary.waiting > 0 ? "warning" : "default",
      },
      { label: "In service", value: summary.inService },
      { label: "Served today", value: summary.served, tone: "success" },
      { label: "Avg wait", value: summary.avgWait, helper: "minutes" },
    ],
    [summary]
  );

  return (
    <ModuleReport<Row>
      title="Queue Report"
      subtitle="Live and issued queue tickets with service load and wait-time summary."
      loading={loading}
      error={error}
      stats={stats}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      csv={{ filename: "queue-report", columns: csvColumns }}
      emptyText="No queue tickets found."
      onRefresh={load}
    />
  );
}
