// ============================================================
// API: Events — List & Create
// GET /api/events?type=flood&severity=critical&status=active&state=Assam
// POST /api/events — Create a new disaster event (government/admin)
// ============================================================

import { NextRequest } from 'next/server';
import { getSupabase, logAudit } from '@/lib/db';
import { auth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get('type');
  const severity = searchParams.get('severity');
  const status = searchParams.get('status');
  const state = searchParams.get('state');
  const limit = parseInt(searchParams.get('limit') || '50');

  try {
    const db = getSupabase();
    let query = db
      .from('disaster_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (type) query = query.eq('type', type);
    if (severity) query = query.eq('severity', severity);
    if (status) query = query.eq('status', status);
    if (state) query = query.ilike('state', `%${state}%`);

    const { data, error } = await query;

    if (error) throw error;

    return Response.json({ data: data || [], count: data?.length || 0 });
  } catch (err) {
    console.error('Events GET error:', err);
    // Fallback to mock data service
    const { getMockIndianEvents } = await import('@/lib/services');
    const events = getMockIndianEvents();
    return Response.json({ data: events, count: events.length, _mock: true });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const role = session.user.role;
  if (role !== 'government' && role !== 'admin') {
    return Response.json({ error: 'Forbidden — government access required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { type, title, description, severity, latitude, longitude, source, state, district, magnitude, depth, affected_population } = body;

    if (!type || !title || !severity || latitude === undefined || longitude === undefined) {
      return Response.json({ error: 'Missing required fields: type, title, severity, latitude, longitude' }, { status: 400 });
    }

    const db = getSupabase();
    const { data, error } = await db
      .from('disaster_events')
      .insert({
        type,
        title,
        description: description || null,
        severity,
        latitude,
        longitude,
        source: source || 'manual',
        state: state || null,
        district: district || null,
        magnitude: magnitude || null,
        depth: depth || null,
        affected_population: affected_population || null,
        status: 'active',
      })
      .select()
      .single();

    if (error) throw error;

    await logAudit(session.user.id, 'CREATE_EVENT', 'disaster_events', data.id, { title, type, severity });

    return Response.json({ data }, { status: 201 });
  } catch (err) {
    console.error('Events POST error:', err);
    return Response.json({ error: 'Failed to create event' }, { status: 500 });
  }
}
