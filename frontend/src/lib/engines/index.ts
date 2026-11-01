// ============================================================
// AI Engines — All 5 engines in one file for India-focused disasters
// ============================================================

import type { PredictionInput, RiskAssessment, ReliabilityResult, DistributionShiftResult, AdmissibilityResult, ExplainabilityResult, FeatureContribution, Severity, DisasterType } from '@/lib/types';

// ========================= MODULE 3: RISK PREDICTION =========================

const CYCLONE_W = { rainfall: 0.15, humidity: 0.10, temperature: 0.05, windSpeed: 0.30, pressure: -0.20, coastalProximity: 0.10, historicalDensity: 0.05, weatherSeverity: 0.05 };
const TSUNAMI_W = { seismicActivity: 0.40, coastalProximity: 0.25, elevation: -0.15, historicalDensity: 0.10, pressure: 0.05, weatherSeverity: 0.05 };
const FLOOD_W = { rainfall: 0.30, humidity: 0.10, riverProximity: 0.15, elevation: -0.15, slope: -0.05, historicalDensity: 0.15, weatherSeverity: 0.10 };
const EARTHQUAKE_W = { seismicActivity: 0.45, historicalDensity: 0.20, elevation: 0.05, slope: 0.10, pressure: 0.05, weatherSeverity: 0.05, coastalProximity: 0.10 };

const BOUNDS: Record<string, [number, number]> = {
  rainfall: [0, 300], humidity: [0, 100], temperature: [-10, 50], windSpeed: [0, 250],
  pressure: [900, 1050], elevation: [0, 5000], slope: [0, 90], seismicActivity: [0, 1],
  coastalProximity: [0, 1], riverProximity: [0, 1], historicalDensity: [0, 1], weatherSeverity: [0, 1],
};

function norm(v: number, min: number, max: number) { return Math.max(0, Math.min(1, (v - min) / (max - min))); }

function hazardScore(input: PredictionInput, weights: Record<string, number>): number {
  const feats: Record<string, number> = { ...input } as unknown as Record<string, number>;
  let score = 0;
  for (const [f, w] of Object.entries(weights)) {
    const b = BOUNDS[f]; if (!b) continue;
    const n = norm(feats[f] ?? 0, b[0], b[1]);
    score += w < 0 ? Math.abs(w) * (1 - n) : w * n;
  }
  return Math.round((1 / (1 + Math.exp(-6 * (score - 0.5)))) * 100);
}

function severity(s: number): Severity { if (s >= 80) return 'critical'; if (s >= 60) return 'high'; if (s >= 35) return 'moderate'; return 'low'; }
function dominant(c: number, t: number, f: number, e: number): DisasterType {
  const m = Math.max(c, t, f, e);
  if (m === c) return 'cyclone'; if (m === t) return 'tsunami'; if (m === f) return 'flood'; return 'earthquake';
}

export function predictRisk(input: PredictionInput): RiskAssessment {
  const cycloneRisk = hazardScore(input, CYCLONE_W);
  const tsunamiRisk = hazardScore(input, TSUNAMI_W);
  const floodRisk = hazardScore(input, FLOOD_W);
  const earthquakeRisk = hazardScore(input, EARTHQUAKE_W);
  const max = Math.max(cycloneRisk, tsunamiRisk, floodRisk, earthquakeRisk);
  const avg = (cycloneRisk + tsunamiRisk + floodRisk + earthquakeRisk) / 4;
  const compositeRisk = Math.round(0.6 * max + 0.4 * avg);
  return { cycloneRisk, tsunamiRisk, floodRisk, earthquakeRisk, compositeRisk, severity: severity(compositeRisk), dominantHazard: dominant(cycloneRisk, tsunamiRisk, floodRisk, earthquakeRisk), timestamp: new Date() };
}

export function buildInput(
  weather: { rainfall: number; humidity: number; temperature: number; windSpeed: number; pressure?: number },
  geo: { latitude: number; longitude: number; elevation?: number; slope?: number },
  ctx: { historicalDensity?: number; seismicActivity?: number; coastalProximity?: number; riverProximity?: number; weatherSeverity?: number } = {}
): PredictionInput {
  const coastalP = ctx.coastalProximity ?? estimateCoastal(geo.latitude, geo.longitude);
  return {
    rainfall: weather.rainfall, humidity: weather.humidity, temperature: weather.temperature,
    windSpeed: weather.windSpeed, pressure: weather.pressure ?? 1013,
    elevation: geo.elevation ?? 200 + Math.abs(geo.latitude) * 5,
    slope: geo.slope ?? 5 + Math.random() * 15,
    latitude: geo.latitude, longitude: geo.longitude,
    historicalDensity: ctx.historicalDensity ?? 0.3,
    seismicActivity: ctx.seismicActivity ?? estimateSeismic(geo.latitude, geo.longitude),
    coastalProximity: coastalP,
    riverProximity: ctx.riverProximity ?? 0.4,
    weatherSeverity: ctx.weatherSeverity ?? Math.min(1, weather.rainfall / 100 * 0.4 + weather.windSpeed / 120 * 0.35),
  };
}

