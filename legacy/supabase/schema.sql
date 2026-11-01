-- ============================================================
-- DADIP — Supabase PostgreSQL Schema
-- Run this in the Supabase SQL Editor to create all tables.
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==================== USERS ====================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT,              -- NULL for OAuth users
  role TEXT DEFAULT 'public' CHECK (role IN ('public', 'government', 'admin')),
  department TEXT,
  phone TEXT,
  language TEXT DEFAULT 'en' CHECK (language IN ('en', 'ta', 'hi', 'kn', 'te')),
  avatar_url TEXT,
  provider TEXT DEFAULT 'credentials', -- 'credentials', 'github', 'google'
  provider_account_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== DISASTER EVENTS ====================
CREATE TABLE IF NOT EXISTS disaster_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('cyclone', 'tsunami', 'flood', 'earthquake')),
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'moderate', 'high', 'critical')),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  source TEXT NOT NULL,
  external_id TEXT,                -- ID from USGS/NASA/NDEM for deduplication
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed', 'monitoring')),
  state TEXT,
  district TEXT,
  magnitude DOUBLE PRECISION,
  depth DOUBLE PRECISION,
  affected_population INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== AI PIPELINE RESULTS ====================
CREATE TABLE IF NOT EXISTS pipeline_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES disaster_events(id) ON DELETE CASCADE,
  risk_score JSONB NOT NULL,
  reliability JSONB NOT NULL,
  distribution_shift JSONB NOT NULL,
  admissibility JSONB NOT NULL,
  explainability JSONB NOT NULL,
  weather_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== INCIDENT REPORTS ====================
CREATE TABLE IF NOT EXISTS incident_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reporter_name TEXT NOT NULL,
  reporter_phone TEXT,
  type TEXT NOT NULL CHECK (type IN ('cyclone', 'tsunami', 'flood', 'earthquake')),
  description TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  location TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'moderate', 'high', 'critical')),
  image_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'dismissed', 'responded')),
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== ALERTS ====================
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES disaster_events(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('green', 'yellow', 'orange', 'red')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  location TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  risk_score INTEGER,
  admissibility_score DOUBLE PRECISION,
  decision TEXT CHECK (decision IN ('execute', 'defer', 'abstain')),
  disaster_type TEXT,
  state TEXT,
  sent_via_sms BOOLEAN DEFAULT false,
  sent_via_telegram BOOLEAN DEFAULT false,
  sent_via_whatsapp BOOLEAN DEFAULT false,
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== HELP CENTERS ====================
CREATE TABLE IF NOT EXISTS help_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('hospital', 'shelter', 'fire_station', 'police', 'ndrf', 'relief_camp')),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address TEXT,
  phone TEXT,
  capacity INTEGER,
  current_occupancy INTEGER DEFAULT 0,
  is_operational BOOLEAN DEFAULT true,
  state TEXT
);

-- ==================== AUDIT LOG ====================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== AURA CHAT SESSIONS ====================
CREATE TABLE IF NOT EXISTS aura_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  messages JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== INDEXES ====================
CREATE INDEX IF NOT EXISTS idx_events_status ON disaster_events(status);
CREATE INDEX IF NOT EXISTS idx_events_type ON disaster_events(type);
CREATE INDEX IF NOT EXISTS idx_events_severity ON disaster_events(severity);
CREATE INDEX IF NOT EXISTS idx_events_created ON disaster_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_external ON disaster_events(external_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incident_reports(status);
CREATE INDEX IF NOT EXISTS idx_incidents_type ON incident_reports(type);
CREATE INDEX IF NOT EXISTS idx_incidents_created ON incident_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_level ON alerts(level);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_event ON pipeline_results(event_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_created ON pipeline_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ==================== ROW LEVEL SECURITY ====================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Public can read events, alerts, help centers
ALTER TABLE disaster_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Events are publicly readable" ON disaster_events FOR SELECT USING (true);
CREATE POLICY "Government can manage events" ON disaster_events FOR ALL USING (true);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alerts are publicly readable" ON alerts FOR SELECT USING (true);
CREATE POLICY "Government can manage alerts" ON alerts FOR ALL USING (true);

ALTER TABLE help_centers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Help centers are publicly readable" ON help_centers FOR SELECT USING (true);
CREATE POLICY "Admins can manage help centers" ON help_centers FOR ALL USING (true);

-- Pipeline results readable by authenticated
ALTER TABLE pipeline_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pipeline results are readable" ON pipeline_results FOR SELECT USING (true);
CREATE POLICY "System can insert pipeline results" ON pipeline_results FOR INSERT WITH CHECK (true);
