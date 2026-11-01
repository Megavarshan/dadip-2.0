-- ============================================================
-- DADIP — Seed Data
-- Run this AFTER schema.sql in the Supabase SQL Editor.
-- ============================================================

-- ==================== USERS ====================
-- Default passwords use bcrypt hash of the plaintext.
-- admin@dadip.in / admin123  |  officer@ndma.gov.in / ndma@2026  |  citizen@example.com / citizen123
INSERT INTO users (email, name, password_hash, role, department, phone, language) VALUES
  ('admin@dadip.in', 'DADIP Admin', '$2b$10$rICGdGqqGfvlCOBMEiKGqeWV5f8RyZwHZJNJ0svW5k5V9KZI7xw8a', 'admin', 'System Administration', '+91-1100000000', 'en'),
  ('officer@ndma.gov.in', 'NDMA Emergency Officer', '$2b$10$rICGdGqqGfvlCOBMEiKGqeWV5f8RyZwHZJNJ0svW5k5V9KZI7xw8a', 'government', 'National Disaster Management Authority', '+91-011-24363260', 'en'),
  ('citizen@example.com', 'Ramesh Kumar', '$2b$10$rICGdGqqGfvlCOBMEiKGqeWV5f8RyZwHZJNJ0svW5k5V9KZI7xw8a', 'public', NULL, '+91-9876543210', 'hi')
ON CONFLICT (email) DO NOTHING;

-- ==================== DISASTER EVENTS ====================
INSERT INTO disaster_events (type, title, description, severity, latitude, longitude, source, status, state, magnitude, depth, affected_population) VALUES
  ('earthquake', 'M4.2 - 30km N of Imphal, Manipur', 'Northeast India seismic zone — moderate tremors felt across Manipur valley', 'moderate', 25.1, 94.0, 'usgs', 'active', 'Manipur', 4.2, 18, NULL),
  ('earthquake', 'M3.8 - Uttarkashi, Uttarakhand', 'Himalayan seismic belt — tremors reported in Uttarkashi and surrounding areas', 'moderate', 30.7, 78.4, 'usgs', 'active', 'Uttarakhand', 3.8, 10, NULL),
  ('earthquake', 'M5.1 - Andaman Islands Region', 'Andaman subduction zone — significant seismic activity detected', 'high', 11.5, 92.8, 'usgs', 'active', 'Andaman & Nicobar', 5.1, 45, NULL),
  ('cyclone', 'Cyclone Warning - Bay of Bengal', 'Depression intensifying over Bay of Bengal, likely to cross Andhra Pradesh coast within 48 hours', 'high', 16.5, 86.0, 'imd', 'active', 'Andhra Pradesh', NULL, NULL, NULL),
  ('cyclone', 'Tropical Storm Alert - Arabian Sea', 'Low pressure system developing over Arabian Sea near Gujarat coast', 'moderate', 18.0, 70.0, 'imd', 'monitoring', 'Gujarat', NULL, NULL, NULL),
  ('flood', 'Severe Flooding - Assam', 'Brahmaputra river levels critical. 15 districts affected. Over 2 lakh people displaced.', 'critical', 26.1, 91.7, 'cwc', 'active', 'Assam', NULL, NULL, 200000),
  ('flood', 'Flash Flood Warning - Kerala', 'Heavy rainfall causing flash floods in Wayanad and Idukki districts', 'high', 10.0, 76.3, 'cwc', 'active', 'Kerala', NULL, NULL, NULL),
  ('flood', 'River Overflow - Bihar', 'Kosi river overflow affecting Supaul and Saharsa districts', 'high', 25.6, 85.1, 'cwc', 'active', 'Bihar', NULL, NULL, 150000),
  ('tsunami', 'Tsunami Watch - Indian Ocean', 'Minor tsunami advisory following earthquake near Sri Lanka', 'moderate', 6.0, 80.0, 'incois', 'monitoring', NULL, NULL, NULL, NULL)
ON CONFLICT DO NOTHING;

-- ==================== HELP CENTERS ====================
INSERT INTO help_centers (name, type, latitude, longitude, address, phone, capacity, current_occupancy, is_operational, state) VALUES
  ('NDRF Battalion 1', 'ndrf', 28.6, 77.2, 'Ghaziabad, Uttar Pradesh', '011-24363260', 500, 0, true, 'Uttar Pradesh'),
  ('NDRF Battalion 4', 'ndrf', 13.0, 80.2, 'Arakkonam, Tamil Nadu', '044-27264332', 400, 0, true, 'Tamil Nadu'),
  ('District Hospital Guwahati', 'hospital', 26.1, 91.7, 'Guwahati, Assam', '0361-2540067', 300, 120, true, 'Assam'),
  ('Flood Relief Camp - Patna', 'relief_camp', 25.6, 85.1, 'Patna, Bihar', '0612-2233333', 1000, 650, true, 'Bihar'),
  ('SDRF Center Thiruvananthapuram', 'shelter', 8.5, 76.9, 'Thiruvananthapuram, Kerala', '0471-2320261', 200, 45, true, 'Kerala'),
  ('Cyclone Shelter Visakhapatnam', 'shelter', 17.7, 83.3, 'Visakhapatnam, Andhra Pradesh', '0891-2555555', 800, 0, true, 'Andhra Pradesh'),
  ('NDRF Battalion 12', 'ndrf', 19.0, 72.8, 'Mumbai, Maharashtra', '022-22694725', 450, 0, true, 'Maharashtra'),
  ('Emergency Operations Center', 'police', 12.9, 77.6, 'Bengaluru, Karnataka', '080-22942222', 100, 30, true, 'Karnataka')
ON CONFLICT DO NOTHING;

-- ==================== INCIDENT REPORTS ====================
INSERT INTO incident_reports (reporter_name, reporter_phone, type, description, latitude, longitude, location, severity, status) VALUES
  ('Ramesh K', '+91-9876543210', 'flood', 'Water level rising rapidly in our village. Roads submerged. Need immediate help.', 26.15, 91.75, 'Morigaon, Assam', 'critical', 'verified'),
  ('Priya S', '+91-9123456780', 'flood', 'Landslide blocked road near our area. 5 families stranded.', 10.1, 76.35, 'Wayanad, Kerala', 'high', 'pending'),
  ('Sanjay M', '+91-8765432100', 'earthquake', 'Felt strong tremors. Cracks in walls of old buildings.', 30.72, 78.45, 'Uttarkashi, Uttarakhand', 'moderate', 'verified'),
  ('Lakshmi R', '+91-9445678900', 'cyclone', 'Strong winds uprooting trees. Power lines down in multiple areas.', 16.5, 86.0, 'Kakinada, Andhra Pradesh', 'high', 'pending'),
  ('Ahmed F', '+91-9988776655', 'flood', 'Kosi embankment breached. Multiple villages being evacuated urgently.', 25.6, 85.1, 'Supaul, Bihar', 'critical', 'responded')
ON CONFLICT DO NOTHING;
