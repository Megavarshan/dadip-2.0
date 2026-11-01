// ============================================================
// API: Acknowledge Alert
// POST /api/alerts/[id]/acknowledge
// ============================================================

import { NextRequest } from 'next/server';
import { getSupabase, logAudit } from '@/lib/db';
import { auth } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const db = getSupabase();
    const { data, error } = await db
      .from('alerts')
      .update({
        acknowledged: true,
        acknowledged_by: session.user.id,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await logAudit(session.user.id, 'ACKNOWLEDGE_ALERT', 'alerts', id);

    return Response.json({ data, message: 'Alert acknowledged' });
  } catch (err) {
    console.error('Acknowledge error:', err);
    return Response.json({ error: 'Failed to acknowledge alert' }, { status: 500 });
  }
}
