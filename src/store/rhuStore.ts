// src/store/rhuStore.ts
//
// The facility list, fetched once and shared by every RHU picker.
//
// Before this, four pages each carried their own hard-coded [RHU 1, RHU 2],
// so opening a third facility would have meant editing each of them. They now
// read this store, which loads from the server.

import { create } from "zustand";

import { getRhuFacilities, type RhuFacility } from "../services/rhus";

export interface RhuOption {
  id: number;
  label: string;
}

/** Shown until the list arrives, and if the request fails: the two that always existed. */
const FALLBACK: RhuOption[] = [
  { id: 1, label: "RHU 1" },
  { id: 2, label: "RHU 2" },
];

type RhuState = {
  facilities: RhuFacility[];
  options: RhuOption[];
  loaded: boolean;
  loading: boolean;
  load: (force?: boolean) => Promise<void>;
  labelFor: (rhuId: unknown) => string | null;
};

export const useRhuStore = create<RhuState>((set, get) => ({
  facilities: [],
  options: FALLBACK,
  loaded: false,
  loading: false,

  load: async (force = false) => {
    const state = get();

    if (state.loading || (state.loaded && !force)) return;

    set({ loading: true });

    try {
      const facilities = await getRhuFacilities();
      const active = facilities.filter((facility) => facility.is_active);

      set({
        facilities,
        options: active.length
          ? active.map((facility) => ({ id: facility.id, label: facility.short_name }))
          : FALLBACK,
        loaded: true,
        loading: false,
      });
    } catch {
      // Keep whatever is on screen: a picker that still offers RHU 1 and RHU 2
      // is far better than an empty one.
      set({ loaded: true, loading: false });
    }
  },

  labelFor: (rhuId: unknown) => {
    const id = Number(rhuId);

    if (!Number.isFinite(id) || id <= 0) return null;

    return get().options.find((option) => option.id === id)?.label ?? `RHU ${id}`;
  },
}));
