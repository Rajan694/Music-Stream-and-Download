import { create } from "zustand";

interface AuthState {
  user: { id: string; email: string } | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  /**
   * False until the session bootstrap has run. Account pages need this to tell
   * "signed out" apart from "not checked yet" — without it every reload flashes
   * a sign-in prompt at an already-signed-in user.
   */
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

/** Helper to build an Authorized fetch with the access token attached. */
export async function authedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const { accessToken } = useAuthStore.getState();
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  return fetch(input, { ...init, headers });
}
