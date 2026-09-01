// src/components/Toast.tsx

import type { CSSProperties } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from "lucide-react";
import type { ToastData } from "../types";

type ToastProps = {
  toast: ToastData | null;
  onClose: () => void;
};

export default function Toast({ toast, onClose }: ToastProps) {
  if (!toast) return null;

  const type = toast.type ?? "info";

  const config = {
    success: {
      icon: CheckCircle2,
      title: "Success",
      background: "#ECFDF5",
      border: "#A7F3D0",
      color: "#047857",
    },
    error: {
      icon: XCircle,
      title: "Action failed",
      background: "#FEF2F2",
      border: "#FECACA",
      color: "#B91C1C",
    },
    warning: {
      icon: AlertTriangle,
      title: "Reminder",
      background: "#FFFBEB",
      border: "#FDE68A",
      color: "#B45309",
    },
    info: {
      icon: Info,
      title: "Notice",
      background: "#EFF6FF",
      border: "#BFDBFE",
      color: "#1D4ED8",
    },
  }[type as "success" | "error" | "warning" | "info"];

  const Icon = config.icon;

  return (
    <div style={toastWrapperStyle}>
      <div
        style={{
          ...toastStyle,
          background: config.background,
          borderColor: config.border,
          color: config.color,
        }}
      >
        <div style={iconBoxStyle}>
          <Icon size={22} />
        </div>

        <div style={{ flex: 1 }}>
          <div style={toastTitleStyle}>{config.title}</div>
          <div style={toastMessageStyle}>{toast.message}</div>
        </div>

        <button type="button" onClick={onClose} style={closeButtonStyle}>
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

const toastWrapperStyle: CSSProperties = {
  position: "fixed",
  top: 24,
  right: 24,
  zIndex: 9999,
  width: "min(420px, calc(100vw - 32px))",
};

const toastStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  padding: 16,
  borderRadius: 18,
  border: "1px solid",
  boxShadow: "0 20px 45px rgba(15, 23, 42, 0.18)",
};

const iconBoxStyle: CSSProperties = {
  width: 36,
  height: 36,
  display: "grid",
  placeItems: "center",
  borderRadius: 12,
  background: "rgba(255,255,255,0.65)",
  flex: "0 0 auto",
};

const toastTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 950,
  marginBottom: 3,
};

const toastMessageStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.45,
  fontWeight: 700,
};

const closeButtonStyle: CSSProperties = {
  width: 32,
  height: 32,
  display: "grid",
  placeItems: "center",
  border: 0,
  borderRadius: 10,
  background: "rgba(255,255,255,0.7)",
  color: "inherit",
  cursor: "pointer",
};