function estimateCoastal(lat: number, lng: number): number {
  // Indian coastal zones approximation
  if (lng < 68 || lng > 97 || lat < 6 || lat > 37) return 0.1;
  if (lat < 10 && lng > 76 && lng < 80) return 0.9; // Kerala/Tamil Nadu coast
  if (lat > 18 && lat < 22 && lng > 85 && lng < 90) return 0.85; // Odisha/Bengal coast
  if (lng < 73 && lat > 15 && lat < 22) return 0.8; // Gujarat/Maharashtra coast
  return 0.3;
}

function estimateSeismic(lat: number, lng: number): number {
  // Indian seismic zone approximation
  if (lat > 28 && lng > 77 && lng < 97) return 0.8; // Zone V: NE India, Himalayas
  if (lat > 25 && lat < 35 && lng > 74 && lng < 80) return 0.6; // Zone IV: North India
  if (lat > 8 && lat < 13 && lng > 92 && lng < 94) return 0.75; // Andaman
  return 0.2;
}

// ========================= MODULE 4: RELIABILITY =========================

const NORMAL_RANGES: Record<string, [number, number]> = {
  rainfall: [5, 80], humidity: [40, 85], temperature: [15, 40], windSpeed: [5, 60],
  pressure: [990, 1020], elevation: [50, 1500], seismicActivity: [0, 0.5],
  coastalProximity: [0, 0.8], historicalDensity: [0.1, 0.6], weatherSeverity: [0.1, 0.5],
};

export function estimateReliability(input: PredictionInput, risk: RiskAssessment): ReliabilityResult {
  const risks = [risk.cycloneRisk / 100, risk.tsunamiRisk / 100, risk.floodRisk / 100, risk.earthquakeRisk / 100];
  const safe = Math.max(0.01, 1 - Math.max(...risks));
  const all = [...risks, safe]; const tot = all.reduce((a, b) => a + b);
  const probs = all.map(p => p / tot);
  let entropy = 0; for (const p of probs) { if (p > 0) entropy -= p * Math.log2(p); }
  entropy /= Math.log2(5);

  const feats: Record<string, number> = input as unknown as Record<string, number>;
  let inRange = 0; const keys = Object.keys(NORMAL_RANGES);
  for (const [f, [mn, mx]] of Object.entries(NORMAL_RANGES)) { if (feats[f] >= mn && feats[f] <= mx) inRange++; }
  const coverage = inRange / keys.length;

  const sorted = [...risks].sort((a, b) => b - a);
  const calibration = 0.5 * (sorted[0] - sorted[1]) + 0.5 * Math.abs(sorted[0] - 0.5) * 2;

  const rel = Math.max(0.05, Math.min(0.99, 0.4 * (1 - entropy) + 0.35 * coverage + 0.25 * calibration));
  const interp = rel >= 0.9 ? 'Very high confidence — prediction is highly trustworthy' :
    rel >= 0.75 ? 'Good confidence — prediction can be acted upon' :
    rel >= 0.6 ? 'Moderate confidence — use with caution' :
    rel >= 0.4 ? 'Low confidence — prediction may be unreliable' :
    'Very low confidence — prediction should not be trusted';

  return { reliabilityScore: Math.round(rel * 100) / 100, predictionEntropy: Math.round(entropy * 1000) / 1000, featureCoverage: Math.round(coverage * 100) / 100, calibrationScore: Math.round(calibration * 1000) / 1000, interpretation: interp };
}

// ========================= MODULE 5: DISTRIBUTION SHIFT =========================

const TRAIN_MEAN = [45, 65, 28, 30, 1010, 300, 15, 0.3, 0.25, 0.4, 0.35, 0.35];
const INV_COV = [1/(35*35), 1/(18*18), 1/(8*8), 1/(25*25), 1/(15*15), 1/(400*400), 1/(10*10), 1/(0.2*0.2), 1/(0.25*0.25), 1/(0.3*0.3), 1/(0.2*0.2), 1/(0.2*0.2)];
const MAX_DIST = 30;

