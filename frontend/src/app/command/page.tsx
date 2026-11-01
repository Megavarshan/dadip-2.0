'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePoll } from '@/lib/api/client';
import type { Alert, ChannelStats, Device, Incident, Page, Report } from '@/lib/api/types';
import { Badge, Card, Empty, ErrorNote, LEVEL_TONE, MockBadge, OriginBadge, SEVERITY_TONE, Stat, Updated, ago } from '@/components/ui';

const IncidentMap = dynamic(() => import('@/components/map/incident-map'), { ssr: false, loading: () => <div className="h-[420px] animate-pulse rounded-xl bg-white/[0.03]" /> });

export default function Overview() {
  const incidents = usePoll<Page<Incident>>('incidents?status=open&limit=200');
  const pending = usePoll<Page<Alert>>('alerts?status=pending_approval&limit=20');
  const reports = usePoll<Page<Report>>('reports?status=pending&limit=5');
  const stats = usePoll<{ channels: Record<string, ChannelStats> }>('messages/stats?hours=24');
  const devices = usePoll<Device[]>('edge/devices');

  const open = incidents.data?.items || [];
  const critical = open.filter((i) => i.severity === 'critical').length;
  const channels = Object.entries(stats.data?.channels || {});
  const online = (devices.data || []).filter((d) => d.status === 'online').length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Executive overview</h1>
          <p className="text-sm text-slate-500">All figures come from the DADIP backend; demo and mock data are labelled.</p>
        </div>
        <Updated at={incidents.updatedAt} />
      </div>
      <ErrorNote error={incidents.error || stats.error} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Open incidents" value={incidents.data?.total ?? '—'} hint={`${critical} critical`} />
        <Stat label="Awaiting approval" value={pending.data?.total ?? '—'} hint="alerts held for an approver" />
        <Stat label="Unverified reports" value={reports.data?.total ?? '—'} />
        <Stat label="Messages (24 h)" value={channels.reduce((n, [, c]) => n + Object.values(c.states).reduce((a, b) => a + b, 0), 0)} hint={`${channels.length} channels used`} />
        <Stat label="Edge devices online" value={devices.data ? `${online}/${devices.data.length}` : '—'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Live incident map" subtitle="Dashed outline = demo data" className="lg:col-span-2">
          <IncidentMap incidents={open} />
        </Card>
        <Card title="Awaiting approval" actions={<Link href="/command/alerts" className="text-xs text-sky-400 hover:underline">Open</Link>}>
          {(pending.data?.items || []).length === 0 ? <Empty>No alerts waiting.</Empty> : (
            <ul className="space-y-3">
              {pending.data!.items.map((a) => (
                <li key={a.id} className="rounded-lg border border-white/[0.06] p-3">
                  <div className="flex items-center gap-2"><Badge tone={LEVEL_TONE[a.level]}>{a.level}</Badge><span className="text-[11px] text-slate-500">{ago(a.created_at)}</span></div>
                  <p className="mt-1 text-sm text-slate-200">{a.title}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{a.approval_reason}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Open incidents">
          {open.length === 0 ? <Empty>No open incidents.</Empty> : (
            <ul className="divide-y divide-white/[0.05]">
              {open.slice(0, 8).map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0"><p className="truncate text-sm text-slate-200">{i.title}</p><p className="text-[11px] text-slate-500">{i.hazard_type} · {i.region || '—'} · {ago(i.created_at)}</p></div>
                  <div className="flex shrink-0 gap-1"><Badge tone={SEVERITY_TONE[i.severity]}>{i.severity}</Badge><OriginBadge origin={i.data_origin} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Delivery, last 24 h" actions={<Link href="/command/communication" className="text-xs text-sky-400 hover:underline">Details</Link>}>
          {channels.length === 0 ? <Empty>No messages sent in the last 24 hours.</Empty> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase text-slate-500"><th className="pb-2">Channel</th><th>Delivered</th><th>Ack’d</th><th>p95</th></tr></thead>
              <tbody>
                {channels.map(([name, c]) => (
                  <tr key={name} className="border-t border-white/[0.05]">
                    <td className="py-2 text-slate-200">{name} <MockBadge isMock={c.is_mock} /></td>
                    <td className="tabular-nums text-slate-300">{c.delivery_ratio == null ? '—' : `${(c.delivery_ratio * 100).toFixed(1)}%`}</td>
                    <td className="tabular-nums text-slate-300">{c.ack_ratio == null ? '—' : `${(c.ack_ratio * 100).toFixed(0)}%`}</td>
                    <td className="tabular-nums text-slate-300">{c.latency_p95_s == null ? '—' : `${c.latency_p95_s.toFixed(2)} s`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
