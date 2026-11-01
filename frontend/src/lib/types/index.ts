// ============================================================
// DADIP India — Core Type Definitions
// ============================================================

// ---------- User Roles ----------
export type UserRole = 'public' | 'government' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  department?: string;
  language: Language;
  createdAt: Date;
}

// ---------- Languages ----------
export type Language = 'en' | 'ta' | 'hi' | 'kn' | 'te';

export const LANGUAGES: Record<Language, string> = {
  en: 'English',
  ta: 'தமிழ்',
  hi: 'हिन्दी',
  kn: 'ಕನ್ನಡ',
  te: 'తెలుగు',
};

// ---------- India Disaster Types ----------
export type DisasterType = 'cyclone' | 'tsunami' | 'flood' | 'earthquake';

export const DISASTER_LABELS: Record<DisasterType, string> = {
  cyclone: 'Cyclone',
  tsunami: 'Tsunami',
  flood: 'Flood',
  earthquake: 'Earthquake',
};

export const DISASTER_ICONS: Record<DisasterType, string> = {
  cyclone: '🌀',
  tsunami: '🌊',
  flood: '🌧️',
  earthquake: '🌍',
};

// ---------- Severity ----------
export type Severity = 'low' | 'moderate' | 'high' | 'critical';
export type AlertLevel = 'green' | 'yellow' | 'orange' | 'red';
export type DecisionAction = 'execute' | 'abstain' | 'defer';
export type DataSource = 'usgs' | 'nasa_eonet' | 'imd' | 'incois' | 'cwc' | 'user_report' | 'openweather' | 'ndem.nrsc.gov.in';

// ---------- Disaster Event ----------
export interface DisasterEvent {
  id: string;
  type: DisasterType;
  title: string;
  severity: Severity;
  latitude: number;
  longitude: number;
  timestamp: Date;
  source: DataSource;
  description?: string;
  magnitude?: number;
  depth?: number;
  status: 'active' | 'closed' | 'monitoring';
  state?: string;          // Indian state
  district?: string;       // District
  affectedPopulation?: number;
}

// ---------- Weather Data ----------
export interface WeatherData {
  id: string;
  location: string;
  latitude: number;
  longitude: number;
  rainfall: number;
  humidity: number;
  temperature: number;
  windSpeed: number;
  pressure: number;
  visibility: number;
  cloudCover: number;
  weatherCondition: string;
  timestamp: Date;
}

// ---------- Incident Report (Public) ----------
export interface IncidentReport {
  id: string;
  reporterName: string;
  reporterPhone: string;
  type: DisasterType;
  description: string;
  latitude: number;
  longitude: number;
  location: string;
  severity: Severity;
  imageUrl?: string;
  timestamp: Date;
  status: 'pending' | 'verified' | 'dismissed' | 'responded';
  verifiedBy?: string;
}

// ---------- Help Center ----------
export interface HelpCenter {
  id: string;
  name: string;
  type: 'hospital' | 'shelter' | 'fire_station' | 'police' | 'ndrf' | 'relief_camp';
  latitude: number;
  longitude: number;
  address: string;
  phone: string;
  capacity?: number;
  currentOccupancy?: number;
  isOperational: boolean;
  state: string;
}

// ---------- AI Engine Types ----------
export interface PredictionInput {
  rainfall: number;
  humidity: number;
  temperature: number;
  windSpeed: number;
  pressure: number;
  elevation: number;
  slope: number;
  latitude: number;
  longitude: number;
  historicalDensity: number;
  seismicActivity: number;
  coastalProximity: number;
  riverProximity: number;
  weatherSeverity: number;
}

export interface RiskAssessment {
  cycloneRisk: number;
  tsunamiRisk: number;
  floodRisk: number;
  earthquakeRisk: number;
  compositeRisk: number;
  severity: Severity;
  dominantHazard: DisasterType;
  timestamp: Date;
}

export interface ReliabilityResult {
  reliabilityScore: number;
  predictionEntropy: number;
  featureCoverage: number;
  calibrationScore: number;
  interpretation: string;
}

export interface DistributionShiftResult {
  mahalanobisDistance: number;
  normalizedDistance: number;
  distributionSimilarity: number;
  oodScore: number;
  oodRisk: 'low' | 'moderate' | 'high';
  isOutOfDistribution: boolean;
}

export interface AdmissibilityResult {
  admissibilityScore: number;
  decision: DecisionAction;
  threshold: number;
  reliability: number;
  normalizedMahalanobis: number;
  confidence: string;
  reasoning: string;
}

export interface FeatureContribution {
  feature: string;
  contribution: number;
  direction: 'positive' | 'negative';
  value: number;
}

export interface ExplainabilityResult {
  contributions: FeatureContribution[];
  topFactor: string;
  summary: string;
}

// ---------- Alert ----------
export interface Alert {
  id: string;
  eventId: string;
  level: AlertLevel;
  title: string;
  message: string;
  location: string;
  latitude: number;
  longitude: number;
  riskScore: number;
  admissibilityScore: number;
  decision: DecisionAction;
  timestamp: Date;
  acknowledged: boolean;
  disasterType: DisasterType;
  sentViaSMS: boolean;
  sentViaTelegram: boolean;
  sentViaWhatsApp: boolean;
  state?: string;
}

// ---------- Pipeline ----------
export interface PipelineResult {
  event: DisasterEvent;
  weather?: WeatherData;
  risk: RiskAssessment;
  reliability: ReliabilityResult;
  distributionShift: DistributionShiftResult;
  admissibility: AdmissibilityResult;
  explainability: ExplainabilityResult;
  alert?: Alert;
}

// ---------- Notification ----------
export interface NotificationRequest {
  type: 'sms' | 'telegram' | 'whatsapp';
  recipients: string[];
  message: string;
  alertLevel: AlertLevel;
  disasterType: DisasterType;
  location: string;
}

// ---------- Dashboard Stats ----------
export interface DashboardStats {
  activeEvents: number;
  criticalAlerts: number;
  avgReliability: number;
  avgAdmissibility: number;
  eventsExecuted: number;
  eventsDeferred: number;
  incidentReports: number;
  helpCentersActive: number;
  unsafeReduction: number;
  coverageRate: number;
}

// ---------- Research Metrics ----------
export interface ResearchMetrics {
  nominal: { baselineUnsafe: number; gatedUnsafe: number; coverage: number; reduction: number };
  distributionShift: { baselineUnsafe: number; gatedUnsafe: number; coverage: number; reduction: number };
}
