// src/hooks/useQueue.ts
import { useEffect, useState } from "react";

interface UseQueueOptions {
  initial?: number;
  autoAdvanceMs?: number | null;
}

export function useQueue({
  initial = 1,
  autoAdvanceMs = null,
}: UseQueueOptions = {}) {
  const [currentServing, setCurrentServing] = useState(initial);

  useEffect(() => {
    if (!autoAdvanceMs) return;

    const interval = window.setInterval(() => {
      setCurrentServing((current) => current + 1);
    }, autoAdvanceMs);

    return () => window.clearInterval(interval);
  }, [autoAdvanceMs]);

  const callNext = () => setCurrentServing((current) => current + 1);
  const reset = () => setCurrentServing(initial);

  return {
    currentServing,
    callNext,
    reset,
  };
}