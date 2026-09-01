// src/contexts/ToastContext.tsx
// Global toast provider — mount once in App.tsx, consume anywhere via useToast().

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import Toast from "../components/Toast";
import { registerToastListener } from "../lib/toastBus";
import type { ToastData, ToastType } from "../types";

interface ToastContextValue {
  show: (message: string, type?: ToastType, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  hide: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const show = useCallback(
    (message: string, type: ToastType = "info", duration = 3500) => {
      clearTimer();
      setToast({ message, type });
      if (duration > 0) {
        timerRef.current = window.setTimeout(() => {
          setToast(null);
          timerRef.current = null;
        }, duration);
      }
    },
    [clearTimer]
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  // Let non-React code (axios interceptor, services) raise toasts through this
  // same provider via emitToast(). Registered once for the provider's lifetime.
  useEffect(() => {
    registerToastListener((message, type, duration) => show(message, type, duration));
    return () => registerToastListener(null);
  }, [show]);

  const value: ToastContextValue = {
    show,
    hide,
    success: (msg, dur = 3500) => show(msg, "success", dur),
    error: (msg, dur = 4500) => show(msg, "error", dur),
    warning: (msg, dur = 4000) => show(msg, "warning", dur),
    info: (msg, dur = 3500) => show(msg, "info", dur),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toast toast={toast} onClose={hide} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return ctx;
}
