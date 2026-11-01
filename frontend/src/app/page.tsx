import Link from 'next/link';
import summary from '@/data/comm-results-v1/summary.json';

type S = Record<string, Record<string, Record<string, { mean: number } | null>>>;
const s = summary as unknown as S;
const f3 = (v: number | undefined) => (v == null ? '—' : v.toFixed(3));

const SUBSYSTEMS = [
  ['AURA intelligence', 'Risk, reliability, distribution shift and decision admissibility A(x) = r(x)·(1 − D(x)), with input provenance and sensitivity-based uncertainty. Hand-weighted heuristics, parity-tested against the original DADIP.'],
  ['Cloud core', 'FastAPI, PostgreSQL with migrations, role-based access, an audit row for every change, background dispatcher.'],
  ['Resilient communication', 'Approval-gated alerts, severity scheduling, outbox with retry and backoff, circuit breaker, deduplication, expiry, delivery and acknowledgement tracking.'],
  ['Edge network', 'Offline-first agents with a local SQLite outbox, MQTT QoS 1, local risk inference and exactly-once ingestion in the cloud.'],
];

export default function Home() {
  const outage = s.outage;
  const congestion = s.congestion;
  return (
    <main className="mx-auto max-w-5xl space-y-14 px-5 py-14">
      <header className="space-y-5">
        <p className="text-xs uppercase tracking-[0.2em] text-sky-400">DADIP 2.0</p>
        <h1 className="max-w-3xl text-3xl font-semibold leading-tight text-slate-100 md:text-4xl">
          Disaster intelligence that keeps critical alerts moving when networks degrade.
        </h1>
        <p className="max-w-2xl text-slate-400">
          A cloud-edge platform that assesses incidents with uncertainty-aware AI, puts a human approver in front of every
          high-impact alert, and delivers alerts through a communication engine designed for congestion and outages.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/command" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500">Command centre</Link>
          <Link href="/public" className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">Report an incident</Link>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        {SUBSYSTEMS.map(([t, d]) => (
          <div key={t} className="rounded-xl border border-white/[0.07] bg-[#0b1426] p-5">
            <h2 className="text-sm font-semibold text-slate-100">{t}</h2>
            <p className="mt-2 text-sm text-slate-400">{d}</p>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-100">What the experiments show <span className="ml-2 rounded border border-violet-500/30 bg-violet-500/15 px-1.5 py-0.5 align-middle text-[11px] text-violet-300">SIMULATED</span></h2>
        <p className="max-w-3xl text-sm text-slate-400">
          Means over 30 seeded runs of a discrete-event model of one degraded channel. These are simulation results, not field
          measurements; the full tables, confidence intervals and limitations are in the command centre and the repository.
        </p>
        <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02] text-left text-[11px] uppercase text-slate-500">
              <tr><th className="px-4 py-2">Red-alert metric</th><th>Baseline</th><th>Priority</th><th>Resilient</th></tr>
            </thead>
            <tbody className="text-slate-300">
              <tr className="border-t border-white/[0.05]"><td className="px-4 py-2">Delivered before expiry, 120 s outage</td><td>{f3(outage.baseline.red_delivery_ratio?.mean)}</td><td>{f3(outage.priority.red_delivery_ratio?.mean)}</td><td>{f3(outage.resilient.red_delivery_ratio?.mean)}</td></tr>
              <tr className="border-t border-white/[0.05]"><td className="px-4 py-2">Delivered before expiry, congestion</td><td>{f3(congestion.baseline.red_delivery_ratio?.mean)}</td><td>{f3(congestion.priority.red_delivery_ratio?.mean)}</td><td>{f3(congestion.resilient.red_delivery_ratio?.mean)}</td></tr>
              <tr className="border-t border-white/[0.05]"><td className="px-4 py-2">p95 latency, congestion (s)</td><td>{congestion.baseline.red_latency_p95_s?.mean.toFixed(1)}</td><td>{congestion.priority.red_latency_p95_s?.mean.toFixed(2)}</td><td>{congestion.resilient.red_latency_p95_s?.mean.toFixed(2)}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <footer className="border-t border-white/[0.06] pt-6 text-xs text-slate-500">
        Successor to <a className="text-sky-400 hover:underline" href="https://github.com/Megavarshan/disaster-ai">DADIP</a> by Megavarshan A · <Link href="/about" className="hover:underline">About</Link>
      </footer>
    </main>
  );
}
