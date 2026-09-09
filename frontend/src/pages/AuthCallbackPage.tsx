import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuthStore } from "../stores/auth.store";
import { Spinner } from "../components/ui/States";

/**
 * Google redirects here after setting the refresh cookie. SessionProvider does
 * the actual exchange on page load; this route just waits for that to settle and
 * then gets out of the way — signed in or not.
 */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);

  useEffect(() => {
    if (!bootstrapped) return;
    navigate(isAuthenticated ? "/search" : "/login?error=oauth", {
      replace: true,
    });
  }, [bootstrapped, isAuthenticated, navigate]);

  return <Spinner label="Completing sign in…" />;
}
