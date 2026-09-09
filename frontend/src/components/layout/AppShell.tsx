import { Link, useLocation } from "react-router";
import { usePlayerStore } from "../../stores/player.store";

const NAV = [
  { href: "/search", label: "Search" },
  { href: "/queue", label: "Queue" },
  { href: "/downloads", label: "Downloads" },
  { href: "/profile", label: "Profile" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const queueCount = usePlayerStore((s) => s.queue.length);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex h-screen flex-col lg:flex-row overflow-hidden bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50 transition-colors">
      <nav className="hidden lg:flex w-64 flex-col border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 p-4 shrink-0">
        <Link
          to="/search"
          className="mb-8 px-2 font-bold text-xl tracking-tight"
        >
          StreamMusic
        </Link>

        <div className="space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? "bg-zinc-200 dark:bg-zinc-800"
                  : "hover:bg-zinc-200 dark:hover:bg-zinc-800"
              }`}
            >
              <span>{item.label}</span>
              {item.href === "/queue" && queueCount > 0 && (
                <span className="text-xs tabular-nums text-zinc-500">
                  {queueCount}
                </span>
              )}
            </Link>
          ))}
        </div>
      </nav>

      <main className="flex-1 relative overflow-y-auto pb-24 lg:pb-20">
        <div className="mx-auto max-w-6xl p-4 md:p-6 lg:p-8">{children}</div>
      </main>

      <nav className="lg:hidden absolute bottom-0 w-full h-16 border-t border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/90 backdrop-blur flex z-40">
        {NAV.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={`flex-1 flex items-center justify-center font-medium text-xs ${
              isActive(item.href) ? "text-blue-600 dark:text-blue-400" : ""
            }`}
          >
            {item.label}
            {item.href === "/queue" && queueCount > 0 && (
              <span className="ml-1 tabular-nums text-zinc-500">
                {queueCount}
              </span>
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
}