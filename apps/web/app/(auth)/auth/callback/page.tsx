"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ImSpinner8 } from "react-icons/im";
import { apiClient } from "../../../../lib/api";
import { useAuthStore } from "../../../../stores/auth.store";
import { readGuestHistory } from "../../../../lib/history";

/**
 * Landing point for the Google sign-in redirect.
 *
 * The API sets an HttpOnly refresh cookie and bounces here without an access
 * token in the URL — a token in the query string would end up in browser
 * history, the `Referer` header and any proxy log. This page trades the cookie
 * for an access token, then merges guest history into the account (§24).
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const merged = useRef(false);

  // Failure is derivable, not an event: once the bootstrap has run and there is
  // still no session, the exchange did not produce one. Storing that in state
  // would mean setting state from inside an effect for no benefit.
  const failed = bootstrapped && !isAuthenticated;

  useEffect(() => {
    // `SessionProvider` redeems the cookie the API just set; this page only
    // reacts to the outcome. Calling `/auth/refresh` here too would present an
    // already-rotated token and trip the reuse alarm.
    if (!bootstrapped || !isAuthenticated || merged.current) return;
    merged.current = true;

    (async () => {
      // Anything played before signing in belongs to this account now (§24).
      const guestHistory = readGuestHistory();
      if (guestHistory.length > 0) {
        await apiClient.syncHistory(guestHistory).catch(() => {
          // A failed merge must not block sign-in; the local copy survives.
        });
      }
      router.replace("/search");
    })();
  }, [bootstrapped, isAuthenticated, router]);

  if (failed) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold tracking-tight">Sign-in failed</h1>
          <p className="text-sm text-zinc-500">
            Google did not return a usable session. Please try again.
          </p>
          <Link
            href="/login"
            className="inline-block px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <ImSpinner8 className="animate-spin h-8 w-8 text-blue-500 mx-auto" />
        <p className="text-sm text-zinc-500">Completing sign-in…</p>
      </div>
    </div>
  );
}
