import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export function Card({ title, subtitle, actions, children, className }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-white/[0.07] bg-[#0b1426] p-5', className)}>
      {(title || actions) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-100">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

const TONES: Record<string, string> = {
  red: 'bg-red-500/15 text-red-300 border-red-500/30',
  orange: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  yellow: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  green: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  blue: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  violet: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  slate: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

export function Badge({ tone = 'slate', children, title }: { tone?: keyof typeof TONES | string; children: ReactNode; title?: string }) {
  return <span title={title} className={cn('inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium', TONES[tone] || TONES.slate)}>{children}</span>;
}

export const SEVERITY_TONE: Record<string, string> = { critical: 'red', high: 'orange', moderate: 'yellow', low: 'green' };
export const LEVEL_TONE: Record<string, string> = { red: 'red', orange: 'orange', yellow: 'yellow', green: 'green' };
export const DECISION_TONE: Record<string, string> = { execute: 'green', defer: 'yellow', abstain: 'red' };
export const STATE_TONE: Record<string, string> = {
  acknowledged: 'green', delivered: 'green', dispatched: 'blue', approved: 'blue', queued: 'slate', dispatching: 'blue',
  retry_scheduled: 'yellow', pending_approval: 'yellow', failed: 'red', expired: 'red', rejected: 'red', cancelled: 'slate',
  duplicate_suppressed: 'violet', pending: 'yellow', verified: 'green', dismissed: 'slate', responded: 'blue',
  online: 'green', offline: 'red', unknown: 'slate',
};

const ORIGIN_TEXT: Record<string, string> = {
  live: 'Live feed', report: 'Citizen report', manual: 'Operator entry', demo: 'Demo data', simulated: 'Simulated',
};

/** Every incident shows where its data came from. Demo and simulated data are never shown as live. */
export function OriginBadge({ origin }: { origin: string }) {
  const tone = origin === 'demo' || origin === 'simulated' ? 'violet' : origin === 'live' ? 'green' : 'slate';
  return <Badge tone={tone} title="Data provenance">{ORIGIN_TEXT[origin] || origin}</Badge>;
}

export function MockBadge({ isMock, configured = true }: { isMock: boolean; configured?: boolean }) {
  if (!configured) return <Badge tone="slate" title="No credentials or settings: the dispatcher cannot use this channel">NOT CONFIGURED</Badge>;
  return isMock
    ? <Badge tone="violet" title="Mock channel: no real network or provider is involved">MOCK</Badge>
    : <Badge tone="blue" title="Real channel">REAL</Badge>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0b1426] p-4">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-100 tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">{children}</p>;
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>;
}

export function Updated({ at }: { at: Date | null }) {
  return <span className="text-[11px] text-slate-500">{at ? `Updated ${at.toLocaleTimeString()} · refreshes every 5 s` : 'Loading…'}</span>;
}

export const inputCls = 'w-full rounded-lg border border-white/10 bg-[#070e1d] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500/60 focus:outline-none';
export const btnCls = 'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50';
export const btnPrimary = `${btnCls} bg-sky-600 text-white hover:bg-sky-500`;
export const btnGhost = `${btnCls} border border-white/10 text-slate-300 hover:bg-white/5`;
export const btnDanger = `${btnCls} border border-red-500/30 text-red-300 hover:bg-red-500/10`;
export const btnOk = `${btnCls} bg-emerald-600 text-white hover:bg-emerald-500`;

export function fmtTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' });
}

export function ago(iso: string | null | undefined) {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.max(0, s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
