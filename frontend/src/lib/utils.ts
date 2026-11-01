import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getSeverityColor(s: string) {
  const map: Record<string, string> = { critical: 'text-red-400', high: 'text-orange-400', moderate: 'text-amber-400', low: 'text-emerald-400' };
  return map[s] || 'text-slate-400';
}

export function getSeverityBg(s: string) {
  const map: Record<string, string> = {
    critical: 'bg-red-500/15 border-red-500/25',
    high: 'bg-orange-500/15 border-orange-500/25',
    moderate: 'bg-amber-500/15 border-amber-500/25',
    low: 'bg-emerald-500/15 border-emerald-500/25',
  };
  return map[s] || 'bg-slate-500/15 border-slate-500/25';
}

export function getAlertLevelColor(l: string) {
  const map: Record<string, { bg: string; text: string; border: string }> = {
    red: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30' },
    orange: { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' },
    yellow: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
    green: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  };
  return map[l] || map.green;
}

export function getDecisionStyles(d: string) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    execute: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'EXECUTE' },
    defer: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'DEFER' },
    abstain: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'ABSTAIN' },
  };
  return map[d] || { bg: 'bg-slate-500/15', text: 'text-slate-400', label: 'UNKNOWN' };
}

export function getDisasterIcon(type: string) {
  const map: Record<string, string> = { cyclone: '🌀', tsunami: '🌊', flood: '🌧️', earthquake: '🌍' };
  return map[type] || '⚠️';
}

export function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function formatPercent(v: number, d = 0): string {
  return `${(v <= 1 ? v * 100 : v).toFixed(d)}%`;
}
