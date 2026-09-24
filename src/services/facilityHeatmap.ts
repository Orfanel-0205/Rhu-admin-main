import { eventsService } from "./events";
import { getRhuFacilities } from "./rhus";
import { getLiveQueue, type QueueTicket } from "./queue";
import type { Event } from "../types/cms";

export type PressureLevel = "low" | "moderate" | "high" | "critical";

export interface FacilityHeatmapEvent {
  id: number;
  title: string;
  facilityId: number;
  facilityName: string;
  latitude: number;
  longitude: number;
  schedule: string;
  registrants: number | null;
  slots: number | null;
  crowdingLevel: PressureLevel;
  location?: string | null;
}

export interface FacilityHeatmapFacility {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  hasLiveQueueData: boolean;
  queueCount: number;
  waitingCount: number;
  inServiceCount: number;
  priorityCount: number;
  activeEventCount: number;
  highestEventLevel: PressureLevel;
  congestionLevel: PressureLevel;
  label: string;
  suggestedAction: string;
  intensity: number;
  events: FacilityHeatmapEvent[];
}

export interface FacilityHeatmapData {
  facilities: FacilityHeatmapFacility[];
  events: FacilityHeatmapEvent[];
  lastUpdated: string;
  hasLiveQueueData: boolean;
}

export interface MapFacility {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
}

/*
 * Where the facilities are.
 *
 * This was a hardcoded array of RHU 1 and RHU 2. A third facility opened
 * from Administration -> RHU Facilities appeared on every screen except
 * the map, because there was nowhere to put its coordinates and no code
 * path that would have read them.
 *
 * They live on the rhus table now and are required when a facility is
 * created. A facility still missing them -- one that predates the column
 * -- is left off the map rather than dropped at a guessed position.
 */
export const FALLBACK_FACILITIES: MapFacility[] = [
  { id: 1, name: "RHU 1 Malasiqui", latitude: 15.919664, longitude: 120.412487 },
  { id: 2, name: "RHU 2 Malasiqui (Don Pedro)", latitude: 15.945, longitude: 120.445 },
];

export async function loadMapFacilities(): Promise<MapFacility[]> {
  try {
    const rows = await getRhuFacilities();

    const mapped = rows
      .filter((row) => row.is_active !== false)
      .map((row) => ({
        id: Number(row.id),
        name: String(row.name ?? row.short_name ?? `RHU ${row.id}`),
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
      }))
      .filter(
        (row) =>
          Number.isFinite(row.latitude) &&
          Number.isFinite(row.longitude) &&
          row.latitude !== 0 &&
          row.longitude !== 0
      );

    // An empty result means every facility is missing coordinates, which
    // would render an empty map. The two known positions beat nothing.
    return mapped.length > 0 ? mapped : FALLBACK_FACILITIES;
  } catch {
    return FALLBACK_FACILITIES;
  }
}

