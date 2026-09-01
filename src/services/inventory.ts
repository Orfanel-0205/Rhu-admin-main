// src/services/inventory.ts

import apiClient from "../lib/apiClient";

export type InventoryStatus =
  | "ok"
  | "low"
  | "out"
  | "expiring"
  | "expired";

export type InventoryCategory =
  | "medicine"
  | "vaccine"
  | "supply"
  | "equipment";

export type InventoryTab =
  | "all"
  | "medicine"
  | "vaccine"
  | "supply"
  | "equipment"
  | "low"
  | "out"
  | "expiring"
  | "expired";

export interface InventoryTransaction {
  id: number;
  inventory_item_id?: number | null;
  performed_by?: number | null;
  transaction_type?: string | null;
  quantity_before?: number | null;
  quantity_changed?: number | null;
  quantity_after?: number | null;
  reference_number?: string | null;
  prescription_id?: number | null;
  reason?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  performed_by_name?: string | null;
  /** null = nobody designated for this RHU, so there is nothing to compare. */
  performed_by_assigned?: boolean | null;
  assigned_personnel_name?: string | null;
  raw?: Record<string, any>;
}

export interface InventoryItem {
  id: number;
  item_code?: string | null;
  rhu_id?: number | null;

  name: string;
  generic_name?: string | null;

  category: InventoryCategory;
  display_category: string;

  current_stock: number;
  qty: number;

  unit_of_measure: string;
  unit: string;

  dosage_form?: string | null;

  minimum_stock_level: number;
  maximum_stock_level?: number | null;
  reorder_point: number;
  reorder: number;

  expiration_date?: string | null;
  expiry?: string | null;
  days_to_expiry: number | null;

  last_restocked_at?: string | null;

  is_controlled_substance: boolean;
  requires_prescription: boolean;
  is_active: boolean;

  notes?: string | null;

  status: InventoryStatus;
  status_label: string;
  safety_message: string;
  recommended_action: string;

  transactions?: InventoryTransaction[];

  raw?: Record<string, any>;
}

export interface InventoryPayload {
  rhu_id?: number;
  name: string;
  generic_name?: string | null;
  category: InventoryCategory | string;
  display_category?: string;
  unit_of_measure?: string;
  unit?: string;
  dosage_form?: string | null;
  current_stock?: number;
  qty?: number;
  minimum_stock_level?: number;
  reorder?: number;
  reorder_point?: number;
  maximum_stock_level?: number | null;
  expiration_date?: string | null;
  expiry?: string | null;
  is_controlled_substance?: boolean;
  requires_prescription?: boolean;
  notes?: string | null;
}

export interface InventoryAlerts {
  low_stock: InventoryItem[];
  expiring_soon: InventoryItem[];
  out_of_stock: InventoryItem[];
}

const BACKEND_CATEGORIES: InventoryCategory[] = [
  "medicine",
  "vaccine",
  "supply",
  "equipment",
];

function defaultRhuId(): number {
  return Number(
    localStorage.getItem("ka_agapay_rhu_id") ||
      localStorage.getItem("rhu_id") ||
      "1"
  );
}

function extractArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function toNumber(value: any, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value: any): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function normalizeDate(value?: string | null): string | null {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }

  return parsed.toISOString().slice(0, 10);
}

