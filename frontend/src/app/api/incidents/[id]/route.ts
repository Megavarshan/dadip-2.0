// ============================================================
// API: Single Incident — Update status (verify/dismiss/respond)
// PATCH /api/incidents/[id]
// ============================================================

import { NextRequest } from 'next/server';
import { getSupabase, logAudit } from '@/lib/db';
import { auth } from '@/lib/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'government' && session.user.role !== 'admin')) {
    return Response.json({ error: 'Forbidden — government access required' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { status } = body;

    if (!status || !['pending', 'verified', 'dismissed', 'responded'].includes(status)) {
      return Response.json({ error: 'Invalid status. Must be: pending, verified, dismissed, or responded' }, { status: 400 });
    }

    const db = getSupabase();
    const updates: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    // If verifying, record who verified it
    if (status === 'verified' || status === 'responded') {
      updates.verified_by = session.user.id;
    }

    const { data, error } = await db
      .from('incident_reports')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await logAudit(session.user.id, `${status.toUpperCase()}_INCIDENT`, 'incident_reports', id, { new_status: status });

    return Response.json({ data });
  } catch (err) {
    console.error('Incident PATCH error:', err);
    return Response.json({ error: 'Failed to update incident' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const db = getSupabase();
    const { data, error } = await db
      .from('incident_reports')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return Response.json({ error: 'Incident not found' }, { status: 404 });
    }

    return Response.json({ data });
  } catch (err) {
    console.error('Incident GET error:', err);
    return Response.json({ error: 'Failed to fetch incident' }, { status: 500 });
  }
}
