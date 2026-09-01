// src/store/queueStore.tsx

import { create } from "zustand";
import type {
  AdminUser,
  Capability,
  AdminRole,
} from "../types/cms";

import type { ReactNode } from "react";

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

interface AuthState {
  user: AdminUser | null;
  token: string | null;

  setAuth: (user: AdminUser, token: string) => void;
  clearAuth: () => void;
  logout: () => void;

  isAuthenticated: () => boolean;
  currentUser: () => AdminUser | null;
  hasRole: (role: AdminRole) => boolean;
  hasCapability: (cap: Capability) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: loadPersistedUser(),
  token: localStorage.getItem(TOKEN_KEY),

  setAuth: (user, token) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));

    set({
      user,
      token,
    });
  },

  clearAuth: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);

    set({
      user: null,
      token: null,
    });
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);

    set({
      user: null,
      token: null,
    });
  },

  isAuthenticated: () => {
    const { token, user } = get();
    return !!token && !!user;
  },

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

/**
 * Compatibility hook
 */
export const useAuth = useAuthStore;

/**
 * Compatibility provider for old imports.
 * Zustand doesn't require a provider.
 */
export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}