// ============================================================
// API: Help Centers — List all
// GET /api/help-centers?state=Kerala
// ============================================================

import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/db';
import { getHelpCenters } from '@/lib/services';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const state = searchParams.get('state');

  try {
    const db = getSupabase();
    let query = db
      .from('help_centers')
      .select('*')
      .eq('is_operational', true)
      .order('name');

    if (state) query = query.ilike('state', `%${state}%`);

    const { data, error } = await query;

    if (error) throw error;

    return Response.json({ data: data || [], count: data?.length || 0 });
  } catch (err) {
    console.error('Help centers error:', err);
    // Fallback to in-memory data
    const centers = getHelpCenters();
    return Response.json({ data: centers, count: centers.length, _mock: true });
  }
}
