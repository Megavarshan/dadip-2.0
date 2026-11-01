// ============================================================
// API: Pipeline — Run AI pipeline for a specific event
// POST /api/pipeline/run { event_id }
// ============================================================

import { NextRequest } from 'next/server';
import { getSupabase, logAudit } from '@/lib/db';
import { auth } from '@/lib/auth';
import { predictRisk, buildInput, estimateReliability, detectShift, computeAdmissibility, explainPrediction } from '@/lib/engines';
import { getMockWeather } from '@/lib/services';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'government' && session.user.role !== 'admin')) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { event_id } = body;

    if (!event_id) {
      return Response.json({ error: 'Missing event_id' }, { status: 400 });
    }

    const db = getSupabase();

    // Fetch the event
    const { data: event, error: eventError } = await db
      .from('disaster_events')
      .select('*')
      .eq('id', event_id)
      .single();

    if (eventError || !event) {
      return Response.json({ error: 'Event not found' }, { status: 404 });
    }

    // Run the AI pipeline
    const weather = getMockWeather(event.latitude, event.longitude);
    const input = buildInput(
      { rainfall: weather.rainfall, humidity: weather.humidity, temperature: weather.temperature, windSpeed: weather.windSpeed, pressure: weather.pressure },
      { latitude: event.latitude, longitude: event.longitude },
      {
        historicalDensity: event.type === 'flood' ? 0.6 : 0.3,
        seismicActivity: event.type === 'earthquake' ? 0.7 : 0.2,
        coastalProximity: ['cyclone', 'tsunami'].includes(event.type) ? 0.8 : 0.3,
      }
    );

    const risk = predictRisk(input);
    const reliability = estimateReliability(input, risk);
    const distributionShift = detectShift(input);
    const admissibility = computeAdmissibility(reliability.reliabilityScore, distributionShift.normalizedDistance);
    const explainability = explainPrediction(input);

    // Store the result
    const { data: pipelineResult, error: insertError } = await db
      .from('pipeline_results')
      .insert({
        event_id,
        risk_score: risk,
        reliability,
        distribution_shift: distributionShift,
        admissibility,
        explainability,
        weather_data: weather,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    await logAudit(session.user.id, 'RUN_PIPELINE', 'pipeline_results', pipelineResult.id, {
      event_id,
      risk_score: risk.compositeRisk,
      decision: admissibility.decision,
    });

    return Response.json({
      data: {
        event,
        risk,
        reliability,
        distributionShift,
        admissibility,
        explainability,
        weather,
      },
    });
  } catch (err) {
    console.error('Pipeline run error:', err);
    return Response.json({ error: 'Pipeline execution failed' }, { status: 500 });
  }
}
