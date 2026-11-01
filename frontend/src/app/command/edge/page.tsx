'use client';

import { usePoll } from '@/lib/api/client';
import type { Device, EdgeEvent } from '@/lib/api/types';
import { Badge, Card, Empty, ErrorNote, STATE_TONE, Updated, ago } from '@/components/ui';

export default function EdgePage() {
  const devices = usePoll<Device[]>('edge/devices');
  const events = usePoll<EdgeEvent[]>('edge/events?limit=50');
  return (
    <>
      <div className="flex items-end justify-between">
        <div><h1 className="text-xl font-semibold">Edge devices</h1><p className="text-sm text-slate-500">Status is reported by devices over MQTT; “offline” comes from the broker’s last-will message.</p></div>
        <Updated at={devices.updatedAt} />
      </div>
      <ErrorNote error={devices.error} />
      <Card title="Devices">
        {(devices.data || []).length === 0 ? <Empty>No device has connected yet. Start one with <code className="text-slate-300">dadip-edge --device-id …</code></Empty> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase text-slate-500"><th className="pb-2">Device</th><th>Area</th><th>Status</th><th>Queued on device</th><th>Last seen</th></tr></thead>
            <tbody>{devices.data!.map((d) => (
              <tr key={d.id} className="border-t border-white/[0.05]">
                <td className="py-2 text-slate-200">{d.id}</td><td className="text-slate-400">{d.region || '—'}</td>
                <td><Badge tone={STATE_TONE[d.status] || 'slate'}>{d.status}</Badge></td>
                <td className="tabular-nums text-slate-300">{d.queue_depth}</td><td className="text-slate-400">{ago(d.last_seen_at)}</td>
              </tr>))}</tbody>
          </table>
        )}
      </Card>
      <Card title="Events received" subtitle="De-duplicated by device-generated event id">
        {(events.data || []).length === 0 ? <Empty>No events yet.</Empty> : (
          <table className="w-full text-xs">
            <thead><tr className="text-left text-slate-500"><th className="pb-1">Received</th><th>Created on device</th><th>Device</th><th>Kind</th><th>Payload</th></tr></thead>
            <tbody>{events.data!.map((e) => (
              <tr key={e.id} className="border-t border-white/[0.05] text-slate-300">
                <td className="py-1.5">{ago(e.received_at)}</td><td>{ago(e.created_at_device)}</td><td>{e.device_id}</td>
                <td><Badge tone={e.kind === 'local_alarm' ? 'red' : 'slate'}>{e.kind}</Badge></td>
                <td className="max-w-[320px] truncate font-mono text-[11px] text-slate-500">{JSON.stringify(e.payload)}</td>
              </tr>))}</tbody>
          </table>
        )}
      </Card>
    </>
  );
}
