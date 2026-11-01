// ============================================================
// API: Single Event — Get, Update, Delete
// GET /api/events/[id]
// PATCH /api/events/[id] — Update event (status, severity)
// DELETE /api/events/[id] — Close/archive event
// ============================================================

import { NextRequest } from 'next/server';
import { getSupabase, logAudit } from '@/lib/db';
import { auth } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const db = getSupabase();

    // Fetch event with its pipeline results
    const { data: event, error: eventError } = await db
      .from('disaster_events')
      .select('*')
      .eq('id', id)
      .single();

    if (eventError || !event) {
      return Response.json({ error: 'Event not found' }, { status: 404 });
    }

    // Fetch latest pipeline result for this event
    const { data: pipeline } = await db
      .from('pipeline_results')
      .select('*')
      .eq('event_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return Response.json({ data: { event, pipeline: pipeline || null } });
  } catch (err) {
    console.error('Event GET error:', err);
    return Response.json({ error: 'Failed to fetch event' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'government' && session.user.role !== 'admin')) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const updates: Record<string, unknown> = {};

    // Only allow specific fields to be updated
    const allowedFields = ['status', 'severity', 'description', 'affected_population', 'state', 'district'];
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const db = getSupabase();
    const { data, error } = await db
      .from('disaster_events')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await logAudit(session.user.id, 'UPDATE_EVENT', 'disaster_events', id, updates);

    return Response.json({ data });
  } catch (err) {
    console.error('Event PATCH error:', err);
    return Response.json({ error: 'Failed to update event' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return Response.json({ error: 'Forbidden — admin access required' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const db = getSupabase();

    // Soft delete: set status to 'closed'
    const { data, error } = await db
      .from('disaster_events')
      .update({ status: 'closed', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await logAudit(session.user.id, 'CLOSE_EVENT', 'disaster_events', id);

    return Response.json({ data, message: 'Event closed successfully' });
  } catch (err) {
    console.error('Event DELETE error:', err);
    return Response.json({ error: 'Failed to close event' }, { status: 500 });
  }
}
