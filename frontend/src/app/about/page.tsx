import Link from 'next/link';
import { ArrowLeft, Mail, ExternalLink, Award, BookOpen, Brain, Briefcase } from 'lucide-react';

export const metadata = {
  title: 'About the Developer — Megavarshan A',
  description: 'Megavarshan A, Final Year AI Undergrad at SRMIST, Co-Founder of Foresight-X Research Labs.',
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#050a18]">
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#050a18]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-4">
          <Link href="/" className="text-slate-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></Link>
          <span className="text-lg font-bold text-white">About the Developer</span>
        </div>
      </nav>

      <main className="pt-24 pb-20 px-6">
        <div className="max-w-4xl mx-auto space-y-8">
          
          {/* Header Profile */}
          <div className="glass-card p-8 flex flex-col md:flex-row items-center gap-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            
            <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 p-1 flex-shrink-0 z-10">
              <div className="w-full h-full rounded-2xl overflow-hidden bg-[#050a18] flex items-center justify-center relative">
                <img src="/megavarshan.jpeg" alt="Megavarshan A" className="absolute inset-0 w-full h-full object-cover z-10" />
                <div className="text-4xl absolute z-0">👨‍💻</div>
              </div>
            </div>
            
            <div className="text-center md:text-left z-10">
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Megavarshan A</h1>
              <p className="text-lg text-cyan-400 mb-4">AI Researcher & Full-Stack Developer</p>
              
              <div className="flex flex-wrap justify-center md:justify-start gap-4 text-sm text-slate-300">
                <a href="https://github.com/Megavarshan" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-white transition bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
                  <span>🔗</span> GitHub
                </a>
                <a href="https://linkedin.com/in/megavarshan" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-white transition bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
                  <span>🔗</span> LinkedIn
                </a>
                <a href="/resume.pdf" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-white transition bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
                  <ExternalLink className="w-4 h-4" /> View / Download Resume
                </a>
              </div>
            </div>
          </div>

          {/* Credentials */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-card p-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                <BookOpen className="w-5 h-5 text-cyan-400" /> Education
              </h2>
              <p className="text-white font-medium">B.Tech in Artificial Intelligence</p>
              <p className="text-sm text-slate-400">SRM Institute of Science and Technology (SRMIST), Chennai</p>
              <p className="text-xs text-slate-500 mt-1">Final Year Undergraduate</p>
            </div>
            
            <div className="glass-card p-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                <Briefcase className="w-5 h-5 text-purple-400" /> Experience
              </h2>
              <p className="text-white font-medium">Co-Founder</p>
              <p className="text-sm text-slate-400">Foresight-X Research Labs</p>
              <p className="text-xs text-slate-500 mt-1">Leading AI initiatives and intelligent systems research.</p>
            </div>
          </div>

          {/* Research & Awards */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
              <Award className="w-5 h-5 text-amber-400" /> Awards & Research
            </h2>
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <p className="font-bold text-amber-400">Award Winner at SRM Research Day 2026</p>
                <p className="text-sm text-slate-300 mt-1">Recognized for groundbreaking research in AI reliability and advanced cognitive architectures for disaster intelligence.</p>
              </div>
              
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <p className="font-bold text-white">DADIP: Disaster Intelligence Platform</p>
                <p className="text-sm text-slate-400 mt-1">
                  Spearheaded the development of a smart disaster response system. The project integrates real-time satellite and seismic data with advanced uncertainty estimation algorithms to ensure government agencies act on highly reliable predictions, ultimately reducing false alarms and unsafe operations.
                </p>
              </div>
            </div>
          </div>

          {/* Skills */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
              <Brain className="w-5 h-5 text-emerald-400" /> Technical Expertise
            </h2>
            <div className="flex flex-wrap gap-2">
              {['Artificial Intelligence', 'Machine Learning', 'Next.js 15', 'React', 'TypeScript', 'Tailwind CSS', 'Three.js', 'Geospatial Mapping', 'API Integration', 'Data Science'].map(skill => (
                <span key={skill} className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-medium text-emerald-400">
                  {skill}
                </span>
              ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
