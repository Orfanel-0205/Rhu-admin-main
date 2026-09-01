// src/hooks/useToast.ts

import { useCallback, useEffect, useRef, useState } from "react";
import type { ToastData, ToastType } from "../types";

export function useToast() {
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

      setToast({
        message,
        type,
      });

      if (duration > 0) {
        timerRef.current = window.setTimeout(() => {
          setToast(null);
          timerRef.current = null;
        }, duration);
      }
    },
    [clearTimer]
  );

  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  return {
    toast,
    show,
    hide,

    success: (message: string, duration = 3500) =>
      show(message, "success", duration),

    error: (message: string, duration = 4500) =>
      show(message, "error", duration),

    warning: (message: string, duration = 4000) =>
      show(message, "warning", duration),

    info: (message: string, duration = 3500) =>
      show(message, "info", duration),
  };
}