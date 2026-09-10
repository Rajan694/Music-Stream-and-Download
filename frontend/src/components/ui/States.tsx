import { Link } from "react-router";
import { Loader2, AlertCircle } from "lucide-react";

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="py-12 flex flex-col items-center gap-3 text-zinc-500">
      <Loader2 className="animate-spin h-8 w-8 text-accent-primary" />
      {label && <p className="text-sm font-medium">{label}</p>}
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
    <div className="py-8 px-6 text-center text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-2xl border border-red-200 dark:border-red-500/20 max-w-sm mx-auto">
      <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-80" />
      <p className="font-semibold text-lg">{title}</p>
      {message && <p className="text-sm mt-2 opacity-80">{message}</p>}
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
    <div className="py-16 text-center space-y-4 max-w-sm mx-auto">
      <div className="w-16 h-16 mx-auto bg-zinc-100 dark:bg-white/5 rounded-2xl flex items-center justify-center border border-zinc-200 dark:border-white/10 mb-6">
        <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-white/10" />
      </div>
      <p className="font-semibold text-lg text-zinc-900 dark:text-zinc-100">{title}</p>
      {message && <p className="text-sm text-zinc-500 leading-relaxed">{message}</p>}
      {action && (
        <div className="pt-2">
          <Link
            to={action.href}
            className="inline-block px-5 py-2.5 rounded-xl bg-accent-primary text-white text-sm font-medium hover:opacity-90 transition-opacity shadow-lg shadow-accent-primary/20"
          >
            {action.label}
          </Link>
        </div>
      )}
    </div>
  );
}

export function SignInRequired({ what }: { what: string }) {
  return (
    <EmptyState
      title={`Sign in to see your ${what}`}
      message="Guest playback works without an account, but this is stored against your profile."
      action={{ href: "/login", label: "Sign in" }}
    />
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 py-2 animate-pulse">
      <div className="w-12 h-12 rounded-lg bg-zinc-200 dark:bg-white/5" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-zinc-200 dark:bg-white/5 rounded w-1/3" />
        <div className="h-3 bg-zinc-100 dark:bg-white/5 rounded w-1/4" />
      </div>
    </div>
  );
}