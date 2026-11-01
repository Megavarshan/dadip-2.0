'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { btnPrimary, ErrorNote, inputCls } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get('next') || '/command';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(typeof data.detail === 'string' ? data.detail : 'Login failed');
    if (data.user.role === 'citizen') return setError('This account is a citizen account. The command centre is for operators, approvers and administrators.');
    router.push(next.startsWith('/') ? next : '/command');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-white/[0.07] bg-[#0b1426] p-7">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">DADIP Command Centre</h1>
        <p className="mt-1 text-xs text-slate-500">Sign in with an operator, approver or administrator account.</p>
      </div>
      <label className="block space-y-1 text-xs text-slate-400">Email
        <input className={inputCls} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="block space-y-1 text-xs text-slate-400">Password
        <input className={inputCls} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <ErrorNote error={error} />
      <button className={`${btnPrimary} w-full`} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <p className="text-center text-xs text-slate-500">Citizens: <Link href="/public" className="text-sky-400 hover:underline">report an incident without an account</Link></p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Suspense><LoginForm /></Suspense>
    </main>
  );
}
