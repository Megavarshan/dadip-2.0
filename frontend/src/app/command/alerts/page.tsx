'use client';

import { useState } from 'react';
import { api, usePoll } from '@/lib/api/client';
import type { Alert, Channel, Incident, Page } from '@/lib/api/types';
import { Badge, Card, Empty, ErrorNote, LEVEL_TONE, MockBadge, STATE_TONE, Updated, ago, btnDanger, btnGhost, btnOk, btnPrimary, fmtTime, inputCls } from '@/components/ui';

function CreateAlert({ onDone }: { onDone: () => void }) {
  const incidents = usePoll<Page<Incident>>('incidents?status=open&limit=200', 30000);
  const channels = usePoll<Channel[]>('channels', 30000);
  const [f, setF] = useState({ incident_id: '', body: '', audience: '', language: 'en', ttl_minutes: 120, level: '' });
  const [chosen, setChosen] = useState<string[]>(['mock_sms']);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setInfo(null);
    try {
      const a = await api<Alert>('alerts', { method: 'POST', body: { ...f, incident_id: f.incident_id || incidents.data?.items[0]?.id, level: f.level || null, audience: f.audience || null, channels: chosen } });
      setInfo(a.requires_approval ? `Created. Waiting for an approver: ${a.approval_reason}.` : 'Created and queued for dispatch.');
      setF({ ...f, body: '' });
      onDone();
    } catch (e) { setErr((e as Error).message); }
  }
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form onSubmit={submit} className="space-y-2">
      <select className={inputCls} value={f.incident_id} onChange={set('incident_id')} required={!incidents.data?.items.length}>
        {(incidents.data?.items || []).map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
      </select>
      <textarea className={inputCls} rows={3} required minLength={5} maxLength={1000} placeholder="Instruction to the public, e.g. Move to higher ground now." value={f.body} onChange={set('body')} />
      <div className="grid grid-cols-2 gap-2">
        <input className={inputCls} placeholder="Area (defaults to incident region)" value={f.audience} onChange={set('audience')} />
        <select className={inputCls} value={f.language} onChange={set('language')}><option value="en">English</option><option value="hi">Hindi</option><option value="ta">Tamil</option></select>
        <select className={inputCls} value={f.level} onChange={set('level')}><option value="">Level from AURA</option>{['green', 'yellow', 'orange', 'red'].map((l) => <option key={l}>{l}</option>)}</select>
        <label className="flex items-center gap-2 text-xs text-slate-400">TTL (min)<input className={inputCls} type="number" min={5} max={1440} value={f.ttl_minutes} onChange={(e) => setF({ ...f, ttl_minutes: Number(e.target.value) })} /></label>
      </div>
      <div className="flex flex-wrap gap-2">
        {(channels.data || []).filter((c) => c.enabled && c.configured).map((c) => (
          <label key={c.name} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300">
            <input type="checkbox" checked={chosen.includes(c.name)} onChange={(e) => setChosen(e.target.checked ? [...chosen, c.name] : chosen.filter((x) => x !== c.name))} />
            {c.name} <MockBadge isMock={c.is_mock} />
          </label>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">The header line is generated from a fixed phrase table (English, Hindi, Tamil); your text is sent as written, never machine-translated.</p>
      <ErrorNote error={err} />
      {info && <p className="text-sm text-emerald-300">{info}</p>}
      <button className={`${btnPrimary} w-full`} disabled={!chosen.length}>Create alert</button>
    </form>
  );
}

function AlertRow({ a, onChange }: { a: Alert; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Alert | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function act(path: string, body?: unknown) {
    setErr(null);
    try { await api(`alerts/${a.id}/${path}`, { method: 'POST', body }); onChange(); if (open) load(); } catch (e) { setErr((e as Error).message); }
  }
  async function load() { setDetail(await api<Alert>(`alerts/${a.id}`)); }
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={LEVEL_TONE[a.level]}>{a.level}</Badge>
        <Badge tone={STATE_TONE[a.status] || 'slate'}>{a.status.replace('_', ' ')}</Badge>
        {a.decision && <span className="text-[11px] text-slate-500">AURA: {a.decision}</span>}
        <span className="ml-auto text-[11px] text-slate-500">{ago(a.created_at)} · expires {fmtTime(a.expires_at)}</span>
      </div>
      <p className="mt-1 text-sm font-medium text-slate-200">{a.title}</p>
      <p className="text-sm text-slate-400">{a.body}</p>
      <p className="mt-1 text-[11px] text-slate-500">Channels: {a.channels.join(', ')}{a.approval_reason ? ` · ${a.approval_reason}` : ''}{a.rejection_reason ? ` · rejected: ${a.rejection_reason}` : ''}</p>
      <ErrorNote error={err} />
      <div className="mt-2 flex flex-wrap gap-2">
        {a.status === 'pending_approval' && <>
          <button className={btnOk} onClick={() => act('approve')}>Approve & send</button>
          <button className={btnDanger} onClick={() => { const reason = prompt('Reason for rejection'); if (reason) act('reject', { reason }); }}>Reject</button>
        </>}
        {a.status === 'dispatched' && <button className={btnGhost} onClick={() => act('cancel')}>Cancel unsent</button>}
        <button className={btnGhost} onClick={() => { setOpen(!open); if (!open) load(); }}>{open ? 'Hide' : 'Delivery'}</button>
      </div>
      {open && detail && (
        detail.messages?.length ? (
          <table className="mt-3 w-full text-xs">
            <thead><tr className="text-left text-slate-500"><th className="pb-1">Channel</th><th>Recipient</th><th>State</th><th>Attempts</th><th>Delivered</th><th>Ack</th></tr></thead>
            <tbody>{detail.messages.map((m) => (
              <tr key={m.id} className="border-t border-white/[0.05] text-slate-300">
                <td className="py-1.5">{m.channel}</td><td>{m.recipient}</td><td><Badge tone={STATE_TONE[m.state] || 'slate'}>{m.state}</Badge></td>
                <td className="tabular-nums">{m.attempts}</td><td>{fmtTime(m.delivered_at)}</td><td>{fmtTime(m.acknowledged_at)}</td>
              </tr>))}</tbody>
          </table>
        ) : <p className="mt-2 text-xs text-slate-500">No messages: nothing is sent before approval.</p>
      )}
    </li>
  );
}

export default function AlertsPage() {
  const alerts = usePoll<Page<Alert>>('alerts?limit=50');
  return (
    <>
      <div className="flex items-end justify-between">
        <div><h1 className="text-xl font-semibold">Alerts & approvals</h1><p className="text-sm text-slate-500">Approvers cannot approve alerts they created (four-eyes rule).</p></div>
        <Updated at={alerts.updatedAt} />
      </div>
      <ErrorNote error={alerts.error} />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="New alert" className="lg:col-span-2"><CreateAlert onDone={alerts.reload} /></Card>
        <Card title="Alerts" className="lg:col-span-3">
          {(alerts.data?.items || []).length === 0 ? <Empty>No alerts yet.</Empty> : (
            <ul className="divide-y divide-white/[0.05]">{alerts.data!.items.map((a) => <AlertRow key={a.id} a={a} onChange={alerts.reload} />)}</ul>
          )}
        </Card>
      </div>
    </>
  );
}
