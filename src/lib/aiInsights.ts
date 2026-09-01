// src/lib/aiInsights.ts
//
// Proactive AI insight generator for Ka-Agapay.
//
// IMPORTANT: this NEVER fabricates data. Every insight is derived purely from
// records already loaded on the page (inventory alerts, queue summary, barangay
// risk, follow-ups, telemedicine backlog). If the underlying data is empty, the
// insight simply does not appear. This is what turns the dashboard's passive
// "tip" card into an assistant that explains what the live numbers mean and what
// staff should do next.
//
// Reusable across pages (Dashboard now; Reports/Inventory later for Part 6).

export type InsightSeverity = "critical" | "warning" | "info" | "success";

export type InsightCategory =
  | "inventory"
  | "queue"
  | "health"
  | "followup"
  | "telemedicine"
  | "workload"
  | "general";

export interface AiInsight {
  id: string;
  severity: InsightSeverity;
  category: InsightCategory;
  title: string;
  detail: string; // what the live data shows
  recommendation: string; // the proactive next step
  actionLabel?: string;
  actionUrl?: string;
}

export interface DashboardInsightInput {
  cards?: Record<string, any> | null;
  queueSummary?: any[] | null;
  barangayRisk?: any[] | null; // queue/case heatmap OR barangay risk feed
  followUps?: any[] | null;
  inventoryItems?: any[] | null;
  inventoryAlerts?: {
    low_stock?: any[];
    expiring_soon?: any[];
    out_of_stock?: any[];
  } | null;
  telemedicinePending?: number | null;
}

// Waiting-time target (minutes) before we suggest opening another desk.
const QUEUE_WAIT_TARGET_MIN = 30;
// Expiry horizon that counts as "urgent".
const EXPIRY_URGENT_DAYS = 14;

function num(value: any): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function daysUntil(value?: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

function itemName(item: any): string {
  return String(item?.name || item?.generic_name || item?.item_code || "an item");
}

function itemStock(item: any): number {
  return num(item?.current_stock ?? item?.qty);
}

function itemUnit(item: any): string {
  return String(item?.unit ?? item?.unit_of_measure ?? "units");
}

function reorderPoint(item: any): number {
  return num(item?.reorder_point ?? item?.reorder ?? item?.minimum_stock_level);
}

function normalizeRisk(level?: string): "low" | "moderate" | "high" | "critical" {
  const r = String(level || "low").toLowerCase();
  if (r === "critical") return "critical";
  if (r === "high") return "high";
  if (r === "moderate") return "moderate";
  return "low";
}

function isFollowUpOverdue(item: any): boolean {
  const status = String(item?.status || "").toLowerCase();
  if (["completed", "cancelled"].includes(status)) return false;

  const raw =
    item?.follow_up_at ||
    (item?.follow_up_date
      ? `${item.follow_up_date}T${item.follow_up_time || "00:00"}`
      : item?.follow_up_start_date || null);

  if (!raw) return false;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return false;

  return date.getTime() < Date.now();
}

const SEVERITY_RANK: Record<InsightSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  success: 3,
};

/**
 * Build the ranked list of proactive insights from live page data.
 * Returns at most `limit` insights, most severe first.
 */
