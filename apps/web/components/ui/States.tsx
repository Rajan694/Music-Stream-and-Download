import Link from "next/link";
import { ImSpinner8 } from "react-icons/im";

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="py-12 flex flex-col items-center gap-3 text-zinc-500">
      <ImSpinner8 className="animate-spin h-8 w-8 text-blue-500" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}

export function ErrorState({
  title,
  message,
}: {
  title: string;
  message?: string;
}) {
  return (
    <div className="py-8 px-4 text-center text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/20">
      <p className="font-semibold">{title}</p>
      {message && <p className="text-sm mt-1 opacity-80">{message}</p>}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="py-16 text-center space-y-3">
      <p className="font-semibold text-zinc-700 dark:text-zinc-300">{title}</p>
      {message && <p className="text-sm text-zinc-500">{message}</p>}
      {action && (
        <Link
          href={action.href}
          className="inline-block mt-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** Prompt shown on account-only pages when nobody is signed in. */
export function SignInRequired({ what }: { what: string }) {
  return (
    <EmptyState
      title={`Sign in to see your ${what}`}
      message="Guest playback works without an account, but this is stored against your profile."
      action={{ href: "/login", label: "Sign in" }}
    />
  );
}
