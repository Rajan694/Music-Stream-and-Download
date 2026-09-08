import { create } from "zustand";

interface AuthState {
  user: { id: string; email: string } | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  bootstrapped: boolean;
  setAuth: (
    user: { id: string; email: string } | null,
    token: string | null,
  ) => void;
  setBootstrapped: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  bootstrapped: false,
  setAuth: (user, accessToken) =>
    set({ user, accessToken, isAuthenticated: !!user && !!accessToken }),
  setBootstrapped: () => set({ bootstrapped: true }),
  logout: () => set({ user: null, accessToken: null, isAuthenticated: false }),
}));

export async function authedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const { accessToken } = useAuthStore.getState();
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  return fetch(input, { ...init, headers });
}