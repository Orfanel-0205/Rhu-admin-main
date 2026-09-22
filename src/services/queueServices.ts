// src/services/queueServices.ts
//
// The services the RHU queues patients for.
//
// These used to be a constant in src/services/queue.ts, mirrored by ten
// strings repeated across eight backend files. They are rows now, maintained
// from Administration → Health Services, so the RHU can start offering Animal
// Bite Treatment without waiting for a deployment.
//
// QUEUE_SERVICE_OPTIONS still exists as the list shown while this request is
// in flight, and as the fallback if it fails. A queue screen that renders an
// empty service picker because the network hiccuped is worse than one showing
// a slightly stale list.

import apiClient from "../lib/apiClient";
import { QUEUE_SERVICE_OPTIONS } from "./queue";

export interface QueueServiceRow {
  id: number | null;
  /** What queue_tickets.service_type stores. Never changes once created. */
  code: string;
  name: string;
  helper: string;
  ticket_prefix: string;
  is_active: boolean;
  sort_order: number;
  /** Whether any ticket has ever used it — why it can be switched off, not deleted. */
  in_use: boolean;
  ticket_count: number;
  editable: boolean;
}

/** The shape the queue pickers want: active services only. */
export interface QueueServiceOption {
  value: string;
  label: string;
  helper: string;
}

/** Used until the API answers, and if it never does. */
export const FALLBACK_SERVICE_OPTIONS: QueueServiceOption[] =
  QUEUE_SERVICE_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    helper: option.helper,
  }));

function normalize(raw: any): QueueServiceRow {
  return {
    id: raw?.id ?? null,
    code: String(raw?.code ?? ""),
    name: String(raw?.name ?? ""),
    helper: String(raw?.helper ?? ""),
    ticket_prefix: String(raw?.ticket_prefix ?? ""),
    is_active: raw?.is_active !== false,
    sort_order: Number(raw?.sort_order ?? 0),
    in_use: raw?.in_use === true,
    ticket_count: Number(raw?.ticket_count ?? 0),
    editable: raw?.editable !== false,
  };
}

/**
 * Every service, retired ones included.
 *
 * `managed` is false on a server where the catalogue table has not been
 * migrated yet; the admin screen uses it to say so rather than offering
 * buttons that cannot work.
 */
export async function getQueueServices(): Promise<{
  rows: QueueServiceRow[];
  managed: boolean;
}> {
  const res = await apiClient.get("/queue/services");
  const body = res.data ?? {};
  const list = Array.isArray(body.data) ? body.data : [];

  return {
    rows: list.map(normalize).filter((row: QueueServiceRow) => row.code !== ""),
    managed: body?.meta?.managed === true,
  };
}

/** Active services, in display order, ready for a picker. */
export async function getActiveServiceOptions(): Promise<QueueServiceOption[]> {
  try {
    const { rows } = await getQueueServices();

    const active = rows
      .filter((row) => row.is_active)
      .map((row) => ({
        value: row.code,
        label: row.name,
        helper: row.helper,
      }));

    // An empty catalogue would render a picker with nothing in it, which
    // stops tickets being issued altogether. The built-in list is wrong in
    // that case, but it is wrong in a way staff can still work with.
    return active.length > 0 ? active : FALLBACK_SERVICE_OPTIONS;
  } catch {
    return FALLBACK_SERVICE_OPTIONS;
  }
}

export async function createQueueService(payload: {
  name: string;
  helper?: string;
  ticket_prefix: string;
  is_active?: boolean;
}): Promise<void> {
  await apiClient.post("/queue/services", payload);
}

export async function updateQueueService(
  id: number,
  payload: {
    name?: string;
    helper?: string | null;
    ticket_prefix?: string;
    is_active?: boolean;
    sort_order?: number;
  }
): Promise<void> {
  await apiClient.put(`/queue/services/${id}`, payload);
}
