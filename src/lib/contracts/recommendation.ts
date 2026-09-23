import type {
  DevelopmentEvent,
  Employee,
  Grade,
  ProficiencyLevel,
  RoleProfile,
} from "./dataset";

export interface SkillReplayEvidence {
  historyRecordId: string;
  eventId: string;
  skillId: string;
  date: string;
  before: ProficiencyLevel;
  gain: number;
  after: ProficiencyLevel;
  maxLevel: ProficiencyLevel;
}

export interface EffectiveEmployeeProfile {
  employee: Employee;
  effectiveSkills: Record<string, ProficiencyLevel>;
  replayEvidence: SkillReplayEvidence[];
}

export interface TargetResolution {
  role: string;
  grade: Grade;
  source: "career_goal" | "next_grade";
  profile: RoleProfile;
}

export interface SkillGap {
  skillId: string;
  currentLevel: ProficiencyLevel;
  requiredLevel: ProficiencyLevel;
  gap: number;
  critical: boolean;
  weight: number;
}

export interface GapAnalysis {
  target: TargetResolution | null;
  gaps: SkillGap[];
  readiness: number;
  promotionEligible: boolean;
  weightedRemainingGap: number;
  weightedRequirements: number;
}

export type IneligibilityReason =
  | "MANDATORY_EVENT"
  | "ROLE_MISMATCH"
  | "GRADE_MISMATCH"
  | "PREREQUISITES_NOT_MET"
  | "ALREADY_COMPLETED"
  | "ALREADY_IN_PROGRESS"
  | "NO_UPCOMING_SESSION"
  | "NO_TARGET_GAP_IMPACT";

export interface EligibilityResult {
  eligible: boolean;
  reasons: IneligibilityReason[];
  effectiveGains: Record<string, number>;
}

export interface FactorScores {
  targetGapImpact: number;
  engagementFit: number;
  feasibility: number;
  goalAlignment: number;
  pathDiversity: number;
}

export type EvidenceKind =
  | "target"
  | "skill_gap"
  | "effective_gain"
  | "history"
  | "feasibility"
  | "projection"
  | "factor"
  | "replay";

export interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  label: string;
  value: string | number | boolean;
  source: string;
}

export interface EvidenceReceipt {
  engineVersion: string;
  targetRole: string;
  targetGrade: Grade;
  scoringWeights: FactorScores;
  factorScores: FactorScores;
  factorContributions: FactorScores;
  evidence: EvidenceItem[];
  diversityPenalty: number;
}

export interface Recommendation {
  activityId: string;
  title: string;
  rank: number;
  baseScore: number;
  totalScore: number;
  projectedReadiness: number;
  factorScores: FactorScores;
  factorContributions: FactorScores;
  effectiveGains: Record<string, number>;
  evidenceReceipt: EvidenceReceipt;
  deterministicExplanation: string;
}

export interface ExcludedCandidate {
  activityId: string;
  title: string;
  reasons: IneligibilityReason[];
}

export interface RecommendationResult {
  employeeId: string;
  effectiveProfile: EffectiveEmployeeProfile;
  gapAnalysis: GapAnalysis;
  recommendations: Recommendation[];
  excluded: ExcludedCandidate[];
  consideredCandidates: number;
  engineVersion: string;
}

export interface ScoredCandidate {
  event: DevelopmentEvent;
  baseScore: number;
  factorScores: FactorScores;
  factorContributions: FactorScores;
  effectiveGains: Record<string, number>;
  projectedReadiness: number;
  evidence: EvidenceItem[];
}
