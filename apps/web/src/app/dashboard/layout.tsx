'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/icon';

type NavItem = { href: string; label: string; icon: IconName };

/**
 * Grouped navigation. Every dashboard route is reachable from here — the
 * previous sidebar exposed only 6 of 13 pages, leaving the rest discoverable
 * solely through a button grid on the home page.
 */
const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Home', icon: 'home' },
      { href: '/dashboard/graph', label: 'Knowledge graph', icon: 'graph' },
      { href: '/dashboard/timeline', label: 'Timeline', icon: 'timeline' },
    ],
  },
  {
    label: 'Learn',
    items: [
      { href: '/dashboard/session', label: 'Focus session', icon: 'play' },
      { href: '/dashboard/paths', label: 'Learning paths', icon: 'path' },
      { href: '/dashboard/assessment', label: 'Assessment', icon: 'pen' },
      { href: '/dashboard/quiz', label: 'Context quiz', icon: 'quiz' },
    ],
  },
  {
    label: 'Progress',
    items: [
      { href: '/dashboard/projects', label: 'Projects', icon: 'folder' },
      { href: '/dashboard/interview', label: 'Interview prep', icon: 'target' },
      { href: '/dashboard/history', label: 'History', icon: 'clock' },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/dashboard/mentor', label: 'AI mentor', icon: 'chat' },
      { href: '/dashboard/groups', label: 'Study groups', icon: 'users' },
    ],
  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Escape closes the mobile drawer.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  const toggleDark = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    setDark(next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  const signOut = () => {
    localStorage.clear();
    router.push('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-900/20 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed z-50 flex h-full w-60 flex-col border-r bg-surface transition-transform duration-200 ease-out md:static md:z-auto md:translate-x-0 dark:bg-dark-surface ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 shrink-0 items-center px-5">
          <Link href="/dashboard" className="text-sm font-semibold tracking-tight">
            edOS
          </Link>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 pb-4">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="eyebrow px-2.5 pb-1.5">{group.label}</p>
              <div className="space-y-px">
                {group.items.map((item) => (
                  <NavLink key={item.href} item={item} active={pathname === item.href} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 space-y-px border-t px-2.5 py-3">
          <NavLink
            item={{ href: '/dashboard/settings', label: 'Settings', icon: 'gear' }}
            active={pathname === '/dashboard/settings'}
          />
          <button type="button" onClick={toggleDark} className={rowClass(false)}>
            <Icon name={dark ? 'sun' : 'moon'} className="h-4 w-4 shrink-0 opacity-60" />
            {dark ? 'Light mode' : 'Dark mode'}
          </button>
          <button type="button" onClick={signOut} className={rowClass(false)}>
            <Icon name="logout" className="h-4 w-4 shrink-0 opacity-60" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-surface px-4 md:hidden dark:bg-dark-surface">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="btn-ghost -ml-1.5 px-2"
            aria-label="Open navigation"
            aria-expanded={sidebarOpen}
          >
            <Icon name="menu" className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold tracking-tight">edOS</span>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

function rowClass(active: boolean) {
  const base =
    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors';
  return active
    ? `${base} bg-gray-100 font-medium text-gray-900 dark:bg-dark-tertiary dark:text-gray-100`
    : `${base} text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-dark-tertiary dark:hover:text-gray-100`;
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={rowClass(active)}
      aria-current={active ? 'page' : undefined}
    >
      <Icon name={item.icon} className="h-4 w-4 shrink-0 opacity-60" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