function daysUntil(dateValue?: string | null): number | null {
  const normalized = normalizeDate(dateValue);

  if (!normalized) return null;

  const target = new Date(normalized);
  const today = new Date();

  if (Number.isNaN(target.getTime())) return null;

  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function isBackendCategory(value?: string | null): value is InventoryCategory {
  if (!value) return false;

  return BACKEND_CATEGORIES.includes(
    String(value).trim().toLowerCase() as InventoryCategory
  );
}

function resolveCategory(value?: string | null): InventoryCategory {
  const text = String(value ?? "").trim().toLowerCase();

  if (isBackendCategory(text)) {
    return text;
  }

  if (
    text.includes("vaccine") ||
    text.includes("bakuna") ||
    text.includes("immunization")
  ) {
    return "vaccine";
  }

  if (
    text.includes("supply") ||
    text.includes("syringe") ||
    text.includes("glove") ||
    text.includes("mask") ||
    text.includes("cotton") ||
    text.includes("gauze") ||
    text.includes("ppe")
  ) {
    return "supply";
  }

  if (
    text.includes("equipment") ||
    text.includes("device") ||
    text.includes("machine") ||
    text.includes("thermometer") ||
    text.includes("apparatus")
  ) {
    return "equipment";
  }

  return "medicine";
}

function deriveStatus(
  stock: number,
  minimum: number,
  expiry?: string | null
): InventoryStatus {
  const days = daysUntil(expiry);

  if (stock <= 0) return "out";
  if (days !== null && days < 0) return "expired";
  if (days !== null && days <= 30) return "expiring";
  if (stock <= minimum) return "low";

  return "ok";
}

function statusLabel(status: InventoryStatus): string {
  switch (status) {
    case "out":
      return "Walang Stock";
    case "expired":
      return "Expired";
    case "expiring":
      return "Malapit Mag-expire";
    case "low":
      return "Mababang Stock";
    default:
      return "Maayos";
  }
}

function safetyMessage(status: InventoryStatus): string {
  switch (status) {
    case "out":
      return "Hindi dapat ma-dispense. Kailangan munang mag-restock.";
    case "expired":
      return "Huwag gamitin. Ihiwalay at i-record bilang expired stock.";
    case "expiring":
      return "Gamitin muna kung ligtas pa at hindi expired. Sundin ang FEFO.";
    case "low":
      return "Below reorder level. Maghanda ng restock request.";
    default:
      return "Stock is safe for normal RHU operation.";
  }
}

function recommendedAction(status: InventoryStatus): string {
  switch (status) {
    case "out":
      return "Restock immediately or mark unavailable for prescriptions.";
    case "expired":
      return "Remove from usable stock and document disposal.";
    case "expiring":
      return "Use first before newer stocks, or prepare expiry removal.";
    case "low":
      return "Request restock before stockout happens.";
    default:
      return "Continue monitoring.";
  }
}

function normalizeTransaction(raw: any): InventoryTransaction {
  const performer =
    raw?.performed_by_name ??
    raw?.performed_by_user ??
    raw?.performed_by?.full_name ??
    raw?.performed_by?.name ??
    (raw?.performed_by
      ? [raw.performed_by.first_name, raw.performed_by.last_name]
          .filter(Boolean)
          .join(" ") || null
      : null);

  // performed_by is an id. Older responses serialized the eager-loaded relation
  // under the same key, so guard against an object landing in a number field.
  const performerId =
    typeof raw?.performed_by === "object" && raw?.performed_by !== null
      ? (raw.performed_by.user_id ?? raw.performed_by.id ?? null)
      : (raw?.performed_by ?? null);

  return {
    id: toNumber(raw?.id),
    inventory_item_id: raw?.inventory_item_id ?? null,
    performed_by: performerId,
    transaction_type: raw?.transaction_type ?? raw?.type ?? null,
    quantity_before: raw?.quantity_before ?? raw?.stock_before ?? null,
    quantity_changed: raw?.quantity_changed ?? raw?.quantity ?? null,
    quantity_after: raw?.quantity_after ?? raw?.stock_after ?? null,
    reference_number: raw?.reference_number ?? null,
    prescription_id: raw?.prescription_id ?? null,
    reason: raw?.reason ?? raw?.remarks ?? null,
    notes: raw?.notes ?? null,
    created_at: raw?.created_at ?? null,
    updated_at: raw?.updated_at ?? null,
    performed_by_name: performer,
    performed_by_assigned:
      raw?.performed_by_assigned === null || raw?.performed_by_assigned === undefined
        ? null
        : Boolean(raw.performed_by_assigned),
    assigned_personnel_name: raw?.assigned_personnel_name ?? null,
    raw,
  };
}

function getDisplayCategory(raw: any, category: InventoryCategory): string {
  const notes = String(raw?.notes ?? "");
  const match = notes.match(/Display category:\s*(.+)/i);

  if (match?.[1]) {
    return match[1].trim();
  }

  return String(
    raw?.display_category ??
      raw?.cat ??
      raw?.subcategory ??
      raw?.therapeutic_category ??
      category
  );
}

function normalizeItem(raw: any): InventoryItem {
  const category = resolveCategory(raw?.category ?? raw?.type);
  const stock = toNumber(raw?.current_stock ?? raw?.qty ?? raw?.quantity);
  const minimum = toNumber(
    raw?.minimum_stock_level ?? raw?.reorder_point ?? raw?.reorder
  );
  const expiry = normalizeDate(
    raw?.expiration_date ?? raw?.expiry ?? raw?.expiry_date
  );
  const status = deriveStatus(stock, minimum, expiry);
  const itemTransactions = extractArray(raw?.transactions).map(normalizeTransaction);

  return {
    id: toNumber(raw?.id),
    item_code: raw?.item_code ?? null,
    rhu_id: raw?.rhu_id ?? null,

    name: String(raw?.name ?? raw?.item_name ?? "Unnamed item"),
    generic_name: raw?.generic_name ?? null,

    category,
    display_category: getDisplayCategory(raw, category),

    current_stock: stock,
    qty: stock,

    unit_of_measure: String(raw?.unit_of_measure ?? raw?.unit ?? "pcs"),
    unit: String(raw?.unit_of_measure ?? raw?.unit ?? "pcs"),

    dosage_form: raw?.dosage_form ?? null,

    minimum_stock_level: minimum,
    maximum_stock_level:
      raw?.maximum_stock_level === undefined || raw?.maximum_stock_level === null
        ? null
        : toNumber(raw?.maximum_stock_level),
    reorder_point: toNumber(raw?.reorder_point ?? minimum),
    reorder: toNumber(raw?.reorder_point ?? minimum),

    expiration_date: expiry,
    expiry,
    days_to_expiry: daysUntil(expiry),

    last_restocked_at: raw?.last_restocked_at ?? null,

    is_controlled_substance: toBoolean(raw?.is_controlled_substance),
    requires_prescription: toBoolean(raw?.requires_prescription),
    is_active: raw?.is_active === undefined ? true : toBoolean(raw?.is_active),

    notes: raw?.notes ?? null,

    status,
    status_label: statusLabel(status),
    safety_message: safetyMessage(status),
    recommended_action: recommendedAction(status),

    transactions: itemTransactions,

    raw,
  };
}

function toBackendPayload(
  payload: Partial<InventoryPayload>,
  options: { update?: boolean } = {}
): Record<string, any> {
  const displayCategory = String(
    payload.display_category ?? payload.category ?? ""
  ).trim();

  const backendCategory = resolveCategory(payload.category);

  const stockValue =
    payload.current_stock !== undefined ? payload.current_stock : payload.qty;

  const minimumValue =
    payload.minimum_stock_level !== undefined
      ? payload.minimum_stock_level
      : payload.reorder;

  const reorderValue =
    payload.reorder_point !== undefined ? payload.reorder_point : minimumValue;

  const unit = payload.unit_of_measure ?? payload.unit;

  const data: Record<string, any> = {};

  if (!options.update || payload.rhu_id !== undefined) {
    data.rhu_id = payload.rhu_id ?? defaultRhuId();
  }

  if (!options.update || payload.name !== undefined) {
    data.name = String(payload.name ?? "").trim();
  }

  if (!options.update || payload.generic_name !== undefined) {
    data.generic_name = payload.generic_name?.trim() || null;
  }

  if (!options.update || payload.category !== undefined) {
    data.category = backendCategory;
  }

  if (!options.update || unit !== undefined) {
    data.unit_of_measure = String(unit ?? "pcs").trim() || "pcs";
  }

  if (!options.update || payload.dosage_form !== undefined) {
    data.dosage_form = payload.dosage_form?.trim() || null;
  }

  if (!options.update || stockValue !== undefined) {
    data.current_stock = Math.max(0, toNumber(stockValue));
  }

  if (!options.update || minimumValue !== undefined) {
    data.minimum_stock_level = Math.max(0, toNumber(minimumValue));
  }

  if (!options.update || reorderValue !== undefined) {
    data.reorder_point = Math.max(0, toNumber(reorderValue));
  }

  if (!options.update || payload.maximum_stock_level !== undefined) {
    data.maximum_stock_level =
      payload.maximum_stock_level === null ||
      payload.maximum_stock_level === undefined
        ? null
        : Math.max(0, toNumber(payload.maximum_stock_level));
  }

  if (!options.update || payload.expiration_date !== undefined || payload.expiry !== undefined) {
    data.expiration_date = normalizeDate(payload.expiration_date ?? payload.expiry);
  }

  if (!options.update || payload.is_controlled_substance !== undefined) {
    data.is_controlled_substance = Boolean(payload.is_controlled_substance);
  }

  if (!options.update || payload.requires_prescription !== undefined) {
    data.requires_prescription = Boolean(payload.requires_prescription);
  }

  const existingNotes = payload.notes?.trim() || "";

  if (displayCategory && displayCategory.toLowerCase() !== backendCategory) {
    data.notes = existingNotes
      ? `${existingNotes}\nDisplay category: ${displayCategory}`
      : `Display category: ${displayCategory}`;
  } else if (!options.update || payload.notes !== undefined) {
    data.notes = existingNotes || null;
  }

  Object.keys(data).forEach((key) => {
    if (data[key] === undefined) {
      delete data[key];
    }
  });

  return data;
}

export async function getInventory(params?: {
  type?: InventoryCategory | "all";
  search?: string;
  rhu_id?: number;
}): Promise<InventoryItem[]> {
  const response = await apiClient.get("/inventory", {
    params: {
      rhu_id: params?.rhu_id ?? defaultRhuId(),
      category:
        params?.type && params.type !== "all" ? params.type : undefined,
      search: params?.search?.trim() || undefined,
      per_page: 100,
    },
  });

  return extractArray(response.data).map(normalizeItem);
}

export async function getInventoryAlerts(params?: {
  rhu_id?: number;
}): Promise<InventoryAlerts> {
  const response = await apiClient.get("/inventory/alerts", {
    params: {
      rhu_id: params?.rhu_id ?? defaultRhuId(),
    },
  });

  return {
    low_stock: extractArray(response.data?.low_stock).map(normalizeItem),
    expiring_soon: extractArray(response.data?.expiring_soon).map(normalizeItem),
    out_of_stock: extractArray(response.data?.out_of_stock).map(normalizeItem),
  };
}

export async function getInventoryTransactions(
  id: number
): Promise<InventoryTransaction[]> {
  const response = await apiClient.get(`/inventory/${id}/transactions`, {
    params: {
      per_page: 50,
    },
  });

  return extractArray(response.data).map(normalizeTransaction);
}

export async function addInventoryItem(
  payload: InventoryPayload
): Promise<InventoryItem> {
  const response = await apiClient.post("/inventory", toBackendPayload(payload));

  return normalizeItem(response.data?.data ?? response.data);
}

export async function updateInventoryItem(
  id: number,
  payload: Partial<InventoryPayload>
): Promise<InventoryItem> {
  const response = await apiClient.patch(
    `/inventory/${id}`,
    toBackendPayload(payload, { update: true })
  );

  return normalizeItem(response.data?.data ?? response.data);
}

export async function deleteInventoryItem(
  id: number,
  reason = "Inventory item removed from RHU admin web."
): Promise<void> {
  await apiClient.delete(`/inventory/${id}`, {
    data: {
      reason,
      delete_reason: reason,
      archive_reason: reason,
    },
  });
}

export async function restockItem(
  id: number,
  quantityToAdd: number,
  details?: {
    reference_number?: string;
    reason?: string;
    notes?: string;
  }
): Promise<InventoryItem> {
  const response = await apiClient.post(`/inventory/${id}/stock-in`, {
    quantity: Number(quantityToAdd),
    reference_number: details?.reference_number || undefined,
    // The restock form has always shown a Reason box, but this call never sent
    // the value, so every restock landed in the ledger as the generic default.
    reason: details?.reason || undefined,
    notes: details?.notes || "Manual restock from RHU admin web.",
  });

  return normalizeItem(response.data?.data ?? response.data);
}

export async function deductInventoryItem(
  id: number,
  quantityToDeduct: number,
  reason = "Manual stock deduction from RHU admin web.",
  notes?: string
): Promise<InventoryItem> {
  const response = await apiClient.post(`/inventory/${id}/stock-out`, {
    quantity: Number(quantityToDeduct),
    reason,
    notes: notes || reason,
  });

  return normalizeItem(response.data?.data ?? response.data);
}

export async function adjustInventoryItem(
  id: number,
  newQuantity: number,
  reason: string
): Promise<InventoryItem> {
  const response = await apiClient.post(`/inventory/${id}/adjust`, {
    new_quantity: Number(newQuantity),
    reason,
  });

  return normalizeItem(response.data?.data ?? response.data);
}

export interface AssignedPersonnel {
  rhu_id: number;
  user_id: number | null;
  name: string | null;
  assigned_by_name?: string | null;
  assigned_at?: string | null;
}

export interface EligiblePersonnel {
  user_id: number;
  name: string;
  assigned_rhu_id: number | null;
}

/** Current assigned inventory personnel for an RHU, plus who could hold it. */
export async function getAssignedPersonnel(
  rhuId: number
): Promise<{ assigned: AssignedPersonnel; eligible: EligiblePersonnel[] }> {
  const response = await apiClient.get("/inventory/assigned-personnel", {
    params: { rhu_id: rhuId },
    suppressErrorToast: true,
  } as any);

  return {
    assigned: response.data?.data ?? { rhu_id: rhuId, user_id: null, name: null },
    eligible: Array.isArray(response.data?.eligible) ? response.data.eligible : [],
  };
}

/** Designate (or clear, with null) the assigned inventory personnel for an RHU. */
export async function setAssignedPersonnel(
  rhuId: number,
  userId: number | null
): Promise<AssignedPersonnel> {
  const response = await apiClient.post("/inventory/assigned-personnel", {
    rhu_id: rhuId,
    user_id: userId,
  });

  return response.data?.data;
}

export function getDefaultInventoryRhuId(): number {
  return defaultRhuId();
}