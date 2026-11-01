// ============================================================
// API: Incidents — List & Create
// GET /api/incidents?status=pending&type=flood&severity=critical
// POST /api/incidents — Submit a new incident report
// ============================================================

import { NextRequest } from 'next/server';
import { getSupabase, logAudit } from '@/lib/db';
import { auth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get('status');
  const type = searchParams.get('type');
  const severity = searchParams.get('severity');
  const limit = parseInt(searchParams.get('limit') || '50');

  try {
    const db = getSupabase();
    let query = db
      .from('incident_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) query = query.eq('status', status);
    if (type) query = query.eq('type', type);
    if (severity) query = query.eq('severity', severity);

    const { data, error } = await query;

    if (error) throw error;

    return Response.json({ data: data || [], count: data?.length || 0 });
  } catch (err) {
    console.error('Incidents GET error:', err);
    // Fallback to in-memory data
    const { getIncidentReports } = await import('@/lib/services');
    const incidents = getIncidentReports();
    return Response.json({ data: incidents, count: incidents.length, _mock: true });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();

  try {
    const body = await request.json();
    const { reporter_name, reporter_phone, type, description, latitude, longitude, location, severity, image_url } = body;

    if (!reporter_name || !type || !description || latitude === undefined || longitude === undefined || !location) {
      return Response.json({
        error: 'Missing required fields: reporter_name, type, description, latitude, longitude, location',
      }, { status: 400 });
    }

    const db = getSupabase();
    const { data, error } = await db
      .from('incident_reports')
      .insert({
        reporter_id: session?.user?.id || null,
        reporter_name,
        reporter_phone: reporter_phone || null,
        type,
        description,
        latitude,
        longitude,
        location,
        severity: severity || 'moderate',
        image_url: image_url || null,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;

    if (session?.user) {
      await logAudit(session.user.id, 'CREATE_INCIDENT', 'incident_reports', data.id, { type, severity, location });
    }

    return Response.json({ data }, { status: 201 });
  } catch (err) {
    console.error('Incidents POST error:', err);
    return Response.json({ error: 'Failed to create incident report' }, { status: 500 });
  }
}
