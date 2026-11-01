// ============================================================
// API: Alerts — List & Dispatch
// GET /api/alerts?level=red&limit=20
// POST /api/alerts — Dispatch a new alert
// ============================================================

import { NextRequest } from 'next/server';
import { getSupabase, logAudit } from '@/lib/db';
import { auth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const level = searchParams.get('level');
  const limit = parseInt(searchParams.get('limit') || '50');

  try {
    const db = getSupabase();
    let query = db
      .from('alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (level) query = query.eq('level', level);

    const { data, error } = await query;

    if (error) throw error;

    return Response.json({ data: data || [], count: data?.length || 0 });
  } catch (err) {
    console.error('Alerts GET error:', err);
    return Response.json({ data: [], count: 0 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'government' && session.user.role !== 'admin')) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { event_id, level, title, message, location, disaster_type, channels } = body;

    if (!title || !message || !level) {
      return Response.json({ error: 'Missing required fields: title, message, level' }, { status: 400 });
    }

    const db = getSupabase();
    const { data, error } = await db
      .from('alerts')
      .insert({
        event_id: event_id || null,
        level,
        title,
        message,
        location: location || null,
        disaster_type: disaster_type || null,
        sent_via_sms: channels?.includes('sms') || false,
        sent_via_telegram: channels?.includes('telegram') || false,
        sent_via_whatsapp: channels?.includes('whatsapp') || false,
      })
      .select()
      .single();

    if (error) throw error;

    await logAudit(session.user.id, 'DISPATCH_ALERT', 'alerts', data.id, {
      level,
      channels: channels || [],
    });

    return Response.json({ data, message: 'Alert dispatched successfully' }, { status: 201 });
  } catch (err) {
    console.error('Alerts POST error:', err);
    return Response.json({ error: 'Failed to dispatch alert' }, { status: 500 });
  }
}
