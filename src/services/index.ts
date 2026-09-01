// src/services/index.ts
// Safe barrel exports.
// Uses namespace exports to avoid duplicate export conflicts like:
// getPatientName, HeatmapPoint, fetchBarangayRisk, fetchQueueHeatmap.

export * as analyticsService from "./analytics";
export * as announcementsService from "./announcements";
export * as appointmentsService from "./appointments";
export * as authService from "./auth";
export * as chatbotService from "./chatbot";
export * as consultationsService from "./consultations";
export * as dashboardService from "./dashboard";
export * as eventRegistrantsService from "./eventRegistrants";
export * as eventsService from "./events";
export * as heatmapService from "./heatmap";
export * as inventoryService from "./inventory";
export * as notificationsService from "./notifications";
export * as prescriptionsService from "./prescriptions";
export * as queueService from "./queue";
export * as reportsService from "./reports";
export * as smsService from "./sms";
export * as telemedicineService from "./telemedicine";
export * as usersService from "./users";

// Optional direct exports for the new notification module.
// These names do not conflict with your other services.
export {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from "./notifications";

export type {
  AppNotification,
  NotificationsResponse,
} from "./notifications";