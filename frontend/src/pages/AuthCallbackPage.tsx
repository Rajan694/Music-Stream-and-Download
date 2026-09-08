import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuthStore } from "../stores/auth.store";
import { readGuestHistory } from "../lib/history";
import { Spinner } from "../components/ui/States";

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);

  useEffect(() => {
    if (bootstrapped && !isAuthenticated) {
      const local = readGuestHistory();
      if (local.length > 0) {
        // Could sync here
      }
      navigate("/search");
    }
  }, [bootstrapped, isAuthenticated, navigate]);

  if (!bootstrapped) return <Spinner label="Completing sign in…" />;

  return null;
}