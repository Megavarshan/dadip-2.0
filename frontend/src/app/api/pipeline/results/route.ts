// ============================================================
// API: Pipeline Results — Get all pipeline results with events
// GET /api/pipeline/results?limit=20
// ============================================================

import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/db';
import { fetchAndProcessAll } from '@/lib/services';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const limit = parseInt(searchParams.get('limit') || '20');

  try {
    const db = getSupabase();

    // Fetch events with their latest pipeline results
    const { data: events, error: eventsError } = await db
      .from('disaster_events')
      .select('*')
      .in('status', ['active', 'monitoring'])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (eventsError) throw eventsError;

    if (!events || events.length === 0) {
      // Fallback: run the pipeline in-memory
      const results = await fetchAndProcessAll();
      return Response.json({ data: results, count: results.length, _mock: true });
    }

    // For each event, get the latest pipeline result
    const results = [];
    for (const event of events) {
      const { data: pipeline } = await db
        .from('pipeline_results')
        .select('*')
        .eq('event_id', event.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (pipeline) {
        results.push({
          event: {
            ...event,
            timestamp: new Date(event.created_at),
          },
          risk: pipeline.risk_score,
          reliability: pipeline.reliability,
          distributionShift: pipeline.distribution_shift,
          admissibility: pipeline.admissibility,
          explainability: pipeline.explainability,
          weather: pipeline.weather_data,
          alert: undefined, // Alerts are fetched separately
        });
      } else {
        // Event without pipeline result — return basic data
        results.push({
          event: {
            ...event,
            timestamp: new Date(event.created_at),
          },
          risk: { compositeRisk: 0, severity: event.severity, dominantHazard: event.type, cycloneRisk: 0, tsunamiRisk: 0, floodRisk: 0, earthquakeRisk: 0, timestamp: new Date() },
          reliability: { reliabilityScore: 0, predictionEntropy: 0, featureCoverage: 0, calibrationScore: 0, interpretation: 'Pipeline not yet run' },
          distributionShift: { mahalanobisDistance: 0, normalizedDistance: 0, distributionSimilarity: 0, oodScore: 0, oodRisk: 'low', isOutOfDistribution: false },
          admissibility: { admissibilityScore: 0, decision: 'defer', threshold: 0.55, reliability: 0, normalizedMahalanobis: 0, confidence: 'N/A', reasoning: 'Pipeline has not been run for this event yet.' },
          explainability: { contributions: [], topFactor: 'Unknown', summary: 'Pipeline not yet run' },
        });
      }
    }

    return Response.json({ data: results, count: results.length });
  } catch (err) {
    console.error('Pipeline results error:', err);
    // Full fallback to in-memory pipeline
    try {
      const results = await fetchAndProcessAll();
      return Response.json({ data: results, count: results.length, _mock: true });
    } catch {
      return Response.json({ data: [], count: 0, error: 'Failed to load data' });
    }
  }
}
