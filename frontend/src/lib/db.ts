// ============================================================
// Supabase Client — Server & Client-side initialization
// ============================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ---------- Types for our database tables ----------
export interface DbUser {
  id: string;
  email: string;
  name: string | null;
  password_hash: string | null;
  role: 'public' | 'government' | 'admin';
  department: string | null;
  phone: string | null;
  language: string;
  avatar_url: string | null;
  provider: string;
  provider_account_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbDisasterEvent {
  id: string;
  type: 'cyclone' | 'tsunami' | 'flood' | 'earthquake';
  title: string;
  description: string | null;
  severity: 'low' | 'moderate' | 'high' | 'critical';
  latitude: number;
  longitude: number;
  source: string;
  external_id: string | null;
  status: 'active' | 'closed' | 'monitoring';
  state: string | null;
  district: string | null;
  magnitude: number | null;
  depth: number | null;
  affected_population: number | null;
  created_at: string;
  updated_at: string;
}

export interface DbPipelineResult {
  id: string;
  event_id: string;
  risk_score: Record<string, unknown>;
  reliability: Record<string, unknown>;
  distribution_shift: Record<string, unknown>;
  admissibility: Record<string, unknown>;
  explainability: Record<string, unknown>;
  weather_data: Record<string, unknown> | null;
  created_at: string;
}

export interface DbIncidentReport {
  id: string;
  reporter_id: string | null;
  reporter_name: string;
  reporter_phone: string | null;
  type: 'cyclone' | 'tsunami' | 'flood' | 'earthquake';
  description: string;
  latitude: number;
  longitude: number;
  location: string;
  severity: 'low' | 'moderate' | 'high' | 'critical';
  image_url: string | null;
  status: 'pending' | 'verified' | 'dismissed' | 'responded';
  verified_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbAlert {
  id: string;
  event_id: string | null;
  level: 'green' | 'yellow' | 'orange' | 'red';
  title: string;
  message: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  risk_score: number | null;
  admissibility_score: number | null;
  decision: 'execute' | 'defer' | 'abstain' | null;
  disaster_type: string | null;
  state: string | null;
  sent_via_sms: boolean;
  sent_via_telegram: boolean;
  sent_via_whatsapp: boolean;
  acknowledged: boolean;
  acknowledged_by: string | null;
  created_at: string;
}

export interface DbHelpCenter {
  id: string;
  name: string;
  type: 'hospital' | 'shelter' | 'fire_station' | 'police' | 'ndrf' | 'relief_camp';
  latitude: number;
  longitude: number;
  address: string | null;
  phone: string | null;
  capacity: number | null;
  current_occupancy: number;
  is_operational: boolean;
  state: string | null;
}

export interface DbAuditLog {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

// ---------- Client Singleton ----------
let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (supabaseInstance) return supabaseInstance;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Return a mock-mode client that won't crash the app
    // This allows the app to run without Supabase for local dev
    console.warn('⚠️ DADIP: Supabase credentials not found — running in mock mode');
    return createMockSupabase();
  }

  supabaseInstance = createClient(url, key, {
    auth: { persistSession: false },
  });

  return supabaseInstance;
}

// Browser client (uses anon key, respects RLS)
let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn('⚠️ DADIP: Supabase credentials not found for browser client');
    return createMockSupabase();
  }

  browserClient = createClient(url, key);
  return browserClient;
}

// ---------- Mock Supabase for development without DB ----------
function createMockSupabase(): SupabaseClient {
  // Returns a proxy that won't throw but logs operations
  const handler: ProxyHandler<object> = {
    get(_, prop) {
      if (prop === 'from') {
        return () => new Proxy({}, handler);
      }
      // Chainable methods return the proxy
      if (['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'like', 'ilike', 'in', 'order', 'limit', 'single', 'maybeSingle', 'range', 'match', 'not', 'or', 'filter', 'is'].includes(prop as string)) {
        return (..._args: unknown[]) => new Proxy({}, handler);
      }
      // Terminal methods return empty results
      if (prop === 'then') {
        return (resolve: (val: unknown) => void) => resolve({ data: [], error: null, count: 0 });
      }
      return undefined;
    }
  };
  return new Proxy({}, handler) as unknown as SupabaseClient;
}

// ---------- Audit logging helper ----------
export async function logAudit(
  userId: string | null,
  action: string,
  resourceType?: string,
  resourceId?: string,
  details?: Record<string, unknown>,
  ipAddress?: string
): Promise<void> {
  try {
    const db = getSupabase();
    await db.from('audit_log').insert({
      user_id: userId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details: details || null,
      ip_address: ipAddress || null,
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}
