'use client';

import { useState } from 'react';
import { api, usePoll } from '@/lib/api/client';
import type { Assessment, Incident, Page, Report } from '@/lib/api/types';
import {
  Badge, Card, DECISION_TONE, Empty, ErrorNote, OriginBadge, SEVERITY_TONE, STATE_TONE, Updated, ago, btnGhost, btnOk,
  btnPrimary, inputCls,
} from '@/components/ui';

const HAZARDS = ['flood', 'cyclone', 'earthquake', 'tsunami', 'landslide', 'fire', 'heatwave', 'other'];

function NewIncident({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ hazard_type: 'flood', title: '', severity: 'high', latitude: '', longitude: '', region: '', description: '' });
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await api('incidents', { method: 'POST', body: { ...f, latitude: Number(f.latitude), longitude: Number(f.longitude), region: f.region || null, description: f.description || null } });
      setF({ ...f, title: '', description: '' });
      onDone();
    } catch (e) { setErr((e as Error).message); }
  }
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form onSubmit={submit} className="grid gap-2 sm:grid-cols-2">
      <input className={`${inputCls} sm:col-span-2`} placeholder="Title" required minLength={3} value={f.title} onChange={set('title')} />
      <select className={inputCls} value={f.hazard_type} onChange={set('hazard_type')}>{HAZARDS.map((h) => <option key={h}>{h}</option>)}</select>
      <select className={inputCls} value={f.severity} onChange={set('severity')}>{['low', 'moderate', 'high', 'critical'].map((s) => <option key={s}>{s}</option>)}</select>
      <input className={inputCls} placeholder="Latitude" required inputMode="decimal" value={f.latitude} onChange={set('latitude')} />
      <input className={inputCls} placeholder="Longitude" required inputMode="decimal" value={f.longitude} onChange={set('longitude')} />
      <input className={`${inputCls} sm:col-span-2`} placeholder="Region / district" value={f.region} onChange={set('region')} />
      <textarea className={`${inputCls} sm:col-span-2`} rows={2} placeholder="Description" value={f.description} onChange={set('description')} />
      <div className="sm:col-span-2"><ErrorNote error={err} /></div>
      <button className={`${btnPrimary} sm:col-span-2`}>Create incident</button>
    </form>
  );
}

function pct(v: number) { return `${(v * 100).toFixed(0)}%`; }

function AssessmentView({ a }: { a: Assessment }) {
  const prov = Object.entries(a.input_provenance).filter(([k]) => !k.startsWith('_')) as [string, string][];
  const weather = a.input_provenance._weather as { source: string; observed_at: string | null } | undefined;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg bg-white/[0.03] p-3"><p className="text-[11px] text-slate-500">Composite risk</p><p className="text-xl font-semibold tabular-nums">{a.composite_risk}</p><p className="text-[11px] text-slate-500">5–95%: {a.uncertainty.composite_risk_p05}–{a.uncertainty.composite_risk_p95}</p></div>
        <div className="rounded-lg bg-white/[0.03] p-3"><p className="text-[11px] text-slate-500">Reliability r(x)</p><p className="text-xl font-semibold tabular-nums">{a.reliability.reliabilityScore.toFixed(2)}</p><p className="text-[11px] text-slate-500">coverage {pct(a.reliability.featureCoverage)}</p></div>
        <div className="rounded-lg bg-white/[0.03] p-3"><p className="text-[11px] text-slate-500">Admissibility A(x)</p><p className="text-xl font-semibold tabular-nums">{a.admissibility_score.toFixed(2)}</p><p className="text-[11px] text-slate-500">threshold {a.admissibility.threshold}</p></div>
        <div className="rounded-lg bg-white/[0.03] p-3"><p className="text-[11px] text-slate-500">Decision</p><p className="mt-1"><Badge tone={DECISION_TONE[a.decision]}>{a.decision.toUpperCase()}</Badge></p><p className="mt-1 text-[11px] text-slate-500">stable in {pct(a.uncertainty.decision_stability)} of {a.uncertainty.n} perturbations</p></div>
      </div>
      <p className="text-xs text-slate-400">{a.admissibility.reasoning}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-[11px] uppercase text-slate-500">Hazard risk</p>
          {(['floodRisk', 'cycloneRisk', 'earthquakeRisk', 'tsunamiRisk'] as const).map((k) => (
            <div key={k} className="mb-1.5 flex items-center gap-2 text-xs">
              <span className="w-20 text-slate-400">{k.replace('Risk', '')}</span>
              <div className="h-2 flex-1 rounded bg-white/[0.05]"><div className="h-2 rounded bg-sky-500/70" style={{ width: `${a.risk[k]}%` }} /></div>
              <span className="w-8 text-right tabular-nums text-slate-300">{a.risk[k]}</span>
            </div>
          ))}
        </div>
        <div>
          <p className="mb-2 text-[11px] uppercase text-slate-500">Input provenance</p>
          <div className="flex flex-wrap gap-1">
            {prov.map(([k, v]) => <Badge key={k} tone={v === 'observed' ? 'green' : v === 'estimated' ? 'blue' : 'yellow'}>{k}: {v}</Badge>)}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">{weather ? `Weather: ${weather.source}, observed ${weather.observed_at}` : 'No live weather: inputs marked "default" use documented constants.'}</p>
          <p className="mt-1 text-[11px] text-slate-500">OOD (χ²₁₂ test): {a.distribution_shift.corrected.is_out_of_distribution ? 'yes' : 'no'} · d² = {a.distribution_shift.corrected.squared_distance}</p>
        </div>
      </div>
      <p className="text-[11px] text-slate-500">Model {a.model_version}: hand-weighted heuristics ported from DADIP; not a trained model. {ago(a.created_at)}.</p>
    </div>
  );
}

