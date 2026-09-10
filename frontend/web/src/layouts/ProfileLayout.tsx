import { Link, Outlet, useLocation } from 'react-router';

const TABS = [
  { href: '/profile', label: 'Overview' },
  { href: '/profile/history', label: 'History' },
  { href: '/profile/playlists', label: 'Playlists' },
];

export function ProfileLayout() {
  const { pathname } = useLocation();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Profile</h1>

      <nav className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map((tab) => {
          const active = tab.href === '/profile' ? pathname === tab.href : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              to={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                active
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div>
        <Outlet />
      </div>
    </div>
  );
}
