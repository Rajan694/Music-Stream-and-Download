import { Link, useLocation } from "react-router";
import { usePlayerStore } from "../../stores/player.store";
import { useUIStore } from "../../stores/ui.store";
import { useAuthStore } from "../../stores/auth.store";
import { Search, ListMusic, Download, User } from "lucide-react";

const NAV = [
  { href: "/search", label: "Search", icon: Search },
  { href: "/queue", label: "Queue", icon: ListMusic },
  { href: "/downloads", label: "Downloads", icon: Download, authOnly: true },
  { href: "/profile", label: "Profile", icon: User },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const queueCount = usePlayerStore((s) => s.queue.length);
  const lastSearchQuery = useUIStore((s) => s.lastSearchQuery);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const nav = NAV.filter((item) => !item.authOnly || isAuthenticated);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const searchHref = lastSearchQuery ? `/search?q=${encodeURIComponent(lastSearchQuery)}` : '/search';

  return (
    <div className="flex h-screen flex-col lg:flex-row bg-background-0 text-zinc-100 overflow-hidden">
      <nav className="hidden lg:flex w-64 flex-col border-r border-white/5 bg-background-1 p-4 shrink-0 gap-6">
        <Link to="/search" className="px-3 text-xl font-bold tracking-tighter text-white">
          VIBE<span className="text-accent-primary">.</span>
        </Link>
        <div className="space-y-1">
          {nav.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                to={item.href === '/search' ? searchHref : item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? "bg-white/5 text-white"
                    : "text-zinc-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={18} />
                {item.label}
                {item.href === "/queue" && queueCount > 0 && (
                  <span className="ml-auto text-xs bg-white/5 px-2 py-0.5 rounded-full tabular-nums">
                    {queueCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      <main className="flex-1 relative overflow-y-auto bg-background-0">
        <div className="mx-auto max-w-6xl p-4 md:p-8">{children}</div>
      </main>

      <nav className="lg:hidden absolute bottom-0 w-full h-16 border-t border-white/5 bg-background-1/80 backdrop-blur-xl flex z-40">
        {nav.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              to={item.href === '/search' ? searchHref : item.href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${
                active ? "text-accent-primary" : "text-zinc-500"
              }`}
            >
              <Icon size={20} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}