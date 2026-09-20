// src/hooks/useRhuOptions.ts
//
// The RHU choices for a picker. Loads the facility list the first time any
// screen asks, then serves everyone from the shared store.

import { useEffect } from "react";

import { useRhuStore, type RhuOption } from "../store/rhuStore";

export function useRhuOptions(): RhuOption[] {
  const options = useRhuStore((state) => state.options);
  const load = useRhuStore((state) => state.load);

  useEffect(() => {
    void load();
  }, [load]);

  return options;
}

/** "RHU 2" for an id, from the same list, for tables and labels. */
export function useRhuLabel(): (rhuId: unknown) => string | null {
  const labelFor = useRhuStore((state) => state.labelFor);
  const load = useRhuStore((state) => state.load);

  useEffect(() => {
    void load();
  }, [load]);

  return labelFor;
}
