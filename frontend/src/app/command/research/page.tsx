// Experiment results, rendered from the committed summary.json of simulation-results/v1 (copied at build time by
// `npm run sync-results`). These are SIMULATED results from the DADIP discrete-event model.
import summary from '@/data/comm-results-v1/summary.json';
import meta from '@/data/comm-results-v1/metadata.json';
import { Badge, Card } from '@/components/ui';

type Stat = { mean: number; ci95: [number, number] } | null;
type Summary = Record<string, Record<string, Record<string, Stat>>>;

const METRICS: [string, string, (v: number) => string][] = [
  ['delivery_ratio', 'Delivery ratio', (v) => v.toFixed(3)],
  ['red_delivery_ratio', 'Red-alert delivery', (v) => v.toFixed(3)],
  ['red_latency_p95_s', 'Red p95 latency (s)', (v) => v.toFixed(2)],
  ['latency_p95_s', 'All p95 latency (s)', (v) => v.toFixed(2)],
  ['duplicate_delivery_rate', 'Duplicate rate', (v) => v.toFixed(3)],
  ['attempts_per_delivered', 'Attempts / delivered', (v) => v.toFixed(3)],
  ['recovery_backlog_drain_s', 'Backlog drain (s)', (v) => v.toFixed(1)],
];
const STRATS = ['baseline', 'priority', 'resilient'];

export default function ResearchPage() {
  const s = summary as unknown as Summary;
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">Communication experiments <Badge tone="violet">SIMULATED</Badge></h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          {meta.runs} runs ({meta.seeds} seeds per cell) from commit <code>{meta.git_commit.slice(0, 10)}</code>, generated {meta.finished_at}.
          Means with bootstrap 95% confidence intervals. A software model of one degraded channel; not a measurement of a real
          cellular, satellite or mesh network. Analysis and threats to validity: <code>docs/research/communication-results.md</code>.
        </p>
      </div>
      {Object.entries(s).map(([scenario, data]) => {
        const cfg = (meta.scenarios as Record<string, { arrival_rate_per_s: number; capacity_per_s: number; loss: number; outages: number[][] }>)[scenario];
        return (
          <Card key={scenario} title={scenario.replaceAll('_', ' ')} subtitle={`${cfg.arrival_rate_per_s}/s offered · capacity ${cfg.capacity_per_s}/s · loss ${(cfg.loss * 100).toFixed(0)}% · outages ${cfg.outages.length ? cfg.outages.map((o) => `${o[0]}–${o[1]} s`).join(', ') : 'none'}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-slate-500"><th className="pb-1">Metric</th>{STRATS.map((st) => <th key={st}>{st}</th>)}</tr></thead>
                <tbody>{METRICS.filter(([m]) => STRATS.some((st) => data[st]?.[m])).map(([m, label, fmt]) => (
                  <tr key={m} className="border-t border-white/[0.05] text-slate-300">
                    <td className="py-1.5 text-slate-400">{label}</td>
                    {STRATS.map((st) => { const d = data[st]?.[m]; return <td key={st} className="tabular-nums">{d ? <>{fmt(d.mean)} <span className="text-slate-600">[{fmt(d.ci95[0])}, {fmt(d.ci95[1])}]</span></> : '—'}</td>; })}
                  </tr>))}</tbody>
              </table>
            </div>
          </Card>
        );
      })}
    </>
  );
}