export function detectShift(input: PredictionInput): DistributionShiftResult {
  const f = [input.rainfall, input.humidity, input.temperature, input.windSpeed, input.pressure, input.elevation, input.slope, input.seismicActivity, input.coastalProximity, input.riverProximity, input.historicalDensity, input.weatherSeverity];
  let d = 0; for (let i = 0; i < f.length; i++) { const diff = f[i] - TRAIN_MEAN[i]; d += diff * diff * INV_COV[i]; }
  const mah = Math.sqrt(d); const nd = Math.min(1, mah / MAX_DIST); const sim = Math.round((1 - nd) * 100);
  const ood: 'low' | 'moderate' | 'high' = nd < 0.3 ? 'low' : nd < 0.6 ? 'moderate' : 'high';
  return { mahalanobisDistance: Math.round(mah * 100) / 100, normalizedDistance: Math.round(nd * 1000) / 1000, distributionSimilarity: sim, oodScore: Math.round(nd * 1000) / 1000, oodRisk: ood, isOutOfDistribution: mah > 16.92 };
}

// ========================= MODULE 6: DECISION ADMISSIBILITY =========================

export function computeAdmissibility(reliability: number, normalizedMah: number, threshold = 0.55): AdmissibilityResult {
  const score = Math.round(reliability * (1 - normalizedMah) * 100) / 100;
  const decision = score >= threshold ? 'execute' as const : score >= threshold * 0.7 ? 'defer' as const : 'abstain' as const;
  const confidence = score >= 0.85 ? 'Very High' : score >= 0.7 ? 'High' : score >= 0.55 ? 'Moderate' : score >= 0.35 ? 'Low' : 'Very Low';
  const parts = [];
  parts.push(reliability >= 0.85 ? 'Model prediction has very high reliability' : reliability >= 0.65 ? 'Model prediction has acceptable reliability' : 'Model prediction has low reliability');
  parts.push(normalizedMah < 0.2 ? 'Input data matches training distribution' : normalizedMah < 0.5 ? 'Moderate deviation from training distribution' : 'Significant distribution shift detected');
  parts.push(decision === 'execute' ? `Admissibility (${score.toFixed(2)}) ≥ threshold (${threshold}) — EXECUTE` : decision === 'defer' ? `Admissibility (${score.toFixed(2)}) below threshold — DEFER to human review` : `Admissibility (${score.toFixed(2)}) too low — ABSTAIN`);
  return { admissibilityScore: score, decision, threshold, reliability, normalizedMahalanobis: normalizedMah, confidence, reasoning: parts.join('. ') + '.' };
}

// ========================= MODULE 7: EXPLAINABILITY =========================

const FEAT_LABELS: Record<string, string> = { rainfall: 'Rainfall', humidity: 'Humidity', temperature: 'Temperature', windSpeed: 'Wind Speed', pressure: 'Atmospheric Pressure', elevation: 'Elevation', slope: 'Terrain Slope', seismicActivity: 'Seismic Activity', coastalProximity: 'Coastal Proximity', riverProximity: 'River Proximity', historicalDensity: 'Historical Disasters', weatherSeverity: 'Weather Severity' };
const BASELINES: Record<string, number> = { rainfall: 45, humidity: 65, temperature: 28, windSpeed: 30, pressure: 1010, elevation: 300, slope: 15, seismicActivity: 0.3, coastalProximity: 0.4, riverProximity: 0.35, historicalDensity: 0.35, weatherSeverity: 0.35 };
const IMPORTANCE: Record<string, number> = { rainfall: 0.15, humidity: 0.08, temperature: 0.06, windSpeed: 0.14, pressure: 0.08, elevation: 0.06, slope: 0.05, seismicActivity: 0.14, coastalProximity: 0.08, riverProximity: 0.06, historicalDensity: 0.06, weatherSeverity: 0.04 };

export function explainPrediction(input: PredictionInput): ExplainabilityResult {
  const feats = input as unknown as Record<string, number>;
  const contribs: FeatureContribution[] = [];
  for (const [f, v] of Object.entries(BASELINES)) {
    const val = feats[f] ?? v;
    const dev = val - v; const nd = v !== 0 ? Math.abs(dev / v) : Math.abs(dev);
    let c = (IMPORTANCE[f] ?? 0.05) * nd * 100;
    c = Math.min(c, 50);
    contribs.push({ feature: FEAT_LABELS[f] || f, contribution: Math.round(c * 10) / 10, direction: dev >= 0 ? 'positive' : 'negative', value: val });
  }
  contribs.sort((a, b) => b.contribution - a.contribution);
  const total = contribs.reduce((s, c) => s + c.contribution, 0);
  if (total > 0) contribs.forEach(c => c.contribution = Math.round((c.contribution / total) * 100));
  return { contributions: contribs, topFactor: contribs[0]?.feature || 'Unknown', summary: `Primary drivers: ${contribs.slice(0, 3).map(c => c.feature).join(', ')}` };
}
