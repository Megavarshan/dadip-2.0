'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Shield, AlertTriangle, MapPin, Phone, Send, ArrowLeft, Mic, MicOff, Activity, Users, Heart, Globe } from 'lucide-react';
import { cn, getDisasterIcon, getSeverityColor, getSeverityBg, timeAgo, getDecisionStyles } from '@/lib/utils';
import { fetchAndProcessAll, computeStats, getHelpCenters, getIncidentReports, addIncidentReport } from '@/lib/services';
import type { PipelineResult, IncidentReport, HelpCenter, DisasterType, Language } from '@/lib/types';
import { LANGUAGES } from '@/lib/types';
import { t } from '@/lib/i18n/translations';

const DisasterMap = dynamic(() => import('@/components/map/disaster-map'), { ssr: false, loading: () => <div className="h-[400px] rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-center"><span className="text-sm text-slate-500">Loading map...</span></div> });

export default function PublicDashboardClient() {
  const [results, setResults] = useState<PipelineResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<Language>('en');
  const [tab, setTab] = useState<'warnings' | 'report' | 'help' | 'safety'>('warnings');
  const [isListening, setIsListening] = useState(false);
  const [reportForm, setReportForm] = useState({ name: '', phone: '', type: 'flood' as DisasterType, description: '', location: '', latitude: 13.0, longitude: 80.0, severity: 'moderate' as 'low' | 'moderate' | 'high' | 'critical' });
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const helpCenters = getHelpCenters();
  const incidents = getIncidentReports();

  useEffect(() => { fetchAndProcessAll().then(d => { setResults(d); setLoading(false); }).catch(() => setLoading(false)); }, []);

  const stats = computeStats(results);
  const criticalEvents = results.filter(r => r.risk.severity === 'critical' || r.risk.severity === 'high');
  const alerts = results.filter(r => r.alert).map(r => r.alert!).slice(0, 10);

  const handleReport = () => {
    addIncidentReport({ ...reportForm, reporterName: reportForm.name, reporterPhone: reportForm.phone, imageUrl: undefined });
    setReportSubmitted(true);
    setTimeout(() => setReportSubmitted(false), 3000);
    setReportForm({ name: '', phone: '', type: 'flood', description: '', location: '', latitude: 13.0, longitude: 80.0, severity: 'moderate' });
  };

  const toggleVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert('Voice not supported in this browser'); return; }
    
    if (isListening) {
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = lang === 'en' ? 'en-IN' : lang === 'ta' ? 'ta-IN' : lang === 'hi' ? 'hi-IN' : lang === 'te' ? 'te-IN' : 'kn-IN';
    recognition.continuous = false;
    
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      alert(`Voice recognized: "${transcript}"\n(AI Assistant processing command...)`);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    
    recognition.start();
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#050a18' }}>
      <div className="text-center"><div className="w-12 h-12 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4" /><p className="text-sm text-slate-400">{t('msg.loading', lang)}</p></div>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: '#050a18' }}>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#050a18]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-slate-400 hover:text-white"><ArrowLeft className="w-4 h-4" /></Link>
            <Shield className="w-6 h-6 text-cyan-400" />
            <span className="font-bold text-white">DADIP</span>
            <span className="text-xs text-slate-500 hidden sm:inline">Public Dashboard</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Language Selector */}
            <select value={lang} onChange={e => setLang(e.target.value as Language)} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-300">
              {Object.entries(LANGUAGES).map(([k, v]) => <option key={k} value={k} className="bg-[#0a1128]">{v}</option>)}
            </select>
            {/* Voice */}
            <button onClick={toggleVoice} className={cn('p-2 rounded-lg transition', isListening ? 'bg-red-500/20 text-red-400' : 'bg-white/5 text-slate-400 hover:text-white')}>
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            {/* Live indicator */}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-emerald-400 font-medium">LIVE</span>
            </div>
          </div>
        </div>
      </header>

      {/* Emergency Banner */}
      {criticalEvents.length > 0 && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 animate-pulse flex-shrink-0" />
            <div className="flex-1 overflow-hidden">
              <p className="text-sm text-red-400 font-semibold truncate">
                ⚠️ {criticalEvents[0].event.title} — {criticalEvents[0].event.description}
              </p>
            </div>
            <span className="text-xs text-red-400/60">{timeAgo(criticalEvents[0].event.timestamp)}</span>
          </div>
        </div>
      )}

      {/* Stats Bar */}
      <div className="border-b border-white/5 px-4 py-4">
        <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Activity, label: t('label.liveEvents', lang), value: stats.activeEvents, color: 'text-cyan-400' },
            { icon: AlertTriangle, label: 'Critical Alerts', value: stats.criticalAlerts, color: 'text-red-400' },
            { icon: Heart, label: t('label.helpCenters', lang), value: stats.helpCentersActive, color: 'text-emerald-400' },
            { icon: Users, label: t('label.incidentReports', lang), value: stats.incidentReports, color: 'text-purple-400' },
          ].map((s, i) => (
            <div key={i} className="glass-card p-3 flex items-center gap-3">
              <s.icon className={cn('w-5 h-5', s.color)} />
              <div>
                <p className={cn('text-lg font-bold', s.color)}>{s.value}</p>
                <p className="text-[10px] text-slate-500 uppercase">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-white/5 px-4">
        <div className="max-w-7xl mx-auto flex gap-1 overflow-x-auto py-2">
          {[
            { key: 'warnings' as const, label: t('label.recentAlerts', lang), icon: '⚠️' },
            { key: 'report' as const, label: t('nav.reportIncident', lang), icon: '📝' },
            { key: 'help' as const, label: t('label.helpCenters', lang), icon: '🏥' },
            { key: 'safety' as const, label: t('label.safetyTips', lang), icon: '🛡️' },
          ].map(tb => (
            <button key={tb.key} onClick={() => setTab(tb.key)}
              className={cn('px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap flex items-center gap-2',
                tab === tb.key ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20' : 'text-slate-400 hover:bg-white/5')}>
              <span>{tb.icon}</span>{tb.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* WARNINGS TAB */}
        {tab === 'warnings' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-lg font-bold text-white">🗺️ {t('nav.map', lang)}</h2>
              <DisasterMap events={results.map(r => r.event)} height="400px" center={[20.5, 79]} zoom={4} />
              <h2 className="text-lg font-bold text-white mt-6">📋 Active Warnings</h2>
              <div className="space-y-3">
                {alerts.map(alert => {
                  const ds = getDecisionStyles(alert.decision);
                  return (
                    <div key={alert.id} className={cn('glass-card p-4', alert.level === 'red' && 'glow-red')}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{getDisasterIcon(alert.disasterType)}</span>
                          <div>
                            <h4 className="text-sm font-semibold text-white">{alert.title}</h4>
                            <div className="flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3 text-slate-500" /><span className="text-xs text-slate-500">{alert.location}</span></div>
                          </div>
                        </div>
                        <span className={cn('px-2 py-1 rounded-lg text-[10px] font-bold uppercase', `badge-${alert.level}`)}>{alert.level}</span>
                      </div>
                      <p className="text-xs text-slate-400 mb-2">{alert.message}</p>
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className="text-slate-500">Risk: <span className="text-white font-medium">{alert.riskScore}%</span></span>
                        <span className="text-slate-500">Admissibility: <span className="text-cyan-400 font-medium">{alert.admissibilityScore.toFixed(2)}</span></span>
                        <span className={cn('px-2 py-0.5 rounded-full font-bold', ds.bg, ds.text)}>{ds.label}</span>
                        <span className="text-slate-600 ml-auto">{timeAgo(alert.timestamp)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Sidebar: Emergency Contacts */}
            <div className="space-y-4">
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold text-white mb-3">🆘 {t('label.emergencyContacts', lang)}</h3>
                <div className="space-y-3">
                  {[
                    { name: 'National Disaster Helpline', num: '1078' },
                    { name: 'NDRF Control Room', num: '011-24363260' },
                    { name: 'Police Emergency', num: '100' },
                    { name: 'Ambulance', num: '108' },
                    { name: 'Fire Brigade', num: '101' },
                  ].map((c, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02]">
                      <span className="text-xs text-slate-400">{c.name}</span>
                      <a href={`tel:${c.num}`} className="flex items-center gap-1 text-xs text-cyan-400 font-bold"><Phone className="w-3 h-3" />{c.num}</a>
                    </div>
                  ))}
                </div>
              </div>
              {/* Recent Incidents */}
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold text-white mb-3">📢 Citizen Reports</h3>
                <div className="space-y-2">
                  {incidents.slice(0, 5).map(ir => (
                    <div key={ir.id} className={cn('p-3 rounded-xl border', getSeverityBg(ir.severity))}>
                      <div className="flex items-center gap-2 mb-1">
                        <span>{getDisasterIcon(ir.type)}</span>
                        <span className="text-xs font-medium text-white">{ir.reporterName}</span>
                        <span className={cn('ml-auto text-[10px] px-1.5 py-0.5 rounded', ir.status === 'verified' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400')}>{ir.status}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-2">{ir.description}</p>
                      <p className="text-[10px] text-slate-600 mt-1">{ir.location} • {timeAgo(ir.timestamp)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* REPORT INCIDENT TAB */}
        {tab === 'report' && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-lg font-bold text-white mb-6">📝 {t('action.reportIncident', lang)}</h2>
            {reportSubmitted && (
              <div className="mb-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400">✅ {t('msg.reportSubmitted', lang)}</div>
            )}
            <div className="glass-card p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs text-slate-400 block mb-1">Your Name</label><input value={reportForm.name} onChange={e => setReportForm(p => ({ ...p, name: e.target.value }))} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/30" placeholder="Enter your name" /></div>
                <div><label className="text-xs text-slate-400 block mb-1">Phone Number</label><input value={reportForm.phone} onChange={e => setReportForm(p => ({ ...p, phone: e.target.value }))} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/30" placeholder="+91-XXXXXXXXXX" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs text-slate-400 block mb-1">Disaster Type</label>
                  <select value={reportForm.type} onChange={e => setReportForm(p => ({ ...p, type: e.target.value as DisasterType }))} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-cyan-500/30">
                    <option value="flood" className="bg-[#0a1128]">🌧️ Flood</option>
                    <option value="cyclone" className="bg-[#0a1128]">🌀 Cyclone</option>
                    <option value="earthquake" className="bg-[#0a1128]">🌍 Earthquake</option>
                    <option value="tsunami" className="bg-[#0a1128]">🌊 Tsunami</option>
                  </select>
                </div>
                <div><label className="text-xs text-slate-400 block mb-1">Severity</label>
                  <select value={reportForm.severity} onChange={e => setReportForm(p => ({ ...p, severity: e.target.value as 'low' | 'moderate' | 'high' | 'critical' }))} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-cyan-500/30">
                    <option value="low" className="bg-[#0a1128]">Low</option>
                    <option value="moderate" className="bg-[#0a1128]">Moderate</option>
                    <option value="high" className="bg-[#0a1128]">High</option>
                    <option value="critical" className="bg-[#0a1128]">Critical</option>
                  </select>
                </div>
              </div>
              <div><label className="text-xs text-slate-400 block mb-1">Location</label><input value={reportForm.location} onChange={e => setReportForm(p => ({ ...p, location: e.target.value }))} className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/30" placeholder="e.g., Wayanad, Kerala" /></div>
              <div><label className="text-xs text-slate-400 block mb-1">Description</label><textarea value={reportForm.description} onChange={e => setReportForm(p => ({ ...p, description: e.target.value }))} rows={4} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/30 resize-none" placeholder="Describe the situation..." /></div>
              <button onClick={handleReport} className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-cyan-500/25 transition-all">
                <Send className="w-4 h-4" /> Submit Report
              </button>
            </div>
          </div>
        )}

        {/* HELP CENTERS TAB */}
        {tab === 'help' && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-white">🏥 {t('label.helpCenters', lang)}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {helpCenters.map(hc => (
                <div key={hc.id} className="glass-card p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-semibold text-white">{hc.name}</h4>
                      <p className="text-xs text-slate-500">{hc.type.replace('_', ' ').toUpperCase()}</p>
                    </div>
                    <span className={cn('w-2.5 h-2.5 rounded-full', hc.isOperational ? 'bg-emerald-400' : 'bg-red-400')} />
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-400">
                    <p className="flex items-center gap-2"><MapPin className="w-3 h-3" /> {hc.address}</p>
                    <p className="flex items-center gap-2"><Phone className="w-3 h-3" /> <a href={`tel:${hc.phone}`} className="text-cyan-400">{hc.phone}</a></p>
                    <p>📍 {hc.state}</p>
                    {hc.capacity && <p>Capacity: {hc.currentOccupancy ?? 0}/{hc.capacity}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SAFETY TIPS TAB */}
        {tab === 'safety' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <h2 className="text-lg font-bold text-white">🛡️ {t('label.safetyTips', lang)}</h2>
            {[
              { type: '🌀 Cyclone', tips: ['Move to the nearest cyclone shelter', 'Stay away from the coast and low-lying areas', 'Store emergency food, water, and medicines', 'Keep important documents in waterproof bags', 'Follow IMD bulletins regularly'] },
              { type: '🌊 Tsunami', tips: ['If you feel strong shaking near the coast, move to higher ground immediately', 'Do NOT wait for official warnings — natural signs are your first alert', 'Stay away from the beach and harbor areas', 'Follow INCOIS tsunami bulletins', 'Have an evacuation route planned'] },
              { type: '🌧️ Flood', tips: ['Move to higher ground if water levels are rising', 'Avoid walking or driving through flood waters', 'Turn off electricity and gas if water enters your home', 'Keep emergency supplies ready during monsoon season', 'Contact NDRF helpline: 011-24363260'] },
              { type: '🌍 Earthquake', tips: ['DROP, COVER, and HOLD ON during shaking', 'Stay away from windows, heavy furniture, and glass', 'If outdoors, move to an open area away from buildings', 'After shaking stops, check for injuries and damage', 'Be prepared for aftershocks'] },
            ].map((section, i) => (
              <div key={i} className="glass-card p-5">
                <h3 className="text-sm font-semibold text-white mb-3">{section.type} Safety</h3>
                <ul className="space-y-2">
                  {section.tips.map((tip, j) => (
                    <li key={j} className="flex items-start gap-2 text-xs text-slate-400">
                      <span className="text-emerald-400 mt-0.5">•</span>{tip}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
