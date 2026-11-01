// Types mirroring the FastAPI response models (backend/dadip/api).
export type Severity = 'low' | 'moderate' | 'high' | 'critical';
export type Level = 'green' | 'yellow' | 'orange' | 'red';
export type Role = 'citizen' | 'operator' | 'approver' | 'admin';

export interface Page<T> { items: T[]; total: number; limit: number; offset: number }

export interface User { id: string; email: string; name: string; role: Role; language: string }

export interface Incident {
  id: string; hazard_type: string; title: string; description: string | null; severity: Severity;
  status: 'open' | 'monitoring' | 'closed'; latitude: number; longitude: number; region: string | null;
  source: string; magnitude: number | null; affected_population: number | null;
  data_origin: 'live' | 'report' | 'manual' | 'demo' | 'simulated'; created_at: string;
}

export interface Assessment {
  id: string; incident_id: string; model_version: string; inputs: Record<string, number>;
  input_provenance: Record<string, string | { source: string; observed_at: string | null }>;
  risk: { cycloneRisk: number; tsunamiRisk: number; floodRisk: number; earthquakeRisk: number; compositeRisk: number; severity: Severity; dominantHazard: string };
  reliability: { reliabilityScore: number; predictionEntropy: number; featureCoverage: number; calibrationScore: number; interpretation: string; inputs_defaulted: string[] };
  distribution_shift: { mahalanobisDistance: number; normalizedDistance: number; isOutOfDistribution: boolean; corrected: { squared_distance: number; threshold: number; is_out_of_distribution: boolean } };
  admissibility: { admissibilityScore: number; decision: 'execute' | 'defer' | 'abstain'; threshold: number; reasoning: string };
  explanation: { contributions: { feature: string; contribution: number; direction: string; value: number }[]; summary: string };
  uncertainty: { composite_risk_p05: number; composite_risk_p50: number; composite_risk_p95: number; decision_stability: number; level_stability: number; n: number };
  composite_risk: number; admissibility_score: number; decision: 'execute' | 'defer' | 'abstain'; created_at: string;
}

export interface Report {
  id: string; hazard_type: string; description: string; latitude: number; longitude: number; location_text: string;
  reported_severity: Severity; status: 'pending' | 'verified' | 'dismissed' | 'responded'; created_at: string;
  reporter_name: string; contact: string | null; incident_id: string | null; credibility: number | null; source: string;
  credibility_detail: { signals: Record<string, number>; corroborating_reports: number; nearest_incident_km: number | null } | null;
}

export interface MessageBrief {
  id: string; channel: string; recipient: string; priority: number; state: string; attempts: number;
  last_error: string | null; created_at: string; delivered_at: string | null; acknowledged_at: string | null;
}

export interface Alert {
  id: string; incident_id: string; level: Level; title: string; body: string; language: string; audience: string;
  channels: string[]; status: string; decision: string | null; requires_approval: boolean; approval_reason: string | null;
  created_by: string | null; approved_by: string | null; rejection_reason: string | null; expires_at: string; created_at: string;
  messages?: MessageBrief[];
}

export interface ChannelStats {
  states: Record<string, number>; is_mock: boolean; delivery_ratio: number | null; ack_ratio: number | null;
  latency_p50_s?: number; latency_p95_s?: number; avg_attempts_delivered?: number;
}

export interface Resource { id: string; name: string; kind: string; latitude: number; longitude: number; address: string | null; phone: string | null; capacity: number | null; occupancy: number; region: string | null; data_origin: string }
export interface Device { id: string; name: string; region: string | null; status: string; last_seen_at: string | null; queue_depth: number }
export interface EdgeEvent { id: string; device_id: string; kind: string; payload: Record<string, unknown>; created_at_device: string; received_at: string }
export interface AuditEvent { id: number; actor_id: string | null; action: string; resource_type: string | null; resource_id: string | null; details: Record<string, unknown> | null; created_at: string }
export interface Channel { name: string; enabled: boolean; is_mock: boolean; configured: boolean }
