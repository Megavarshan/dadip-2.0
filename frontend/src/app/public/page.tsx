'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Incident, Page, Resource } from '@/lib/api/types';
import { Badge, Card, ErrorNote, OriginBadge, SEVERITY_TONE, btnPrimary, inputCls } from '@/components/ui';
import { LANGUAGES, t, type Language, type TranslationKeys } from '@/lib/i18n/translations';

const IncidentMap = dynamic(() => import('@/components/map/incident-map'), { ssr: false, loading: () => <div className="h-[420px] animate-pulse rounded-xl bg-white/[0.03]" /> });
const HAZARDS = ['flood', 'cyclone', 'earthquake', 'tsunami', 'landslide', 'fire', 'heatwave', 'other'];

/** Translate when the original DADIP table has the key (it covers the four original hazards); otherwise English. */
function tr(key: string, lang: Language, fallback: string) {
  const v = t(key as TranslationKeys, lang);
  return v && v !== key ? v : fallback;
}

async function get<T>(path: string): Promise<T | null> {
  const r = await fetch(`/api/backend/${path}`, { cache: 'no-store' });
  return r.ok ? r.json() : null;
}

function ReportForm({ lang }: { lang: Language }) {
  const [f, setF] = useState({ reporter_name: '', contact: '', hazard_type: 'flood', description: '', location_text: '', reported_severity: 'moderate', latitude: '', longitude: '' });
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  function locate() {
    navigator.geolocation?.getCurrentPosition(
      (p) => setF((x) => ({ ...x, latitude: p.coords.latitude.toFixed(5), longitude: p.coords.longitude.toFixed(5) })),
      () => setErr('Location unavailable; enter coordinates manually.'),
    );
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const r = await fetch('/api/backend/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...f, contact: f.contact || null, latitude: Number(f.latitude), longitude: Number(f.longitude) }) });
    setBusy(false);
    if (r.ok) { setDone(true); return; }
    const d = await r.json().catch(() => ({}));
    setErr(r.status === 429 ? 'Too many reports from this connection; please wait a minute.' : typeof d.detail === 'string' ? d.detail : 'Please check the fields and try again.');
  }
  if (done) return <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">{t('msg.reportSubmitted', lang)} · 112</p>;
  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input className={inputCls} placeholder="Your name" required value={f.reporter_name} onChange={set('reporter_name')} />
        <input className={inputCls} placeholder="Phone (optional, operators only)" value={f.contact} onChange={set('contact')} />
        <select className={inputCls} value={f.hazard_type} onChange={set('hazard_type')}>{HAZARDS.map((h) => <option key={h} value={h}>{tr(`disaster.${h}`, lang, h)}</option>)}</select>
        <select className={inputCls} value={f.reported_severity} onChange={set('reported_severity')}>{['low', 'moderate', 'high', 'critical'].map((s) => <option key={s} value={s}>{tr(`severity.${s}`, lang, s)}</option>)}</select>
      </div>
      <textarea className={inputCls} rows={3} required minLength={5} placeholder="What is happening? Include what you can see, e.g. water depth or damage." value={f.description} onChange={set('description')} />
      <input className={inputCls} placeholder="Place (village, street, landmark)" required minLength={2} value={f.location_text} onChange={set('location_text')} />
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <input className={inputCls} placeholder="Latitude" required inputMode="decimal" value={f.latitude} onChange={set('latitude')} />
        <input className={inputCls} placeholder="Longitude" required inputMode="decimal" value={f.longitude} onChange={set('longitude')} />
        <button type="button" className="rounded-lg border border-white/10 px-3 text-xs text-slate-300 hover:bg-white/5" onClick={locate}>Use my location</button>
      </div>
      <ErrorNote error={err} />
      <button className={`${btnPrimary} w-full`} disabled={busy}>{busy ? '…' : t('action.reportIncident', lang)}</button>
      <p className="text-[11px] text-slate-500">Your phone number is visible only to emergency operators, never on public pages.</p>
    </form>
  );
}

export default function PublicPortal() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [down, setDown] = useState(false);
  const [lang, setLang] = useState<Language>('en');
  useEffect(() => {
    get<Page<Incident>>('incidents?status=open&limit=200').then((d) => { if (d) setIncidents(d.items); else setDown(true); });
    get<Resource[]>('resources').then((d) => d && setResources(d));
  }, []);
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><Link href="/" className="text-xs text-sky-400">DADIP 2.0</Link><h1 className="text-2xl font-semibold text-slate-100">Public disaster information</h1></div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-400">{t('label.emergencyContacts', lang)}: <strong className="text-slate-100">112</strong> · NDMA <strong className="text-slate-100">1078</strong></p>
          <select aria-label="Language" className="rounded-lg border border-white/10 bg-[#070e1d] px-2 py-1 text-sm text-slate-200" value={lang} onChange={(e) => setLang(e.target.value as Language)}>
            {Object.entries(LANGUAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </header>
      {down && <ErrorNote error="The DADIP service is unreachable right now. Reports cannot be sent; please call 112." />}
      <div className="grid gap-6 lg:grid-cols-5">
        <Card title={t('label.liveEvents', lang)} subtitle="Dashed outline = demo data · blue dots = help centres" className="lg:col-span-3">
          <IncidentMap incidents={incidents} resources={resources} />
          <ul className="mt-4 divide-y divide-white/[0.05]">
            {incidents.slice(0, 6).map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="truncate text-slate-200">{i.title}</span>
                <span className="flex shrink-0 gap-1"><Badge tone={SEVERITY_TONE[i.severity]}>{tr(`severity.${i.severity}`, lang, i.severity)}</Badge><OriginBadge origin={i.data_origin} /></span>
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <Card title={t('action.reportIncident', lang)}><ReportForm lang={lang} /></Card>
          <Card title={t('label.helpCenters', lang)}>
            <ul className="space-y-2 text-sm">
              {resources.slice(0, 8).map((r) => (
                <li key={r.id}><p className="text-slate-200">{r.name} <OriginBadge origin={r.data_origin} /></p><p className="text-[11px] text-slate-500">{r.address} · {r.phone}</p></li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </main>
  );
}
