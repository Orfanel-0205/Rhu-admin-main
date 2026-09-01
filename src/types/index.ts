// src/types/index.ts
export interface User {
  id: number;
  name: string;
  role: "patient" | "doctor" | "nurse" | "admin";
  email: string;
  phone: string;
  status: "active" | "inactive";
  joined: string;
}

export interface Appointment {
  id: string;
  patient: string;
  doctor: string;
  date: string;
  time: string;
  service: string;
  status: "confirmed" | "pending" | "cancelled";
}

export interface InventoryItem {
  id: number;
  name: string;
  cat: string;
  qty: number;
  unit: string;
  expiry: string;
  reorder: number;
  status: "ok" | "low" | "out" | "expiring";
}

export interface Announcement {
  id: number;
  title: string;
  type: string;
  status: "published" | "draft";
  date: string;
  author: string;
  body: string;
}

export interface QueueStation {
  station: string;
  serving: number;
  waiting: number;
  priority: number;
  avgWait: string;
}

export interface NavItem {
  href: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  badge?: number;
}

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastData {
  message: string;
  type: ToastType;
}
