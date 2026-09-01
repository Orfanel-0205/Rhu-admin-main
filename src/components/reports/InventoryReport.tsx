// src/components/reports/InventoryReport.tsx
//
// Part 7 — module-scoped Inventory report. Lazy-fetches on mount (it only
// mounts when the Inventory tab is active) and renders the shared ModuleReport.

import { useCallback, useEffect, useMemo, useState } from "react";
import ModuleReport, {
  type ModuleReportColumn,
  type ModuleReportStat,
} from "./ModuleReport";
import type { CsvColumn } from "../../services/analytics";
import { getInventory, getInventoryAlerts } from "../../services/inventory";

interface Row {
  id: number;
  item: string;
  generic: string;
  category: string;
  stock: number;
  unit: string;
  reorder_point: number;
  expiry: string;
  days_to_expiry: number | null;
  status: string;
}

function fmtDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

const columns: ModuleReportColumn<Row>[] = [
  { key: "item", header: "Item", sortAccessor: (r) => r.item },
  { key: "category", header: "Category", sortAccessor: (r) => r.category },
  {
    key: "stock",
    header: "Stock",
    align: "right",
    sortAccessor: (r) => r.stock,
    render: (r) => `${r.stock} ${r.unit}`,
  },
  { key: "reorder_point", header: "Reorder pt", align: "right", sortAccessor: (r) => r.reorder_point },
  { key: "expiry", header: "Expiry", sortAccessor: (r) => r.days_to_expiry },
  { key: "status", header: "Status", sortAccessor: (r) => r.status },
];

const csvColumns: CsvColumn[] = [
  { key: "item", label: "Item" },
  { key: "generic", label: "Generic Name" },
  { key: "category", label: "Category" },
  { key: "stock", label: "Current Stock" },
  { key: "unit", label: "Unit" },
  { key: "reorder_point", label: "Reorder Point" },
  { key: "expiry", label: "Expiration Date" },
  { key: "status", label: "Status" },
];

export default function InventoryReport({ rhuId }: { rhuId: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [alerts, setAlerts] = useState({ low: 0, out: 0, expiring: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [items, alertData] = await Promise.all([
        getInventory({ rhu_id: rhuId }),
        getInventoryAlerts({ rhu_id: rhuId }),
      ]);

      setRows(
        items.map((it) => ({
          id: it.id,
          item: it.name,
          generic: it.generic_name ?? "",
          category: it.display_category || it.category,
          stock: it.current_stock,
          unit: it.unit || it.unit_of_measure || "",
          reorder_point: it.reorder_point,
          expiry: fmtDate(it.expiration_date),
          days_to_expiry: it.days_to_expiry,
          status: it.status_label || it.status,
        }))
      );

      setAlerts({
        low: alertData.low_stock.length,
        out: alertData.out_of_stock.length,
        expiring: alertData.expiring_soon.length,
      });
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Failed to load inventory report.");
    } finally {
      setLoading(false);
    }
  }, [rhuId]);

  useEffect(() => {
    load();
  }, [load]);

  const stats: ModuleReportStat[] = useMemo(
    () => [
      { label: "Total items", value: rows.length },
      { label: "Low stock", value: alerts.low, tone: alerts.low > 0 ? "warning" : "default" },
      { label: "Out of stock", value: alerts.out, tone: alerts.out > 0 ? "danger" : "default" },
      {
        label: "Expiring ≤30d",
        value: alerts.expiring,
        tone: alerts.expiring > 0 ? "warning" : "default",
      },
    ],
    [rows.length, alerts]
  );

  return (
    <ModuleReport<Row>
      title="Inventory Report"
      subtitle="Stock levels, reorder points, and expiry across this facility's inventory."
      loading={loading}
      error={error}
      stats={stats}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      csv={{ filename: "inventory-report", columns: csvColumns }}
      emptyText="No inventory items found."
      onRefresh={load}
    />
  );
}