function IncidentDetail({ incident }: { incident: Incident }) {
  const list = usePoll<Assessment[]>(`incidents/${incident.id}/assessments?limit=1`, 15000);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function assess() {
    setBusy(true); setErr(null);
    try { await api(`incidents/${incident.id}/assess`, { method: 'POST' }); await list.reload(); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  async function setStatus(status: string) {
    try { await api(`incidents/${incident.id}`, { method: 'PATCH', body: { status } }); } catch (e) { setErr((e as Error).message); }
  }
  const latest = list.data?.[0];
  return (
    <Card title={incident.title} subtitle={`${incident.hazard_type} · ${incident.region || '—'} · ${incident.latitude.toFixed(2)}, ${incident.longitude.toFixed(2)}`}
      actions={<div className="flex gap-2"><button className={btnPrimary} onClick={assess} disabled={busy}>{busy ? 'Assessing…' : 'Run AURA'}</button>
        <button className={btnGhost} onClick={() => setStatus(incident.status === 'closed' ? 'open' : 'closed')}>{incident.status === 'closed' ? 'Reopen' : 'Close'}</button></div>}>
      <ErrorNote error={err} />
      {incident.description && <p className="mb-4 text-sm text-slate-400">{incident.description}</p>}
      {latest ? <AssessmentView a={latest} /> : <Empty>Not assessed yet. Run AURA to compute risk, reliability and admissibility.</Empty>}
    </Card>
  );
}

function Reports() {
  const reports = usePoll<Page<Report>>('reports?limit=30');
  async function set(id: string, status: string) { await api(`reports/${id}`, { method: 'PATCH', body: { status } }); reports.reload(); }
  const items = reports.data?.items || [];
  return (
    <Card title="Citizen and edge reports" subtitle="Credibility v0 = corroboration heuristic (not a trained classifier)">
      {items.length === 0 ? <Empty>No reports yet.</Empty> : (
        <ul className="divide-y divide-white/[0.05]">
          {items.map((r) => (
            <li key={r.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={SEVERITY_TONE[r.reported_severity]}>{r.reported_severity}</Badge>
                <Badge tone={STATE_TONE[r.status]}>{r.status}</Badge>
                <Badge tone="slate">{r.source}</Badge>
                <span className="text-xs text-slate-400">credibility {r.credibility == null ? '—' : r.credibility.toFixed(2)}{r.credibility_detail ? ` · ${r.credibility_detail.corroborating_reports} corroborating` : ''}</span>
                <span className="ml-auto text-[11px] text-slate-500">{ago(r.created_at)}</span>
              </div>
              <p className="mt-1 text-sm text-slate-200">{r.description}</p>
              <p className="text-[11px] text-slate-500">{r.location_text} · {r.reporter_name}{r.contact ? ` · ${r.contact}` : ''}</p>
              {r.status === 'pending' && (
                <div className="mt-2 flex gap-2">
                  <button className={btnOk} onClick={() => set(r.id, 'verified')}>Verify</button>
                  <button className={btnGhost} onClick={() => set(r.id, 'dismissed')}>Dismiss</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function IncidentsPage() {
  const incidents = usePoll<Page<Incident>>('incidents?limit=100');
  const [selected, setSelected] = useState<string | null>(null);
  const items = incidents.data?.items || [];
  const current = items.find((i) => i.id === selected) || items[0];
  return (
    <>
      <div className="flex items-end justify-between"><h1 className="text-xl font-semibold">Incidents & AURA intelligence</h1><Updated at={incidents.updatedAt} /></div>
      <ErrorNote error={incidents.error} />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Incidents">
            {items.length === 0 ? <Empty>No incidents.</Empty> : (
              <ul className="max-h-[420px] space-y-1 overflow-y-auto">
                {items.map((i) => (
                  <li key={i.id}>
                    <button onClick={() => setSelected(i.id)} className={`w-full rounded-lg px-3 py-2 text-left transition ${current?.id === i.id ? 'bg-sky-500/10' : 'hover:bg-white/[0.03]'}`}>
                      <p className="truncate text-sm text-slate-200">{i.title}</p>
                      <div className="mt-1 flex gap-1"><Badge tone={SEVERITY_TONE[i.severity]}>{i.severity}</Badge><Badge tone={STATE_TONE[i.status] || 'slate'}>{i.status}</Badge><OriginBadge origin={i.data_origin} /></div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="New incident"><NewIncident onDone={incidents.reload} /></Card>
        </div>
        <div className="space-y-6 lg:col-span-3">
          {current ? <IncidentDetail key={current.id} incident={current} /> : <Empty>Select an incident.</Empty>}
          <Reports />
        </div>
      </div>
    </>
  );
}
