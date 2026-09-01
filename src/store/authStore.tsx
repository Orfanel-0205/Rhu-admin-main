// src/store/authStore.tsx

import { create } from "zustand";
import type { ReactNode } from "react";
import type {
  AdminUser,
  Capability,
  AdminRole,
} from "../types/cms";

const TOKEN_KEY = "ka_agapay_token";
const USER_KEY = "ka_agapay_user";

function loadPersistedUser(): AdminUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AdminUser) : null;
  } catch {
    return null;
  }
}

function loadPersistedToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

interface AuthState {
  user: AdminUser | null;
  token: string | null;
  hydrated: boolean;

  hydrate: () => void;
  setAuth: (user: AdminUser, token: string) => void;
  patchUser: (patch: Partial<AdminUser>) => void;
  clearAuth: () => void;
  logout: () => void;

  isAuthenticated: boolean;
  currentUser: () => AdminUser | null;
  hasRole: (role: AdminRole) => boolean;
  hasCapability: (cap: Capability) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: loadPersistedUser(),
  token: loadPersistedToken(),
  hydrated: false,

  hydrate: () => {
    const user = loadPersistedUser();
    const token = loadPersistedToken();

    set({
      user,
      token,
      hydrated: true,
      isAuthenticated: !!token && !!user,
    });
  },

  setAuth: (user, token) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));

    set({
      user,
      token,
      isAuthenticated: true,
      hydrated: true,
    });
  },

  /**
   * Merge a partial update into the cached user. Writes through to the SAME
   * localStorage key setAuth uses, so a flag flipped in this tab (e.g.
   * has_seen_onboarding) survives a page refresh instead of coming back stale
   * and re-triggering.
   */
  patchUser: (patch) => {
    const current = get().user;

    if (!current) {
      return;
    }

    const next = { ...current, ...patch };

    try {
      localStorage.setItem(USER_KEY, JSON.stringify(next));
    } catch {
      // Private browsing can reject writes; in-memory state is still updated.
    }

    set({ user: next });
  },

  clearAuth: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);

    set({
      user: null,
      token: null,
      isAuthenticated: false,
      hydrated: true,
    });
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);

    set({
      user: null,
      token: null,
      isAuthenticated: false,
      hydrated: true,
    });
  },

  isAuthenticated: !!loadPersistedToken() && !!loadPersistedUser(),

  currentUser: () => get().user,

  hasRole: (role) => get().user?.role === role,

  hasCapability: (cap) => {
    const capabilities = get().user?.capabilities ?? [];

    return (
      capabilities.includes("full_access") ||
      capabilities.includes(cap)
    );
  },
}));

export const useAuth = useAuthStore;

export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}