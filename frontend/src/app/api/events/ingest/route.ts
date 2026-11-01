// ============================================================
// API: Events Ingest — Fetch from external APIs, run AI pipeline, persist
// POST /api/events/ingest
// ============================================================

import { auth } from '@/lib/auth';
import { getSupabase, logAudit } from '@/lib/db';
import { fetchEarthquakes, fetchNASAEvents, fetchNDEMWeatherData, getMockIndianEvents, getMockWeather } from '@/lib/services';
import { predictRisk, buildInput, estimateReliability, detectShift, computeAdmissibility, explainPrediction } from '@/lib/engines';
import type { DisasterEvent } from '@/lib/types';

export async function POST() {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'government' && session.user.role !== 'admin')) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // Fetch from all external sources
    const [earthquakes, nasaEvents, ndemEvents] = await Promise.all([
      fetchEarthquakes(),
      fetchNASAEvents(),
      fetchNDEMWeatherData(),
    ]);

    const indiaEvents = getMockIndianEvents();
    const allEvents = [...ndemEvents, ...indiaEvents, ...earthquakes, ...nasaEvents].slice(0, 20);

    const db = getSupabase();
    let inserted = 0;
    let pipelineResults = 0;

    for (const event of allEvents) {
      // Check for duplicate by external_id or title
      const externalId = event.id;
      const { data: existing } = await db
        .from('disaster_events')
        .select('id')
        .eq('external_id', externalId)
        .single();

      let eventId: string;

      if (existing) {
        eventId = existing.id;
      } else {
        // Insert new event
        const { data: newEvent, error } = await db
          .from('disaster_events')
          .insert({
            type: event.type,
            title: event.title,
            description: event.description || null,
            severity: event.severity,
            latitude: event.latitude,
            longitude: event.longitude,
            source: event.source,
            external_id: externalId,
            status: event.status,
            state: event.state || null,
            magnitude: event.magnitude || null,
            depth: event.depth || null,
            affected_population: event.affectedPopulation || null,
          })
          .select('id')
          .single();

        if (error || !newEvent) continue;
        eventId = newEvent.id;
        inserted++;
      }

      // Run the AI pipeline
      const pipelineResult = await runPipelineForEvent(event);

      // Store pipeline result
      const { error: pipeError } = await db
        .from('pipeline_results')
        .insert({
          event_id: eventId,
          risk_score: pipelineResult.risk,
          reliability: pipelineResult.reliability,
          distribution_shift: pipelineResult.distributionShift,
          admissibility: pipelineResult.admissibility,
          explainability: pipelineResult.explainability,
          weather_data: pipelineResult.weather || null,
        });

      if (!pipeError) pipelineResults++;

      // Generate alert if decision is not 'abstain'
      if (pipelineResult.admissibility.decision !== 'abstain') {
        const level = pipelineResult.risk.compositeRisk >= 80 ? 'red' :
          pipelineResult.risk.compositeRisk >= 60 ? 'orange' :
          pipelineResult.risk.compositeRisk >= 35 ? 'yellow' : 'green';

        await db.from('alerts').insert({
          event_id: eventId,
          level,
          title: `${pipelineResult.risk.severity.toUpperCase()} — ${event.type.charAt(0).toUpperCase() + event.type.slice(1)} Alert`,
          message: `${event.title}. Risk: ${pipelineResult.risk.compositeRisk}%. Decision: ${pipelineResult.admissibility.decision.toUpperCase()}.`,
          location: event.description || '',
          latitude: event.latitude,
          longitude: event.longitude,
          risk_score: pipelineResult.risk.compositeRisk,
          admissibility_score: pipelineResult.admissibility.admissibilityScore,
          decision: pipelineResult.admissibility.decision,
          disaster_type: event.type,
          state: event.state || null,
        });
      }
    }

    await logAudit(session.user.id, 'INGEST_EVENTS', 'disaster_events', undefined, {
      total: allEvents.length,
      inserted,
      pipelineResults,
    });

    return Response.json({
      message: 'Ingestion complete',
      total: allEvents.length,
      newEvents: inserted,
      pipelineResults,
    });
  } catch (err) {
    console.error('Ingest error:', err);
    return Response.json({ error: 'Ingestion failed' }, { status: 500 });
  }
}

// Helper: run the AI pipeline for an event
async function runPipelineForEvent(event: DisasterEvent) {
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

  return { risk, reliability, distributionShift, admissibility, explainability, weather };
}
