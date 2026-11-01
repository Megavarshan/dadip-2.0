import Link from 'next/link';
import { cookies } from 'next/headers';
import { ROLE_COOKIE } from '@/lib/api/config';
import { CommandNav, SignOut } from './nav';

export default async function CommandLayout({ children }: { children: React.ReactNode }) {
  const role = (await cookies()).get(ROLE_COOKIE)?.value || 'operator';
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-white/[0.06] bg-[#070d1b] p-4 md:flex">
        <Link href="/command" className="mb-6 px-2">
          <p className="text-sm font-semibold text-slate-100">DADIP 2.0</p>
          <p className="text-[11px] text-slate-500">Disaster Command Centre</p>
        </Link>
        <CommandNav role={role} />
        <div className="mt-auto space-y-2 px-2">
          <p className="text-[11px] text-slate-500">Signed in as <span className="text-slate-300">{role}</span></p>
          <SignOut />
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="border-b border-white/[0.06] p-3 md:hidden"><CommandNav role={role} compact /></div>
        <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
