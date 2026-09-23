export const GRADES = ["Junior", "Middle", "Senior", "Lead"] as const;
export type Grade = (typeof GRADES)[number];

export type ProficiencyLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type PreferredLanguage = "kk" | "ru" | "en";
export type WorkFormat = "office" | "hybrid" | "remote";
export type EventFormat = "online" | "offline" | "self_paced";
export type ActivityStatus =
  | "completed"
  | "in_progress"
  | "dropped"
  | "no_show"
  | "declined"
  | "overdue";
export type AssignedBy = "self" | "manager" | "hr";

export interface DatasetMeta {
  dataset: string;
  version: string;
  asOfDate: string;
}

export interface SkillDefinition {
  id: string;
  name: string;
  type: "hard" | "soft";
  category: string;
  description: string;
}

export interface RoleProfile {
  role: string;
  grade: Grade;
  requiredSkills: Record<string, ProficiencyLevel>;
  criticalSkills: string[];
}

export interface CareerGoal {
  targetRole: string;
  targetGrade: Grade;
}

export interface Employee {
  id: string;
  fullName: string;
  department: string;
  role: string;
  grade: Grade;
  managerId: string | null;
  hireDate: string;
  tenureMonths: number;
  workFormat: WorkFormat;
  preferredLanguage: PreferredLanguage;
  careerGoal: CareerGoal | null;
  skills: Record<string, ProficiencyLevel>;
  lastReviewDate: string;
}

export interface SkillEffect {
  skillId: string;
  gain: number;
  maxLevel: ProficiencyLevel;
}

export interface DevelopmentEvent {
  id: string;
  title: string;
  description: string;
  type: string;
  format: EventFormat;
  durationHours: number;
  mandatory: boolean;
  targetRoles: string[];
  targetGrades: Grade[];
  developsSkills: SkillEffect[];
  prerequisites: Record<string, ProficiencyLevel>;
  upcomingSessions: string[];
}

export interface ActivityHistoryRecord {
  id: string;
  employeeId: string;
  eventId: string;
  date: string;
  dueDate?: string;
  status: ActivityStatus;
  completionPct: number;
  score?: number;
  feedbackRating?: number;
  assignedBy: AssignedBy;
}

export interface NormalizedDataset {
  meta: DatasetMeta;
  proficiencyScale: Record<string, string>;
  skillsById: Record<string, SkillDefinition>;
  roleProfilesByKey: Record<string, RoleProfile>;
  employeesById: Record<string, Employee>;
  eventsById: Record<string, DevelopmentEvent>;
  history: ActivityHistoryRecord[];
  historyByEmployeeId: Record<string, ActivityHistoryRecord[]>;
}

export interface CareerQuestFiles {
  employees: unknown | string;
  events: unknown | string;
  skills: unknown | string;
  activityHistoryCsv: string;
}

export interface ValidationIssue {
  source: "employees.json" | "events.json" | "skills.json" | "activity_history.csv" | "relations";
  path: string;
  message: string;
}

export function roleProfileKey(role: string, grade: Grade): string {
  return `${role}::${grade}`;
}
