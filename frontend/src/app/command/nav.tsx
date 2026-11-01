'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/command', label: 'Overview' },
  { href: '/command/incidents', label: 'Incidents & AURA' },
  { href: '/command/alerts', label: 'Alerts & approvals' },
  { href: '/command/communication', label: 'Communication' },
  { href: '/command/edge', label: 'Edge devices' },
  { href: '/command/research', label: 'Experiments' },
  { href: '/command/audit', label: 'Audit log', admin: true },
];

export function CommandNav({ role, compact }: { role: string; compact?: boolean }) {
  const path = usePathname();
  return (
    <nav className={cn(compact ? 'flex gap-1 overflow-x-auto' : 'space-y-1')}>
      {LINKS.filter((l) => !l.admin || role === 'admin').map((l) => {
        const active = l.href === '/command' ? path === l.href : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={cn('block whitespace-nowrap rounded-lg px-3 py-2 text-sm transition',
            active ? 'bg-sky-500/15 text-sky-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200')}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SignOut() {
  const router = useRouter();
  return (
    <button className="text-xs text-slate-400 hover:text-slate-200" onClick={async () => {
      await fetch('/api/session', { method: 'DELETE' });
      router.push('/login');
      router.refresh();
    }}>Sign out</button>
  );
}
