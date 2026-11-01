'use client';

import { usePoll } from '@/lib/api/client';
import type { AuditEvent, Page } from '@/lib/api/types';
import { Card, Empty, ErrorNote, Updated, fmtTime } from '@/components/ui';

export default function AuditPage() {
  const audit = usePoll<Page<AuditEvent>>('audit?limit=200', 10000);
  return (
    <>
      <div className="flex items-end justify-between"><h1 className="text-xl font-semibold">Audit log</h1><Updated at={audit.updatedAt} /></div>
      <ErrorNote error={audit.error} />
      <Card title={`${audit.data?.total ?? '—'} events`} subtitle="Every state-changing action is written in the same database transaction as the change itself">
        {(audit.data?.items || []).length === 0 ? <Empty>No events.</Empty> : (
          <table className="w-full text-xs">
            <thead><tr className="text-left text-slate-500"><th className="pb-1">Time</th><th>Action</th><th>Resource</th><th>Actor</th><th>Details</th></tr></thead>
            <tbody>{audit.data!.items.map((e) => (
              <tr key={e.id} className="border-t border-white/[0.05] text-slate-300">
                <td className="whitespace-nowrap py-1.5">{fmtTime(e.created_at)}</td><td className="font-medium">{e.action}</td>
                <td>{e.resource_type}{e.resource_id ? ` ${e.resource_id.slice(0, 8)}` : ''}</td><td className="text-slate-500">{e.actor_id?.slice(0, 8) || '—'}</td>
                <td className="max-w-[360px] truncate font-mono text-[11px] text-slate-500">{e.details ? JSON.stringify(e.details) : ''}</td>
              </tr>))}</tbody>
          </table>
        )}
      </Card>
    </>
  );
}