const levelRank: Record<PressureLevel, number> = {
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

function numberOrZero(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isPriorityTicket(ticket: QueueTicket): boolean {
  const category = String(ticket.priority_category ?? "").toLowerCase();
  const level = String(ticket.priority_level ?? "").toLowerCase();

  return (
    Boolean(ticket.is_emergency) ||
    Boolean(ticket.is_senior) ||
    Boolean(ticket.is_pregnant) ||
    Boolean(ticket.is_pwd) ||
    Boolean(ticket.is_pediatric) ||
    Boolean(ticket.is_bhw_endorsed) ||
    (category !== "" && category !== "regular") ||
    ["critical", "high", "moderate"].includes(level) ||
    numberOrZero(ticket.priority_score) >= 35
  );
}

function strongerLevel(a: PressureLevel, b: PressureLevel): PressureLevel {
  return levelRank[a] >= levelRank[b] ? a : b;
}

export function getQueueCongestionLevel(
  queueCount: number,
  waitingCount: number,
  inServiceCount: number,
  priorityCount: number
): PressureLevel {
  if (waitingCount >= 51) return "critical";
  if (waitingCount >= 26) return "high";
  if (waitingCount >= 11) return "moderate";

  if (priorityCount >= 15 || (inServiceCount >= 12 && waitingCount >= 26)) {
    return "critical";
  }

  if (
    priorityCount >= 8 ||
    queueCount >= 30 ||
    (inServiceCount >= 8 && waitingCount >= 11)
  ) {
    return "high";
  }

  if (priorityCount >= 4 || inServiceCount >= 8) {
    return "moderate";
  }

  return "low";
}

export function getEventCrowdingLevel(
  registrants: number | null,
  slots: number | null
): PressureLevel {
  if (!slots || slots <= 0 || registrants === null) return "low";

  const fillRate = registrants / slots;

  if (fillRate >= 0.91) return "critical";
  if (fillRate >= 0.71) return "high";
  if (fillRate >= 0.4) return "moderate";
  return "low";
}

export function pressureLabel(level: PressureLevel): string {
  switch (level) {
    case "critical":
      return "Over Capacity";
    case "high":
      return "Heavy Queue";
    case "moderate":
      return "Moderate Queue";
    default:
      return "Low Queue";
  }
}

export function pressureAction(
  level: PressureLevel,
  priorityCount: number,
  activeEventCount: number
): string {
  if (level === "critical") return "Open another service desk";
  if (activeEventCount > 0 && ["high", "critical"].includes(level)) {
    return "Prepare crowd control for active event";
  }
  if (priorityCount > 0 && ["moderate", "high"].includes(level)) {
    return "Call priority patients first";
  }
  if (level === "high") return "Send SMS advisory";
  if (level === "moderate") return "Monitor queue and keep staff ready";
  return "Continue normal queue monitoring";
}

function sameDay(value?: string | null): boolean {
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function eventRegistrants(event: Event): number | null {
  if (event.total_registered !== undefined && event.total_registered !== null) {
    return Math.max(0, numberOrZero(event.total_registered));
  }

  if (
    event.max_slots !== undefined &&
    event.max_slots !== null &&
    event.slots_available !== undefined &&
    event.slots_available !== null
  ) {
    return Math.max(0, numberOrZero(event.max_slots) - numberOrZero(event.slots_available));
  }

  return null;
}

function eventFacility(event: Event, facilities: MapFacility[]): MapFacility {
  const rhuId = numberOrZero((event as any).rhu_id ?? (event as any).facility_id);
  return facilities.find((facility) => facility.id === rhuId) ?? facilities[0];
}

function eventCoordinates(event: Event, facility: MapFacility) {
  const latitude = Number(event.latitude);
  const longitude = Number(event.longitude);

  if (Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0) {
    return { latitude, longitude };
  }

  return {
    latitude: facility.latitude,
    longitude: facility.longitude,
  };
}

function normalizeEvent(
  event: Event,
  facilities: MapFacility[]
): FacilityHeatmapEvent | null {
  if (event.event_type === "announcement" || !sameDay(event.starts_at ?? event.event_date)) {
    return null;
  }

  const facility = eventFacility(event, facilities);
  const coordinates = eventCoordinates(event, facility);
  const registrants = eventRegistrants(event);
  const slots = event.max_slots ?? null;

  return {
    id: event.id,
    title: event.title || "Untitled event",
    facilityId: facility.id,
    facilityName: facility.name,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    schedule: event.starts_at ?? event.event_date ?? "",
    registrants,
    slots,
    crowdingLevel: getEventCrowdingLevel(registrants, slots),
    location: event.location,
  };
}

export async function fetchFacilityHeatmapData(): Promise<FacilityHeatmapData> {
  const mapFacilities = await loadMapFacilities();

  const queueResults = await Promise.allSettled(
    mapFacilities.map((facility) => getLiveQueue({ rhu_id: facility.id }))
  );

  const eventsResult = await eventsService.fetchEvents({
    status: "published",
    type: "all",
    per_page: 100,
  });

  const events = eventsResult.data
    .map((event) => normalizeEvent(event, mapFacilities))
    .filter(Boolean) as FacilityHeatmapEvent[];

  const facilities = mapFacilities.map((facility, index) => {
    const queueResult = queueResults[index];
    const hasLiveQueueData = queueResult.status === "fulfilled";
    const tickets =
      hasLiveQueueData ? queueResult.value.tickets : [];
    const waiting = tickets.filter((ticket) => ticket.status === "waiting");
    const inService = tickets.filter((ticket) =>
      ["in_service", "serving"].includes(String(ticket.status))
    );
    const priority = waiting.filter(isPriorityTicket);
    const facilityEvents = events.filter((event) => event.facilityId === facility.id);
    const highestEventLevel = facilityEvents.reduce<PressureLevel>(
      (level, event) => strongerLevel(level, event.crowdingLevel),
      "low"
    );
    const baseLevel = getQueueCongestionLevel(
      tickets.length,
      waiting.length,
      inService.length,
      priority.length
    );
    const congestionLevel = hasLiveQueueData
      ? strongerLevel(baseLevel, highestEventLevel)
      : "low";
    const intensity =
      waiting.length + priority.length * 2 + inService.length + facilityEvents.length * 8;

    return {
      ...facility,
      hasLiveQueueData,
      queueCount: tickets.length,
      waitingCount: waiting.length,
      inServiceCount: inService.length,
      priorityCount: priority.length,
      activeEventCount: facilityEvents.length,
      highestEventLevel,
      congestionLevel,
      label: pressureLabel(congestionLevel),
      suggestedAction: pressureAction(
        congestionLevel,
        priority.length,
        facilityEvents.length
      ),
      intensity,
      events: facilityEvents,
    };
  });

  return {
    facilities,
    events,
    lastUpdated: new Date().toISOString(),
    hasLiveQueueData: queueResults.some((result) => result.status === "fulfilled"),
  };
}
