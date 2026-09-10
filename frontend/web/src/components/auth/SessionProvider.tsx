import { useEffect, useRef } from "react";
import { apiClient } from "../../lib/api";
import { useAuthStore } from "../../stores/auth.store";
import { usePreferencesStore } from "../../stores/preferences.store";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const setAuth = useAuthStore((s) => s.setAuth);
  const setBootstrapped = useAuthStore((s) => s.setBootstrapped);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        const { accessToken } = await apiClient.refresh();
        setAuth(null, accessToken);
        setAuth(await apiClient.me(), accessToken);
        await usePreferencesStore.getState().hydrateFromServer();
      } catch {
        // No cookie, or it expired — carry on as a guest.
      } finally {
        setBootstrapped();
      }
    })();
  }, [setAuth, setBootstrapped]);

  return <>{children}</>;
}