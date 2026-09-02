"use client";

import { useEffect, useRef } from "react";
import { apiClient } from "../../lib/api";
import { useAuthStore } from "../../stores/auth.store";

/**
 * Restores the session on load.
 *
 * The access token is held in memory only (never localStorage), so a reload
 * drops it. The refresh cookie is what actually carries the session, and this
 * is the single place that redeems it — refresh tokens rotate and reuse trips
 * a family-wide revocation, so two components calling `/auth/refresh` on the
 * same load would log the user straight back out.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const setAuth = useAuthStore((s) => s.setAuth);
  const setBootstrapped = useAuthStore((s) => s.setBootstrapped);
  const started = useRef(false);

  useEffect(() => {
    // StrictMode runs effects twice in development; a second exchange would
    // present the token this one just rotated.
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        const { accessToken } = await apiClient.refresh();
        setAuth(null, accessToken);
        setAuth(await apiClient.me(), accessToken);
      } catch {
        // No cookie, or it expired — carry on as a guest.
      } finally {
        setBootstrapped();
      }
    })();
  }, [setAuth, setBootstrapped]);

  return <>{children}</>;
}