export function buildDashboardInsights(
  input: DashboardInsightInput,
  limit = 6
): AiInsight[] {
  const insights: AiInsight[] = [];

  const cards = input.cards ?? {};
  const alerts = input.inventoryAlerts ?? {};
  const outOfStock = alerts.out_of_stock ?? [];
  const lowStock = alerts.low_stock ?? [];
  const expiring = alerts.expiring_soon ?? [];
  const queueSummary = input.queueSummary ?? [];
  const barangayRisk = input.barangayRisk ?? [];
  const followUps = input.followUps ?? [];

  // ── Inventory: out of stock (critical) ──────────────────────────────────
  if (outOfStock.length > 0) {
    const sample = outOfStock.slice(0, 2).map(itemName).join(", ");
    insights.push({
      id: "inv-out",
      severity: "critical",
      category: "inventory",
      title: `${outOfStock.length} medicine${outOfStock.length === 1 ? "" : "s"} out of stock`,
      detail:
        outOfStock.length === 1
          ? `${sample} is fully depleted.`
          : `Depleted items include ${sample}.`,
      recommendation: "Reorder now — patients may be turned away without stock.",
      actionLabel: "Open inventory",
      actionUrl: "/inventory",
    });
  }

  // ── Inventory: low stock (predicted stock-out) ──────────────────────────
  if (lowStock.length > 0) {
    const worst = [...lowStock].sort((a, b) => itemStock(a) - itemStock(b))[0];
    insights.push({
      id: "inv-low",
      severity: "warning",
      category: "inventory",
      title: `${lowStock.length} medicine${lowStock.length === 1 ? "" : "s"} below reorder level`,
      detail: `Only ${itemStock(worst)} ${itemUnit(worst)} of ${itemName(worst)} left (reorder point ${reorderPoint(worst)}).`,
      recommendation: "Prepare a restock / purchase request before it runs out.",
      actionLabel: "Review stock",
      actionUrl: "/inventory",
    });
  }

  // ── Inventory: expiring soon (with day count) ───────────────────────────
  if (expiring.length > 0) {
    const withDays = expiring
      .map((item) => ({ item, days: daysUntil(item?.expiration_date ?? item?.expiry) }))
      .filter((x) => x.days !== null)
      .sort((a, b) => (a.days as number) - (b.days as number));

    const soonest = withDays[0];
    const days = soonest?.days ?? null;

    insights.push({
      id: "inv-expiry",
      severity: days !== null && days <= EXPIRY_URGENT_DAYS ? "critical" : "warning",
      category: "inventory",
      title: `${expiring.length} medicine${expiring.length === 1 ? "" : "s"} expiring within 30 days`,
      detail:
        soonest && days !== null
          ? `${itemName(soonest.item)} expires in ${days} day${days === 1 ? "" : "s"}.`
          : `${expiring.length} item(s) are nearing their expiration date.`,
      recommendation: "Dispense oldest stock first (FEFO) or coordinate replacement.",
      actionLabel: "Open inventory",
      actionUrl: "/inventory",
    });
  }

  // ── Queue: waiting time above target ────────────────────────────────────
  const waiting = queueSummary.find(
    (row) => String(row?.status || "").toLowerCase() === "waiting"
  );
  const avgWait = num(waiting?.avg_wait_minutes);
  const waitingCount = num(waiting?.total);

  if (avgWait > QUEUE_WAIT_TARGET_MIN) {
    insights.push({
      id: "queue-wait",
      severity: avgWait > QUEUE_WAIT_TARGET_MIN * 2 ? "critical" : "warning",
      category: "queue",
      title: "Queue waiting time above target",
      detail: `Average wait is ${avgWait} min (target ${QUEUE_WAIT_TARGET_MIN} min) with ${waitingCount} patient${waitingCount === 1 ? "" : "s"} waiting.`,
      recommendation: "Consider opening another consultation desk or re-prioritizing the queue.",
      actionLabel: "Manage queue",
      actionUrl: "/queue",
    });
  } else if (waitingCount >= 12) {
    insights.push({
      id: "queue-volume",
      severity: "info",
      category: "queue",
      title: "High patient volume today",
      detail: `${waitingCount} patients are currently waiting in the queue.`,
      recommendation: "Monitor throughput and prepare additional staff if it keeps rising.",
      actionLabel: "Manage queue",
      actionUrl: "/queue",
    });
  }

  // ── Health: rising cases in a barangay ──────────────────────────────────
  const elevated = [...barangayRisk]
    .filter((row) => ["high", "critical"].includes(normalizeRisk(row?.risk_level)))
    .sort((a, b) => num(b?.total_cases) - num(a?.total_cases));

  const topRisk = elevated[0];
  if (topRisk) {
    const disease =
      topRisk.top_complaint || topRisk.top_case_type || topRisk.disease_type || null;
    const cases = num(topRisk.total_cases);
    const risk = normalizeRisk(topRisk.risk_level);

    insights.push({
      id: "health-barangay",
      severity: risk === "critical" ? "critical" : "warning",
      category: "health",
      title: `Rising cases in ${topRisk.barangay || "a barangay"}`,
      detail: `${topRisk.barangay || "This barangay"} shows ${risk} risk with ${cases} case${cases === 1 ? "" : "s"}${disease ? ` (mostly ${disease})` : ""}.`,
      recommendation: `Recommend a health-awareness campaign or BHW visit in ${topRisk.barangay || "the area"}.`,
      actionLabel: "Open heatmap",
      actionUrl: "/heatmap-analytics",
    });
  }

  // ── Follow-ups: overdue reminders ───────────────────────────────────────
  const overdue = followUps.filter(isFollowUpOverdue);
  if (overdue.length > 0) {
    insights.push({
      id: "followup-overdue",
      severity: overdue.length >= 5 ? "warning" : "info",
      category: "followup",
      title: `${overdue.length} follow-up${overdue.length === 1 ? "" : "s"} overdue`,
      detail: `${overdue.length} patient follow-up reminder${overdue.length === 1 ? "" : "s"} passed their scheduled date without completion.`,
      recommendation: "Contact the patients or reschedule the reminders.",
      actionLabel: "View follow-ups",
      actionUrl: "/follow-up",
    });
  }

  // ── Telemedicine: screening backlog ─────────────────────────────────────
  const telePending = num(input.telemedicinePending ?? cards?.pending_telemedicine);
  if (telePending > 0) {
    insights.push({
      id: "tele-backlog",
      severity: telePending >= 5 ? "warning" : "info",
      category: "telemedicine",
      title: `${telePending} telemedicine request${telePending === 1 ? "" : "s"} to screen`,
      detail: `${telePending} remote consultation request${telePending === 1 ? " is" : "s are"} waiting to be screened.`,
      recommendation: "Screen the requests so patients can be scheduled promptly.",
      actionLabel: "Open telemedicine",
      actionUrl: "/telemedicine",
    });
  }

  // ── Workload: open consultations needing completion ─────────────────────
  const openConsults = num(cards?.open_consultations);
  if (openConsults >= 8) {
    insights.push({
      id: "workload-soap",
      severity: "info",
      category: "workload",
      title: "Several consultations still open",
      detail: `${openConsults} consultation${openConsults === 1 ? " is" : "s are"} still open and may have incomplete SOAP notes.`,
      recommendation: "Complete the records so reports and follow-ups stay accurate.",
      actionLabel: "Open consultations",
      actionUrl: "/consultations",
    });
  }

  insights.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  if (insights.length === 0) {
    return [
      {
        id: "all-clear",
        severity: "success",
        category: "general",
        title: "All clear right now",
        detail:
          "No stock-outs, queue backlogs, disease spikes, or overdue follow-ups were detected in today's live data.",
        recommendation: "Keep monitoring — insights update every time you refresh the dashboard.",
      },
    ];
  }

  return insights.slice(0, limit);
}
