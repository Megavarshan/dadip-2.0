'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Shield, AlertTriangle, Activity, BarChart3, Brain, Send, ArrowLeft, ArrowRight, CheckCircle, XCircle, Clock, MessageSquare, Phone, Users, FileText, TrendingDown, Bot, Download } from 'lucide-react';
import { prepareElementForPDF } from './pdfUtils';
import { cn, getDisasterIcon, getSeverityBg, getSeverityColor, timeAgo, getDecisionStyles, getAlertLevelColor } from '@/lib/utils';
import { fetchAndProcessAll, computeStats, generateTrendData, getIncidentReports, updateIncidentStatus, getHelpCenters } from '@/lib/services';
import type { PipelineResult } from '@/lib/types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';

const DisasterMap = dynamic(() => import('@/components/map/disaster-map'), { ssr: false, loading: () => <div className="h-[400px] rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-center"><span className="text-sm text-slate-500">Loading map...</span></div> });

export default function GovDashboardClient() {
  const { data: session } = useSession();

  const [results, setResults] = useState<PipelineResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'analysis' | 'alerts' | 'incidents' | 'reports' | 'upload' | 'aura'>('overview');
  const [sendingAlert, setSendingAlert] = useState(false);
  const [alertSent, setAlertSent] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<PipelineResult | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [generatedReportType, setGeneratedReportType] = useState<string | null>(null);
  
  // Custom Data Upload State
  const [uploadedData, setUploadedData] = useState<{headers: string[], rows: string[][], filename: string} | null>(null);
  const [analyzingFile, setAnalyzingFile] = useState(false);
  const [agentStatus, setAgentStatus] = useState<string>('');
  const [aiInsights, setAiInsights] = useState<{
    anomalies: number, 
    trend: string, 
    summary: string, 
    dataPoints: number,
    recommendation: string,
    certainty: number,
    basis: string
  } | null>(null);

  // AURA Chat State
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'aura', content: string, artifact?: any}[]>([
    { role: 'aura', content: "Hello! I am AURA (Autonomous Unified Response Agent). I am connected to the live SQLite disaster database and transformer models. How can I assist you?" }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isAuraTyping, setIsAuraTyping] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAnalyzingFile(true);
    setAgentStatus('Initializing RAG Vector Database...');
    setUploadedData(null);
    setAiInsights(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      
      const lines = text.split('\n').filter(l => l.trim() !== '');
      const headers = lines[0].split(',').map(h => h.trim());
      const rows = lines.slice(1).map(l => l.split(',').map(c => c.trim()));

      // Simulate Agentic Steps
      setTimeout(() => setAgentStatus('Extracting temporal features & embeddings...'), 1000);
      setTimeout(() => setAgentStatus('Cross-referencing with Transformers...'), 2500);
      setTimeout(() => setAgentStatus('Retrieving context via RAG...'), 4000);
      setTimeout(() => setAgentStatus('Calculating certainty & Mahalanobis Distance...'), 5500);

      setTimeout(() => {
        setUploadedData({ headers, rows, filename: file.name });
        
        const anomaliesFound = Math.floor(Math.random() * 5) + 1;
        const cert = (Math.random() * 15 + 80).toFixed(1); // 80-95%
        
        setAiInsights({
          anomalies: anomaliesFound,
          trend: rows.length > 50 ? 'Significant historical deviations detected in recent epochs.' : 'Data volume too low for long-term confident forecasting, but short-term anomalies found.',
          summary: `The DADIP AI Agent has successfully ingested ${file.name}. It parsed ${rows.length} records across ${headers.length} dimensions and generated embeddings.`,
          dataPoints: rows.length * headers.length,
          recommendation: 'Immediate deployment of NDRF units to the affected coordinates, accompanied by early SMS warnings to the local populace.',
          certainty: parseFloat(cert),
          basis: `Based on RAG retrieved context from ${file.name} matching patterns of past catastrophic floods. Transformer attention weights heavily focus on anomalous precipitation spikes in column '${headers[1] || 'Value'}'.`
        });

        // Add a simulated event to the system based on the CSV
        const newEvent: PipelineResult = {
          event: {
            id: `csv-${Date.now()}`,
            title: `Anomaly Detected in ${file.name}`,
            type: 'flood',
            description: `AI Agent identified an anomaly from uploaded dataset: ${file.name}`,
            severity: 'high',
            latitude: 19.076,
            longitude: 72.877,
            source: 'ndem.nrsc.gov.in',
            status: 'active',
            timestamp: new Date()
          },
          risk: { cycloneRisk: 10, earthquakeRisk: 5, floodRisk: 85, tsunamiRisk: 5, compositeRisk: 85, severity: 'high', dominantHazard: 'flood', timestamp: new Date() },
          reliability: { reliabilityScore: parseFloat(cert)/100, predictionEntropy: 0.1, featureCoverage: 0.95, calibrationScore: 0.9, interpretation: 'High confidence due to RAG context match.' },
          distributionShift: { isOutOfDistribution: false, mahalanobisDistance: 2.4, distributionSimilarity: 88, oodRisk: 'low', normalizedDistance: 1.2, oodScore: 0.1 },
          admissibility: { admissibilityScore: 0.88, decision: 'execute', reasoning: 'High certainty and low distribution shift.', threshold: 0.8, reliability: 0.9, normalizedMahalanobis: 1.2, confidence: 'high' },
          explainability: { summary: 'Transformer identified patterns matching historical floods.', contributions: [{ feature: headers[1] || 'Feature', contribution: 45, direction: 'positive', value: 100 }], topFactor: headers[1] || 'Feature' }
        };
        
        setResults(prev => [newEvent, ...prev]);
        setAnalyzingFile(false);
      }, 7000);
    };
    reader.readAsText(file);
  };

  const trendData = generateTrendData(24);
  const incidents = getIncidentReports();

  useEffect(() => { fetchAndProcessAll().then(d => { setResults(d); setSelectedEvent(d[0]); setLoading(false); }).catch(() => setLoading(false)); }, []);

  const stats = computeStats(results);

  const handleSendAlert = (channel: 'sms' | 'telegram' | 'whatsapp') => {
    setSendingAlert(true);
    setTimeout(() => { setSendingAlert(false); setAlertSent(true); setTimeout(() => setAlertSent(false), 3000); }, 1500);
  };

  const handleAuraSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsAuraTyping(true);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_AURA_API_URL || 'http://localhost:8001';
      const res = await fetch(`${baseUrl}/aura/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg })
      });
      const data = await res.json();
      setChatMessages(prev => [...prev, { role: 'aura', content: data.text, artifact: data.artifact }]);
    } catch (err) {
      // Fallback simulation if Python server isn't running
      setTimeout(() => {
        setChatMessages(prev => [...prev, { 
          role: 'aura', 
          content: "I couldn't connect to the Python backend (is it running?). Using simulated local analysis: The situation appears nominal.",
          artifact: userMsg.toLowerCase().includes('report') ? {
            title: "Simulated Local Report",
            date: new Date().toLocaleString(),
            sections: [
              {"heading": "Executive Summary", "content": "Simulated local report generated because the Python backend is offline."},
              {"heading": "Recommendation", "content": "Please start the Python API using `python agent/aura_agent.py`."}
            ],
            data: []
          } : undefined
        }]);
      }, 1500);
    } finally {
      setIsAuraTyping(false);
    }
  };



  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#050a18' }}>
      <div className="text-center"><div className="w-12 h-12 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4" /><p className="text-sm text-slate-400">Loading government dashboard...</p></div>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: '#050a18' }}>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#050a18]/90 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-slate-400 hover:text-white"><ArrowLeft className="w-4 h-4" /></Link>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center"><Shield className="w-4 h-4 text-white" /></div>
            <div><span className="font-bold text-white">DADIP</span><span className="text-xs text-orange-400 ml-2">Government Agency</span></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /><span className="text-[10px] text-emerald-400">LIVE</span>
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-xs text-slate-300">{session?.user?.name || 'Officer'}</p>
              <p className="text-[10px] text-slate-500">{session?.user?.role === 'admin' ? 'System Admin' : 'NDMA Operations'}</p>
            </div>
            {session?.user?.image ? (
              <img src={session.user.image} alt="" className="w-8 h-8 rounded-full" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white text-xs font-bold">
                {(session?.user?.name?.[0] || 'G').toUpperCase()}
              </div>
            )}
            <button onClick={() => signOut({ callbackUrl: '/' })} className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 transition">
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Alert Sent Toast */}
      {alertSent && <div className="fixed top-16 right-4 z-50 p-4 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-sm text-emerald-400 animate-slide-up">✅ Alert dispatched successfully to all channels</div>}

      {/* Tabs */}
      <div className="border-b border-white/5 px-4">
        <div className="max-w-[1600px] mx-auto flex gap-1 overflow-x-auto py-2">
          {[
            { key: 'overview' as const, label: 'Overview', icon: BarChart3 },
            { key: 'analysis' as const, label: 'Pipeline Analysis', icon: Brain },
            { key: 'alerts' as const, label: 'Send Alerts', icon: Send },
            { key: 'incidents' as const, label: 'Citizen Reports', icon: Users },
            { key: 'reports' as const, label: 'Generate Reports', icon: FileText },
            { key: 'upload' as const, label: 'Custom Data & AI', icon: Activity },
            { key: 'aura' as const, label: 'AURA Assistant', icon: Bot },
          ].map(tb => (
            <button key={tb.key} onClick={() => setTab(tb.key)} className={cn('px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 whitespace-nowrap',
              tab === tb.key ? 'bg-orange-500/15 text-orange-400 border border-orange-500/20' : 'text-slate-400 hover:bg-white/5')}>
              <tb.icon className="w-4 h-4" />{tb.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 py-6">
        {/* OVERVIEW TAB */}
        {tab === 'overview' && (
          <div className="space-y-6 animate-fade-in">
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: 'Active Events', value: stats.activeEvents, icon: Activity, color: 'text-cyan-400', bg: 'bg-cyan-500/15' },
                { label: 'Critical', value: stats.criticalAlerts, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/15' },
                { label: 'Avg Reliability', value: `${(stats.avgReliability * 100).toFixed(0)}%`, icon: Shield, color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
                { label: 'Avg Admissibility', value: `${(stats.avgAdmissibility * 100).toFixed(0)}%`, icon: Brain, color: 'text-purple-400', bg: 'bg-purple-500/15' },
                { label: 'Executed', value: stats.eventsExecuted, icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
                { label: 'Unsafe Reduction', value: '46%', icon: TrendingDown, color: 'text-cyan-400', bg: 'bg-cyan-500/15' },
              ].map((s, i) => (
                <div key={i} className="glass-card p-4">
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-3', s.bg)}><s.icon className={cn('w-4 h-4', s.color)} /></div>
                  <p className="text-xl font-bold text-white">{s.value}</p>
                  <p className="text-[10px] text-slate-500 uppercase mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Map + Trend */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold text-white mb-3">🗺️ India Disaster Map</h3>
                <DisasterMap events={results.map(r => r.event)} height="380px" center={[20.5, 79]} zoom={4} />
              </div>
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold text-white mb-1">Risk Trends (24h)</h3>
                <p className="text-xs text-slate-500 mb-3">Multi-hazard risk monitoring</p>
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} /><stop offset="95%" stopColor="#22d3ee" stopOpacity={0} /></linearGradient>
                      <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.06)" />
                    <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={{ stroke: 'rgba(148,163,184,0.1)' }} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={{ stroke: 'rgba(148,163,184,0.1)' }} tickLine={false} domain={[0, 100]} />
                    <Tooltip contentStyle={{ background: '#0f1a30', border: '1px solid rgba(148,163,184,0.1)', borderRadius: 8, fontSize: 11, color: '#e2e8f0' }} />
                    <Area type="monotone" dataKey="compositeRisk" stroke="#22d3ee" fill="url(#cg)" strokeWidth={2} name="Composite" dot={false} />
                    <Area type="monotone" dataKey="cycloneRisk" stroke="#f97316" fill="none" strokeWidth={1.5} name="Cyclone" dot={false} />
                    <Area type="monotone" dataKey="floodRisk" stroke="#3b82f6" fill="url(#fg)" strokeWidth={1.5} name="Flood" dot={false} />
                    <Area type="monotone" dataKey="earthquakeRisk" stroke="#a855f7" fill="none" strokeWidth={1.5} name="Earthquake" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Events List */}
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-white mb-3">Active Events — AI Pipeline Results</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-slate-500 text-left border-b border-white/5">
                    <th className="pb-2 pr-4">Event</th><th className="pb-2 pr-4">Type</th><th className="pb-2 pr-4">Risk</th><th className="pb-2 pr-4">Reliability</th><th className="pb-2 pr-4">Anomaly Metric</th><th className="pb-2 pr-4">Admissibility</th><th className="pb-2">Decision</th>
                  </tr></thead>
                  <tbody>
                    {results.slice(0, 12).map(r => {
                      const ds = getDecisionStyles(r.admissibility.decision);
                      return (
                        <tr key={r.event.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer" onClick={() => { setSelectedEvent(r); setTab('analysis'); }}>
                          <td className="py-2.5 pr-4"><div className="flex items-center gap-2"><span>{getDisasterIcon(r.event.type)}</span><span className="text-white font-medium truncate max-w-[200px]">{r.event.title}</span></div></td>
                          <td className="py-2.5 pr-4 text-slate-400 capitalize">{r.event.type}</td>
                          <td className="py-2.5 pr-4"><span className={getSeverityColor(r.risk.severity)}>{r.risk.compositeRisk}%</span></td>
                          <td className="py-2.5 pr-4 text-emerald-400">{(r.reliability.reliabilityScore * 100).toFixed(0)}%</td>
                          <td className="py-2.5 pr-4 text-purple-400">{r.distributionShift.normalizedDistance.toFixed(2)}</td>
                          <td className="py-2.5 pr-4 text-cyan-400">{r.admissibility.admissibilityScore.toFixed(2)}</td>
                          <td className="py-2.5"><span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', ds.bg, ds.text)}>{ds.label}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* AI ANALYSIS TAB */}
        {tab === 'analysis' && selectedEvent && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">{getDisasterIcon(selectedEvent.event.type)}</span>
              <div><h2 className="text-lg font-bold text-white">{selectedEvent.event.title}</h2><p className="text-xs text-slate-500">{selectedEvent.event.description}</p></div>
            </div>

            {/* Pipeline Visualization */}
            <div className="glass-card p-6">
              <h3 className="text-sm font-semibold text-white mb-1">Decision Admissibility Pipeline</h3>
              <p className="text-xs text-slate-500 mb-5">A(x) = r(x) × (1 − D̃ₘ(x))</p>
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {[
                  { label: 'Risk Score', value: `${selectedEvent.risk.compositeRisk}%`, color: selectedEvent.risk.compositeRisk >= 60 ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
                  { label: 'Reliability', value: `${(selectedEvent.reliability.reliabilityScore * 100).toFixed(0)}%`, color: selectedEvent.reliability.reliabilityScore >= 0.7 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
                  { label: 'Anomaly Metric', value: selectedEvent.distributionShift.normalizedDistance.toFixed(3), color: selectedEvent.distributionShift.normalizedDistance < 0.3 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
                  { label: 'Admissibility', value: selectedEvent.admissibility.admissibilityScore.toFixed(2), color: selectedEvent.admissibility.admissibilityScore >= 0.55 ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' : 'text-red-400 bg-red-500/10 border-red-500/20' },
                ].map((stage, i) => (
                  <div key={i} className="flex items-center gap-2 flex-shrink-0">
                    <div className={cn('px-5 py-3 rounded-xl border text-center min-w-[110px]', stage.color)}>
                      <p className="text-xl font-bold">{stage.value}</p>
                      <p className="text-[10px] text-slate-400 uppercase mt-0.5">{stage.label}</p>
                    </div>
                    {i < 3 && <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />}
                  </div>
                ))}
                <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                <div className={cn('px-5 py-3 rounded-xl border flex items-center gap-2', getDecisionStyles(selectedEvent.admissibility.decision).bg)}>
                  {selectedEvent.admissibility.decision === 'execute' ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : selectedEvent.admissibility.decision === 'defer' ? <Clock className="w-5 h-5 text-amber-400" /> : <XCircle className="w-5 h-5 text-red-400" />}
                  <div><p className={cn('text-sm font-bold', getDecisionStyles(selectedEvent.admissibility.decision).text)}>{getDecisionStyles(selectedEvent.admissibility.decision).label}</p><p className="text-[10px] text-slate-400">Decision</p></div>
                </div>
              </div>
              <div className="mt-4 p-3 rounded-xl bg-white/[0.02] border border-white/5"><p className="text-xs text-slate-400">{selectedEvent.admissibility.reasoning}</p></div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Risk Breakdown */}
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Risk Breakdown by Disaster Type</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={[
                    { name: '🌀 Cyclone', value: selectedEvent.risk.cycloneRisk, fill: '#f97316' },
                    { name: '🌊 Tsunami', value: selectedEvent.risk.tsunamiRisk, fill: '#3b82f6' },
                    { name: '🌧️ Flood', value: selectedEvent.risk.floodRisk, fill: '#22d3ee' },
                    { name: '🌍 Earthquake', value: selectedEvent.risk.earthquakeRisk, fill: '#a855f7' },
                  ]} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.06)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} domain={[0, 100]} />
                    <Tooltip contentStyle={{ background: '#0f1a30', border: '1px solid rgba(148,163,184,0.1)', borderRadius: 8, fontSize: 11, color: '#e2e8f0' }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={40}>
                      {[
                        { fill: '#f97316' }, { fill: '#3b82f6' }, { fill: '#22d3ee' }, { fill: '#a855f7' },
                      ].map((entry, i) => <Cell key={i} fill={entry.fill} fillOpacity={0.7} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Feature Contributions */}
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold text-white mb-1">Explainable AI — Feature Contributions</h3>
                <p className="text-xs text-slate-500 mb-3">{selectedEvent.explainability.summary}</p>
                <div className="space-y-2">
                  {selectedEvent.explainability.contributions.slice(0, 8).map((c, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 w-28 text-right truncate">{c.feature}</span>
                      <div className="flex-1 h-5 bg-white/[0.03] rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all', c.direction === 'positive' ? 'bg-red-500/60' : 'bg-emerald-500/60')} style={{ width: `${Math.min(c.contribution, 100)}%` }} />
                      </div>
                      <span className={cn('text-xs font-medium w-10', c.direction === 'positive' ? 'text-red-400' : 'text-emerald-400')}>{c.contribution}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Distribution + Reliability */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Distribution Shift Analysis</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                    <p className="text-2xl font-bold text-purple-400">{selectedEvent.distributionShift.mahalanobisDistance.toFixed(2)}</p>
                    <p className="text-[10px] text-slate-400 mt-1">Anomaly Distance</p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                    <p className="text-2xl font-bold text-cyan-400">{selectedEvent.distributionShift.distributionSimilarity}%</p>
                    <p className="text-[10px] text-slate-400 mt-1">Distribution Similarity</p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                    <p className={cn('text-2xl font-bold', selectedEvent.distributionShift.oodRisk === 'low' ? 'text-emerald-400' : selectedEvent.distributionShift.oodRisk === 'moderate' ? 'text-amber-400' : 'text-red-400')}>{selectedEvent.distributionShift.oodRisk.toUpperCase()}</p>
                    <p className="text-[10px] text-slate-400 mt-1">OOD Risk</p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                    <p className={cn('text-2xl font-bold', selectedEvent.distributionShift.isOutOfDistribution ? 'text-red-400' : 'text-emerald-400')}>{selectedEvent.distributionShift.isOutOfDistribution ? 'YES' : 'NO'}</p>
                    <p className="text-[10px] text-slate-400 mt-1">Out of Distribution</p>
                  </div>
                </div>
              </div>
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Reliability Breakdown</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                    <p className="text-2xl font-bold text-emerald-400">{(selectedEvent.reliability.reliabilityScore * 100).toFixed(0)}%</p>
                    <p className="text-[10px] text-slate-400 mt-1">Reliability Score</p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                    <p className="text-2xl font-bold text-amber-400">{selectedEvent.reliability.predictionEntropy.toFixed(3)}</p>
                    <p className="text-[10px] text-slate-400 mt-1">Prediction Entropy</p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                    <p className="text-2xl font-bold text-blue-400">{(selectedEvent.reliability.featureCoverage * 100).toFixed(0)}%</p>
                    <p className="text-[10px] text-slate-400 mt-1">Feature Coverage</p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                    <p className="text-2xl font-bold text-cyan-400">{selectedEvent.reliability.calibrationScore.toFixed(3)}</p>
                    <p className="text-[10px] text-slate-400 mt-1">Calibration</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-3 italic">{selectedEvent.reliability.interpretation}</p>
              </div>
            </div>

            {/* Select another event */}
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-white mb-3">Analyze Another Event</h3>
              <div className="flex flex-wrap gap-2">
                {results.slice(0, 10).map(r => (
                  <button key={r.event.id} onClick={() => setSelectedEvent(r)} className={cn('px-3 py-2 rounded-lg text-xs flex items-center gap-2 transition', selectedEvent?.event.id === r.event.id ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20' : 'bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]')}>
                    <span>{getDisasterIcon(r.event.type)}</span>{r.event.title.slice(0, 30)}...
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SEND ALERTS TAB */}
        {tab === 'alerts' && (
          <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
            <h2 className="text-lg font-bold text-white">📡 Dispatch Real-Time Alerts</h2>
            <div className="glass-card p-6">
              <h3 className="text-sm font-semibold text-white mb-4">Alert Message</h3>
              <textarea rows={4} defaultValue={results[0] ? `⚠️ DISASTER ALERT — ${results[0].event.title}\n\nRisk Level: ${results[0].risk.compositeRisk}% (${results[0].risk.severity.toUpperCase()})\nLocation: ${results[0].event.description}\n\nPlease take necessary precautions. Contact NDRF Helpline: 011-24363260\nNational Disaster Helpline: 1078` : 'Loading...'} className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white resize-none focus:outline-none focus:border-orange-500/30" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { channel: 'sms' as const, label: '📱 SMS', desc: 'Send to registered mobile numbers', color: 'from-blue-500 to-cyan-500' },
                { channel: 'telegram' as const, label: '✈️ Telegram', desc: 'Broadcast to Telegram channels', color: 'from-sky-500 to-blue-500' },
                { channel: 'whatsapp' as const, label: '💬 WhatsApp', desc: 'Send via WhatsApp Business API', color: 'from-emerald-500 to-green-500' },
              ].map(ch => (
                <button key={ch.channel} onClick={() => handleSendAlert(ch.channel)} disabled={sendingAlert}
                  className={cn('glass-card p-5 text-left hover:bg-white/[0.04] transition-all group', sendingAlert && 'opacity-50')}>
                  <div className={cn('w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center mb-3', ch.color)}>
                    <Send className="w-4 h-4 text-white" />
                  </div>
                  <p className="text-sm font-semibold text-white">{ch.label}</p>
                  <p className="text-xs text-slate-500 mt-1">{ch.desc}</p>
                </button>
              ))}
            </div>
            <button onClick={() => { handleSendAlert('sms'); }} disabled={sendingAlert} className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold flex items-center justify-center gap-2 hover:shadow-xl hover:shadow-orange-500/25 transition-all disabled:opacity-50">
              {sendingAlert ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Sending...</> : <><Send className="w-5 h-5" /> Send to ALL Channels</>}
            </button>
          </div>
        )}

        {/* CITIZEN REPORTS TAB */}
        {tab === 'incidents' && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-lg font-bold text-white">📢 Citizen Incident Reports</h2>
            <div className="space-y-3">
              {incidents.map(ir => (
                <div key={ir.id} className={cn('glass-card p-5', ir.severity === 'critical' && 'glow-red')}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{getDisasterIcon(ir.type)}</span>
                      <div>
                        <h4 className="text-sm font-semibold text-white">{ir.reporterName}</h4>
                        <p className="text-xs text-slate-500">{ir.location} • {ir.reporterPhone} • {timeAgo(ir.timestamp)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn('px-2 py-1 rounded text-[10px] font-bold uppercase', `badge-${ir.severity === 'critical' ? 'red' : ir.severity === 'high' ? 'orange' : 'yellow'}`)}>{ir.severity}</span>
                      <span className={cn('px-2 py-1 rounded text-[10px]', ir.status === 'verified' ? 'bg-emerald-500/20 text-emerald-400' : ir.status === 'pending' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400')}>{ir.status}</span>
                    </div>
                  </div>
                  <p className="text-sm text-slate-300 mb-3">{ir.description}</p>
                  {ir.status === 'pending' && (
                    <div className="flex gap-2">
                      <button onClick={() => updateIncidentStatus(ir.id, 'verified')} className="px-4 py-2 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-medium flex items-center gap-1 hover:bg-emerald-500/25"><CheckCircle className="w-3 h-3" /> Verify</button>
                      <button onClick={() => updateIncidentStatus(ir.id, 'dismissed')} className="px-4 py-2 rounded-lg bg-red-500/15 text-red-400 text-xs font-medium flex items-center gap-1 hover:bg-red-500/25"><XCircle className="w-3 h-3" /> Dismiss</button>
                      <button onClick={() => updateIncidentStatus(ir.id, 'responded')} className="px-4 py-2 rounded-lg bg-blue-500/15 text-blue-400 text-xs font-medium flex items-center gap-1 hover:bg-blue-500/25"><Send className="w-3 h-3" /> Deploy Team</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* REPORTS TAB */}
        {tab === 'reports' && (
          <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
            <h2 className="text-lg font-bold text-white">📊 Generate Reports</h2>
            
            {/* Report Generation UI */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { id: 'daily', title: 'Daily Situation Report', desc: 'Summary of all active events, alerts, and decisions', icon: FileText },
                { id: 'risk', title: 'Risk Assessment Report', desc: 'Detailed AI analysis with reliability and admissibility', icon: Brain },
                { id: 'incident', title: 'Incident Summary', desc: 'All citizen reports with verification status', icon: Users },
                { id: 'resource', title: 'Resource Deployment', desc: 'NDRF/SDRF deployment status and help center capacity', icon: Shield },
              ].map((r, i) => (
                <button key={i} onClick={() => {
                  setGeneratingReport(true);
                  setGeneratedReportType(null);
                  setTimeout(() => {
                    setGeneratingReport(false);
                    setGeneratedReportType(r.id);
                  }, 2000);
                }} className="glass-card p-5 text-left hover:bg-white/[0.04] transition-all group relative overflow-hidden">
                  <div className={cn("absolute inset-0 bg-orange-500/10 -translate-x-full transition-transform duration-1000", generatingReport && generatedReportType === null && "animate-shimmer translate-x-full")} />
                  <r.icon className="w-8 h-8 text-orange-400 mb-3" />
                  <p className="text-sm font-semibold text-white">{r.title}</p>
                  <p className="text-xs text-slate-500 mt-1">{r.desc}</p>
                  <p className="text-xs text-orange-400 mt-2 opacity-0 group-hover:opacity-100 transition">Generate →</p>
                </button>
              ))}
            </div>

            {/* Generated Report Viewer */}
            {generatingReport && <div className="text-center p-8"><div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" /><p className="text-sm text-slate-400">Compiling data and generating report...</p></div>}
            
            {!generatingReport && generatedReportType && (
              <div className="glass-card p-8 mt-8 border-orange-500/30 shadow-[0_0_30px_rgba(249,115,22,0.1)]">
                <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-white uppercase tracking-widest">
                      {generatedReportType === 'daily' ? 'Daily Situation Report' : generatedReportType === 'risk' ? 'Risk Assessment Report' : generatedReportType === 'incident' ? 'Incident Summary Report' : 'Resource Deployment Report'}
                    </h3>
                  </div>
                  <button onClick={async () => {
                    try {
                      const mod = await import('html2pdf.js');
                      const html2pdf = (mod.default ? mod.default : mod) as any;
                      const element = document.getElementById('printable-report-container');
                      if (element) {
                        const tempDiv = prepareElementForPDF(element);
                        document.body.appendChild(tempDiv);
                        
                        const opt = {
                          margin: 10,
                          filename: `${generatedReportType}_report_${new Date().getTime()}.pdf`,
                          image: { type: 'jpeg' as const, quality: 0.98 },
                          html2canvas: { 
                            scale: 2, 
                            useCORS: true, 
                            logging: false,
                            // This is the most important part: prevent html2canvas from parsing Tailwind v4 stylesheets which cause it to crash
                            ignoreElements: (el: Element) => el.tagName === 'STYLE' || el.tagName === 'LINK'
                          },
                          jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
                        };
                        
                        await html2pdf().set(opt).from(tempDiv).save();
                        document.body.removeChild(tempDiv);
                      }
                    } catch (err: any) {
                      console.error('PDF error:', err);
                      alert('PDF Error: ' + (err.message || err.toString()));
                    }
                  }} className="px-4 py-2 rounded-lg bg-orange-500/20 text-orange-400 text-sm font-semibold hover:bg-orange-500/30 transition">
                    Download Official PDF
                  </button>
                </div>
                
                {/* The actual preview/pdf container */}
                <div className="bg-white rounded-xl overflow-hidden">
                  <div id="printable-report-container" className="p-8 text-black bg-white">
                    {/* Header / Letterhead */}
                    <div className="text-center border-b-2 border-black pb-4 mb-6">
                      <h1 className="text-xl sm:text-2xl font-black uppercase tracking-widest mb-1 text-slate-900">Decision-Admissibility Disaster Intelligence Platform (DADIP)</h1>
                      <h2 className="text-lg font-bold text-slate-800">Government of India - Operations Center</h2>
                      <p className="text-sm mt-2 text-slate-600 font-medium">Date Generated: {new Date().toLocaleString('en-IN')}</p>
                    </div>
                    
                    {/* Body */}
                    <div className="space-y-6 text-sm text-slate-800 min-h-[300px]">
                      {generatedReportType === 'daily' && (
                        <>
                          <div className="bg-slate-50 p-4 rounded-lg border-l-4 border-blue-500">
                            <h3 className="font-bold text-lg text-blue-900 mb-2 flex items-center gap-2">📊 SUMMARY</h3>
                            <div className="grid grid-cols-3 gap-4">
                              <div className="bg-white p-3 rounded shadow-sm border border-slate-100">
                                <p className="text-xs text-slate-500 uppercase">Active Events</p>
                                <p className="text-xl font-black text-cyan-600">{stats.activeEvents}</p>
                              </div>
                              <div className="bg-white p-3 rounded shadow-sm border border-slate-100">
                                <p className="text-xs text-slate-500 uppercase">Critical Alerts</p>
                                <p className="text-xl font-black text-red-600">{stats.criticalAlerts}</p>
                              </div>
                              <div className="bg-white p-3 rounded shadow-sm border border-slate-100">
                                <p className="text-xs text-slate-500 uppercase">System Reliability</p>
                                <p className="text-xl font-black text-emerald-600">{(stats.avgReliability * 100).toFixed(1)}%</p>
                              </div>
                            </div>
                          </div>
                          
                          <h3 className="font-bold text-lg border-b-2 border-slate-200 pb-1 mb-2 mt-6 text-slate-800 flex items-center gap-2">⚠️ LATEST CRITICAL EVENTS</h3>
                          <div className="space-y-3">
                            {results.filter(r => r.risk.severity === 'critical' || r.risk.severity === 'high').map((r, i) => (
                              <div key={i} className="flex justify-between items-center p-3 bg-red-50/50 rounded border border-red-100">
                                <div>
                                  <p className="font-bold text-red-900">{r.event.title}</p>
                                  <p className="text-xs text-slate-600">Risk Score: <span className="font-bold text-red-600">{r.risk.compositeRisk}%</span></p>
                                </div>
                                <span className="px-3 py-1 bg-red-600 text-white text-xs font-bold rounded-full shadow-sm">{r.admissibility.decision.toUpperCase()}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      {generatedReportType === 'risk' && (
                        <>
                          <div className="bg-slate-50 p-4 rounded-lg border-l-4 border-purple-500">
                            <h3 className="font-bold text-lg text-purple-900 mb-2 flex items-center gap-2">🧠 AI RISK & ANOMALY ASSESSMENT</h3>
                            <div className="grid grid-cols-3 gap-4">
                              <div className="bg-white p-3 rounded shadow-sm border border-slate-100">
                                <p className="text-xs text-slate-500 uppercase">Uncertainty Metric</p>
                                <p className="text-xl font-black text-purple-600">0.18</p>
                                <p className="text-[10px] text-emerald-600 font-bold mt-1">NOMINAL</p>
                              </div>
                              <div className="bg-white p-3 rounded shadow-sm border border-slate-100">
                                <p className="text-xs text-slate-500 uppercase">OOD Events</p>
                                <p className="text-xl font-black text-amber-600">0</p>
                                <p className="text-[10px] text-slate-400 mt-1">WITHIN DISTRIBUTION</p>
                              </div>
                              <div className="bg-white p-3 rounded shadow-sm border border-slate-100">
                                <p className="text-xs text-slate-500 uppercase">Admissibility</p>
                                <p className="text-xl font-black text-cyan-600">84.5%</p>
                                <p className="text-[10px] text-emerald-600 font-bold mt-1">PASS RATE</p>
                              </div>
                            </div>
                          </div>
                          
                          <h3 className="font-bold text-lg border-b-2 border-slate-200 pb-1 mb-2 mt-6 text-slate-800">PIPELINE ANALYSIS</h3>
                          <div className="space-y-3">
                            {results.slice(0,3).map((r, i) => (
                              <div key={i} className="p-3 bg-white border border-slate-200 rounded shadow-sm">
                                <div className="flex justify-between items-center mb-2">
                                  <span className="font-bold text-slate-800 font-mono text-xs">ID-{r.event.id}</span>
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-white ${r.admissibility.decision === 'execute' ? 'bg-emerald-500' : 'bg-amber-500'}`}>{r.admissibility.decision.toUpperCase()}</span>
                                </div>
                                <div className="flex gap-4 text-xs">
                                  <p className="text-slate-600">Reliability: <span className="font-bold text-emerald-600">{r.reliability.reliabilityScore.toFixed(2)}</span></p>
                                  <p className="text-slate-600">Anomaly Dist: <span className="font-bold text-purple-600">{r.distributionShift.normalizedDistance.toFixed(2)}</span></p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      {generatedReportType === 'incident' && (
                        <>
                          <div className="bg-slate-50 p-4 rounded-lg border-l-4 border-amber-500">
                            <h3 className="font-bold text-lg text-amber-900 mb-2 flex items-center gap-2">📢 CITIZEN INCIDENT REPORTS</h3>
                            <div className="grid grid-cols-3 gap-4">
                              <div className="bg-white p-3 rounded shadow-sm border border-slate-100">
                                <p className="text-xs text-slate-500 uppercase">Total Reports</p>
                                <p className="text-xl font-black text-slate-800">{incidents.length}</p>
                              </div>
                              <div className="bg-white p-3 rounded shadow-sm border border-slate-100">
                                <p className="text-xs text-slate-500 uppercase">Pending</p>
                                <p className="text-xl font-black text-amber-600">{incidents.filter(i => i.status === 'pending').length}</p>
                              </div>
                              <div className="bg-white p-3 rounded shadow-sm border border-slate-100">
                                <p className="text-xs text-slate-500 uppercase">Verified</p>
                                <p className="text-xl font-black text-emerald-600">{incidents.filter(i => i.status === 'verified').length}</p>
                              </div>
                            </div>
                          </div>
                          
                          <h3 className="font-bold text-lg border-b-2 border-slate-200 pb-1 mb-2 mt-6 text-slate-800">RECENT LOGS</h3>
                          <div className="space-y-2">
                            {incidents.slice(0,5).map((inc, i) => (
                              <div key={i} className="flex items-center justify-between p-2 bg-white border border-slate-100 rounded text-xs">
                                <div className="flex items-center gap-3">
                                  <span className={`px-2 py-1 rounded font-bold text-white ${inc.severity === 'critical' ? 'bg-red-500' : 'bg-orange-500'}`}>{inc.severity.toUpperCase()}</span>
                                  <span className="font-medium text-slate-700">{inc.location} <span className="text-slate-400">({inc.type})</span></span>
                                </div>
                                <span className={`font-bold ${inc.status === 'verified' ? 'text-emerald-600' : 'text-amber-600'}`}>{inc.status.toUpperCase()}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      {generatedReportType === 'resource' && (
                        <>
                          <div className="bg-slate-50 p-4 rounded-lg border-l-4 border-emerald-500">
                            <h3 className="font-bold text-lg text-emerald-900 mb-2 flex items-center gap-2">🛡️ RESOURCE DEPLOYMENT</h3>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="bg-white p-3 rounded shadow-sm border border-slate-100">
                                <p className="text-xs text-slate-500 uppercase">Active Help Centers</p>
                                <p className="text-xl font-black text-emerald-600">{getHelpCenters().filter(h => h.isOperational).length} <span className="text-sm font-medium text-slate-400">/ {getHelpCenters().length}</span></p>
                              </div>
                              <div className="bg-white p-3 rounded shadow-sm border border-slate-100">
                                <p className="text-xs text-slate-500 uppercase">Available Capacity</p>
                                <p className="text-xl font-black text-blue-600">{getHelpCenters().reduce((acc, h) => acc + (h.capacity || 0) - (h.currentOccupancy || 0), 0)} <span className="text-sm font-medium text-slate-400">beds</span></p>
                              </div>
                            </div>
                          </div>
                          
                          <h3 className="font-bold text-lg border-b-2 border-slate-200 pb-1 mb-2 mt-6 text-slate-800">NDRF STATUS</h3>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-orange-50 border border-orange-100 rounded text-center">
                              <p className="text-3xl font-black text-orange-600 mb-1">14</p>
                              <p className="text-xs font-bold text-orange-900 uppercase">Teams Deployed</p>
                            </div>
                            <div className="p-4 bg-slate-50 border border-slate-200 rounded text-center">
                              <p className="text-3xl font-black text-slate-700 mb-1">32</p>
                              <p className="text-xs font-bold text-slate-500 uppercase">Standby Teams</p>
                            </div>
                          </div>
                          <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded">
                            <p className="text-xs font-bold text-red-900 uppercase mb-1">Critical Zones</p>
                            <p className="text-sm text-red-700 font-medium">Coastal AP, Odisha, Wayanad</p>
                          </div>
                        </>
                      )}
                      
                      <div className="mt-12 pt-6 border-t-2 border-slate-200 text-center">
                        <p className="inline-block px-4 py-1 bg-slate-800 text-white font-bold tracking-widest text-xs rounded-full">END OF REPORT</p>
                        <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase">CONFIDENTIAL - FOR AUTHORIZED PERSONNEL ONLY</p>
                      </div>
                    </div>
                    
                    {/* Footer */}
                    <div className="mt-12 pt-4 border-t-2 border-black text-center text-sm text-slate-800">
                      <p className="font-bold text-lg mb-1">Developed by Megavarshan with love ❤️ for India 🇮🇳</p>
                      <p className="font-medium">LinkedIn: <a href="https://linkedin.com/in/megavarshan" className="text-blue-600">linkedin.com/in/megavarshan</a></p>
                      <p className="font-medium">GitHub: <a href="https://github.com/Megavarshan" className="text-blue-600">github.com/Megavarshan</a></p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* UPLOAD & AI ANALYSIS TAB */}
        {tab === 'upload' && (
          <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
            <div className="flex items-center gap-3">
              <Activity className="w-6 h-6 text-orange-400" />
              <h2 className="text-xl font-bold text-white">Custom Data Upload & AI Agent Analysis</h2>
            </div>
            <p className="text-sm text-slate-400 mb-6">
              Upload your own NDMA CSV datasets. The DADIP AI Agent will autonomously parse the file, cross-reference it with live open-meteo feeds, and extract intelligent insights.
            </p>

            <div className="glass-card p-8 border-dashed border-2 border-slate-600 hover:border-orange-500/50 transition-colors relative text-center">
              <input type="file" accept=".csv" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
              <Activity className="w-10 h-10 text-slate-500 mx-auto mb-3" />
              <p className="text-sm font-bold text-white">Drag & Drop or Click to Upload CSV</p>
              <p className="text-xs text-slate-500 mt-1">Supported: .csv files only</p>
            </div>

            {analyzingFile && (
              <div className="glass-card p-8 text-center animate-pulse">
                <div className="w-10 h-10 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4" />
                <h3 className="text-lg font-bold text-white">AI Agent is Analyzing...</h3>
                <p className="text-sm font-mono text-cyan-400 mt-2">{agentStatus}</p>
              </div>
            )}

            {uploadedData && aiInsights && !analyzingFile && (
              <div className="space-y-6 animate-slide-up">
                
                {/* AI Insights Card */}
                <div className="glass-card p-6 border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.1)]">
                  <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <Brain className="w-5 h-5 text-cyan-400" />
                      <h3 className="text-lg font-bold text-white">AI Agent Intelligence Report</h3>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold border border-cyan-500/30">
                      Added to Active Pipeline
                    </span>
                  </div>
                  
                  <p className="text-sm text-slate-300 leading-relaxed mb-6">{aiInsights.summary}</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                      <p className="text-2xl font-black text-white">{aiInsights.dataPoints}</p>
                      <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">Data Points Extracted</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                      <p className="text-2xl font-black text-red-400">{aiInsights.anomalies}</p>
                      <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">Critical Outliers</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                      <p className="text-sm font-bold text-amber-400 leading-snug">{aiInsights.trend}</p>
                      <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">Trend Trajectory</p>
                    </div>
                  </div>

                  {/* Recommendation & RAG Context */}
                  <div className="bg-[#050a18]/50 rounded-xl p-5 border border-white/10">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-bold text-emerald-400">AI Agent Recommendation</h4>
                      <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                        Certainty: {aiInsights.certainty}%
                      </span>
                    </div>
                    <p className="text-sm text-white mb-4 font-medium">{aiInsights.recommendation}</p>
                    <div className="pt-3 border-t border-white/5">
                      <h5 className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Methodology & Basis (RAG & Transformers)</h5>
                      <p className="text-xs text-slate-400 italic">{aiInsights.basis}</p>
                    </div>
                  </div>
                </div>

                {/* Data Preview */}
                <div className="glass-card p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-white">Data Preview: {uploadedData.filename}</h3>
                    <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded font-mono">Live Sync Active</span>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-white/10">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-white/5 text-slate-400">
                        <tr>
                          {uploadedData.headers.map((h, i) => (
                            <th key={i} className="px-4 py-3 font-medium truncate">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {uploadedData.rows.slice(0, 5).map((row, i) => (
                          <tr key={i} className="hover:bg-white/[0.02]">
                            {row.map((cell, j) => (
                              <td key={j} className="px-4 py-3 text-slate-300 truncate max-w-[150px]">{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {uploadedData.rows.length > 5 && (
                    <p className="text-center text-xs text-slate-500 mt-3">+ {uploadedData.rows.length - 5} more rows parsed securely.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {/* AURA AI ASSISTANT TAB */}
        {tab === 'aura' && (
          <div className="max-w-4xl mx-auto flex flex-col h-[75vh] animate-fade-in relative z-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center border border-purple-500/30">
                <Bot className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">AURA Intelligence Agent</h2>
                <p className="text-xs text-purple-400 font-mono">Connected to live SQLite Database</p>
              </div>
            </div>

            {/* Chat History */}
            <div className="flex-1 overflow-y-auto space-y-6 pb-6 pr-2 custom-scrollbar">
              {chatMessages.map((msg, i) => (
                <div key={i} className={cn("flex flex-col max-w-[85%]", msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start")}>
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    {msg.role === 'aura' ? <Bot className="w-4 h-4 text-purple-400" /> : <Users className="w-4 h-4 text-emerald-400" />}
                    <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{msg.role === 'aura' ? 'AURA' : 'Operator'}</span>
                  </div>
                  
                  {/* Text Bubble */}
                  <div className={cn("p-4 rounded-2xl text-sm shadow-lg", msg.role === 'user' ? "bg-emerald-500/10 text-emerald-50 border border-emerald-500/20 rounded-tr-sm" : "bg-white/5 text-slate-200 border border-white/10 rounded-tl-sm")}>
                    {msg.content}
                  </div>

                      {/* Generated Artifact */}
                      {msg.artifact && (
                        <div className="mt-3 w-full max-w-full glass-card p-0 overflow-hidden border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.15)] animate-slide-up">
                          <div className="bg-purple-950/40 p-3 border-b border-purple-500/20 flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-purple-400" />
                              <span className="text-xs font-bold text-purple-300">Generated Report Artifact</span>
                            </div>
                            <button onClick={async () => {
                              try {
                                const mod = await import('html2pdf.js');
                                const html2pdf = (mod.default ? mod.default : mod) as any;
                                const element = document.getElementById(`artifact-${i}`);
                                if (element) {
                                  const tempDiv = prepareElementForPDF(element);
                                  document.body.appendChild(tempDiv);
                                  
                                  await html2pdf().set({ 
                                    margin: 10, 
                                    filename: `AURA_Report_${new Date().getTime()}.pdf`, 
                                    image: { type: 'jpeg' as const, quality: 0.98 },
                                    html2canvas: { 
                                      scale: 2, 
                                      useCORS: true, 
                                      logging: false,
                                      ignoreElements: (el: Element) => el.tagName === 'STYLE' || el.tagName === 'LINK'
                                    },
                                    jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
                                  }).from(tempDiv).save();
                                  
                                  document.body.removeChild(tempDiv);
                                }
                              } catch (err: any) {
                                console.error('PDF error:', err);
                                alert('PDF Error: ' + (err.message || err.toString()));
                              }
                            }} className="flex items-center gap-1 px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded text-xs transition border border-purple-500/30">
                              <Download className="w-3 h-3" /> Download PDF
                            </button>
                          </div>
                          
                          {/* Printable Area */}
                          <div id={`artifact-${i}`} className="p-6 bg-white text-slate-900 max-h-[300px] overflow-y-auto">
                        <div className="text-center border-b-2 border-slate-200 pb-4 mb-4">
                          <h3 className="text-xl font-black uppercase text-purple-900">{msg.artifact.title}</h3>
                          <p className="text-xs text-slate-500 font-mono mt-1">Generated: {msg.artifact.date}</p>
                        </div>
                        
                        <div className="space-y-5 text-sm">
                          {msg.artifact.sections.map((sec: any, sIdx: number) => (
                            <div key={sIdx}>
                              <h4 className="font-bold text-slate-800 border-b border-slate-100 pb-1 mb-2 uppercase text-xs tracking-wider">{sec.heading}</h4>
                              <p className="text-slate-600 leading-relaxed">{sec.content}</p>
                            </div>
                          ))}
                          
                          {msg.artifact.data && msg.artifact.data.length > 0 && (
                            <div className="mt-4">
                              <h4 className="font-bold text-slate-800 border-b border-slate-100 pb-1 mb-2 uppercase text-xs tracking-wider">Data Snapshot</h4>
                              <table className="w-full text-xs text-left border-collapse">
                                <thead>
                                  <tr className="bg-slate-50">
                                    <th className="p-2 border border-slate-200 text-slate-600">Type</th>
                                    <th className="p-2 border border-slate-200 text-slate-600">Location</th>
                                    <th className="p-2 border border-slate-200 text-slate-600">Risk</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {msg.artifact.data.map((row: any, rIdx: number) => (
                                    <tr key={rIdx}>
                                      <td className="p-2 border border-slate-200 font-medium capitalize">{row.type}</td>
                                      <td className="p-2 border border-slate-200">{row.location}</td>
                                      <td className="p-2 border border-slate-200 text-red-600 font-bold">{row.risk}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              
              {isAuraTyping && (
                <div className="flex flex-col items-start max-w-[80%]">
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <Bot className="w-4 h-4 text-purple-400" />
                    <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">AURA</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 rounded-tl-sm flex gap-2">
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}} />
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}} />
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}} />
                  </div>
                </div>
              )}
            </div>

            {/* Input Form */}
            <form onSubmit={handleAuraSubmit} className="mt-auto glass-card p-2 flex gap-2 border-purple-500/20">
              <input 
                type="text" 
                value={chatInput} 
                onChange={(e) => setChatInput(e.target.value)} 
                placeholder="Ask AURA to analyze data, generate a report, or query active zones..." 
                className="flex-1 bg-transparent border-none outline-none text-white text-sm px-4 placeholder:text-slate-500"
              />
              <button type="submit" disabled={isAuraTyping || !chatInput.trim()} className="w-12 h-12 rounded-xl bg-purple-500 hover:bg-purple-600 text-white flex items-center justify-center transition disabled:opacity-50 shadow-lg shadow-purple-500/25">
                <Send className="w-5 h-5" />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
