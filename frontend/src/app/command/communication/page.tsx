'use client';

import { useState } from 'react';
import { api, usePoll } from '@/lib/api/client';
import type { Channel, ChannelStats, MessageBrief, Page } from '@/lib/api/types';
import { Badge, Card, Empty, ErrorNote, MockBadge, STATE_TONE, Updated, ago, btnGhost } from '@/components/ui';

export default function CommunicationPage() {
  const [hours, setHours] = useState(24);
  const stats = usePoll<{ channels: Record<string, ChannelStats>; note: string }>(`messages/stats?hours=${hours}`);
  const channels = usePoll<Channel[]>('channels');
  const messages = usePoll<Page<MessageBrief>>('messages?limit=50');
  const [err, setErr] = useState<string | null>(null);

  async function toggle(c: Channel) {
    setErr(null);
    try { await api(`channels/${c.name}`, { method: 'PATCH', body: { enabled: !c.enabled } }); channels.reload(); }
    catch (e) { setErr((e as Error).message); }
  }
  const rows = Object.entries(stats.data?.channels || {});
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-xl font-semibold">Communication monitoring</h1><p className="text-sm text-slate-500">{stats.data?.note}</p></div>
        <div className="flex items-center gap-2">
          {[1, 24, 168].map((h) => <button key={h} onClick={() => setHours(h)} className={`${btnGhost} ${hours === h ? 'border-sky-500/50 text-sky-300' : ''}`}>{h === 168 ? '7 d' : `${h} h`}</button>)}
          <Updated at={stats.updatedAt} />
        </div>
      </div>
      <ErrorNote error={stats.error || err} />
      <Card title="Delivery by channel" subtitle="Computed from recorded messages and attempts. MOCK channels involve no real provider.">
        {rows.length === 0 ? <Empty>No messages in this window.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase text-slate-500"><th className="pb-2">Channel</th><th>States</th><th>Delivery</th><th>Ack</th><th>p50</th><th>p95</th><th>Attempts / delivered</th></tr></thead>
              <tbody>{rows.map(([name, c]) => (
                <tr key={name} className="border-t border-white/[0.05] align-top">
                  <td className="py-2 text-slate-200">{name} <MockBadge isMock={c.is_mock} /></td>
                  <td className="py-2"><div className="flex flex-wrap gap-1">{Object.entries(c.states).map(([s, n]) => <Badge key={s} tone={STATE_TONE[s] || 'slate'}>{s} {n}</Badge>)}</div></td>
                  <td className="tabular-nums">{c.delivery_ratio == null ? '—' : `${(c.delivery_ratio * 100).toFixed(1)}%`}</td>
                  <td className="tabular-nums">{c.ack_ratio == null ? '—' : `${(c.ack_ratio * 100).toFixed(0)}%`}</td>
                  <td className="tabular-nums">{c.latency_p50_s == null ? '—' : `${c.latency_p50_s.toFixed(2)} s`}</td>
                  <td className="tabular-nums">{c.latency_p95_s == null ? '—' : `${c.latency_p95_s.toFixed(2)} s`}</td>
                  <td className="tabular-nums">{c.avg_attempts_delivered ?? '—'}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Channels" subtitle="Disabled channels hold their messages in the outbox (admin only)">
          <ul className="space-y-2">{(channels.data || []).map((c) => (
            <li key={c.name} className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-200">{c.name} <MockBadge isMock={c.is_mock} configured={c.configured} /></span>
              {c.configured
                ? <button className={btnGhost} onClick={() => toggle(c)}>{c.enabled ? 'Enabled' : 'Disabled'}</button>
                : <span className="text-[11px] text-slate-500">needs credentials</span>}
            </li>))}</ul>
        </Card>
        <Card title="Recent messages" className="lg:col-span-2">
          {(messages.data?.items || []).length === 0 ? <Empty>No messages yet.</Empty> : (
            <table className="w-full text-xs">
              <thead><tr className="text-left text-slate-500"><th className="pb-1">Created</th><th>Channel</th><th>Priority</th><th>State</th><th>Attempts</th><th>Last error</th></tr></thead>
              <tbody>{messages.data!.items.map((m) => (
                <tr key={m.id} className="border-t border-white/[0.05] text-slate-300">
                  <td className="py-1.5">{ago(m.created_at)}</td><td>{m.channel}</td><td className="tabular-nums">{m.priority}</td>
                  <td><Badge tone={STATE_TONE[m.state] || 'slate'}>{m.state}</Badge></td><td className="tabular-nums">{m.attempts}</td>
                  <td className="max-w-[200px] truncate text-slate-500">{m.last_error || ''}</td>
                </tr>))}</tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
