import Papa from "papaparse";
import type { ZodError, ZodType } from "zod";

import {
  type ActivityHistoryRecord,
  type CareerQuestFiles,
  type DevelopmentEvent,
  type Employee,
  type Grade,
  type NormalizedDataset,
  type ProficiencyLevel,
  type RoleProfile,
  type SkillDefinition,
  type ValidationIssue,
  roleProfileKey,
} from "@/lib/contracts";

import {
  activityHistoryRowSchema,
  employeesFileSchema,
  eventsFileSchema,
  skillsFileSchema,
  type ActivityHistoryRowInput,
  type EmployeesFileInput,
  type EventsFileInput,
  type SkillsFileInput,
} from "./schemas";

export class DatasetValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(`Career Quest dataset validation failed with ${issues.length} issue(s)`);
    this.name = "DatasetValidationError";
  }
}

function parseJson(input: unknown | string, source: ValidationIssue["source"]): unknown {
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input) as unknown;
  } catch (error) {
    throw new DatasetValidationError([
      {
        source,
        path: "$",
        message: error instanceof Error ? error.message : "Invalid JSON",
      },
    ]);
  }
}

function zodIssues(source: ValidationIssue["source"], error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    source,
    path: issue.path.length ? issue.path.join(".") : "$",
    message: issue.message,
  }));
}

function parseWithSchema<T>(
  schema: ZodType<T>,
  value: unknown,
  source: ValidationIssue["source"],
): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new DatasetValidationError(zodIssues(source, result.error));
  return result.data;
}

function parseHistory(csv: string): ActivityHistoryRowInput[] {
  const parsed = Papa.parse<Record<string, unknown>>(csv, {
    header: true,
    skipEmptyLines: true,
  });
  const issues: ValidationIssue[] = parsed.errors.map((error) => ({
    source: "activity_history.csv",
    path: `row.${error.row ?? "unknown"}`,
    message: error.message,
  }));
  const rows: ActivityHistoryRowInput[] = [];
  parsed.data.forEach((row, index) => {
    const result = activityHistoryRowSchema.safeParse(row);
    if (!result.success) {
      issues.push(
        ...result.error.issues.map((issue) => ({
          source: "activity_history.csv" as const,
          path: `row.${index + 2}.${issue.path.join(".")}`,
          message: issue.message,
        })),
      );
      return;
    }
    rows.push(result.data);
  });
  if (issues.length) throw new DatasetValidationError(issues);
  return rows;
}

function addUnique<T>(
  record: Record<string, T>,
  key: string,
  value: T,
  path: string,
  issues: ValidationIssue[],
): void {
  if (key in record) {
    issues.push({ source: "relations", path, message: `Duplicate identifier: ${key}` });
    return;
  }
  record[key] = value;
}

function normalizeSkills(input: SkillsFileInput, issues: ValidationIssue[]) {
  const skillsById: Record<string, SkillDefinition> = {};
  input.skills.forEach((skill, index) => {
    addUnique(
      skillsById,
      skill.skill_id,
      {
        id: skill.skill_id,
        name: skill.name,
        type: skill.type,
        category: skill.category,
        description: skill.description,
      },
      `skills[${index}].skill_id`,
      issues,
    );
  });

  const roleProfilesByKey: Record<string, RoleProfile> = {};
  input.role_profiles.forEach((profile, index) => {
    const normalized: RoleProfile = {
      role: profile.role,
      grade: profile.grade as Grade,
      requiredSkills: profile.required_skills as Record<string, ProficiencyLevel>,
      criticalSkills: [...profile.critical_skills],
    };
    addUnique(
      roleProfilesByKey,
      roleProfileKey(normalized.role, normalized.grade),
      normalized,
      `role_profiles[${index}]`,
      issues,
    );
  });
  return { skillsById, roleProfilesByKey };
}

function normalizeEmployees(input: EmployeesFileInput, issues: ValidationIssue[]) {
  const employeesById: Record<string, Employee> = {};
  input.employees.forEach((employee, index) => {
    addUnique(
      employeesById,
      employee.employee_id,
      {
        id: employee.employee_id,
        fullName: employee.full_name,
        department: employee.department,
        role: employee.role,
        grade: employee.grade,
        managerId: employee.manager_id,
        hireDate: employee.hire_date,
        tenureMonths: employee.tenure_months,
        workFormat: employee.work_format,
        preferredLanguage: employee.preferred_language,
        careerGoal: employee.career_goal
          ? {
              targetRole: employee.career_goal.target_role,
              targetGrade: employee.career_goal.target_grade,
            }
          : null,
        skills: employee.skills as Record<string, ProficiencyLevel>,
        lastReviewDate: employee.last_review_date,
      },
      `employees[${index}].employee_id`,
      issues,
    );
  });
  return employeesById;
}

function normalizeEvents(input: EventsFileInput, issues: ValidationIssue[]) {
  const eventsById: Record<string, DevelopmentEvent> = {};
  input.events.forEach((event, index) => {
    addUnique(
      eventsById,
      event.event_id,
      {
        id: event.event_id,
        title: event.title,
        description: event.description,
        type: event.type,
        format: event.format,
        durationHours: event.duration_hours,
        mandatory: event.mandatory,
        targetRoles: [...event.target_roles],
        targetGrades: [...event.target_grades],
        developsSkills: event.develops_skills.map((effect) => ({
          skillId: effect.skill_id,
          gain: effect.gain,
          maxLevel: effect.max_level,
        })),
        prerequisites: event.prerequisites as Record<string, ProficiencyLevel>,
        upcomingSessions: [...event.upcoming_sessions].sort(),
      },
      `events[${index}].event_id`,
      issues,
    );
  });
  return eventsById;
}

function normalizeHistory(input: ActivityHistoryRowInput[], issues: ValidationIssue[]) {
  const seen: Record<string, true> = {};
  const history: ActivityHistoryRecord[] = [];
  input.forEach((row, index) => {
    if (seen[row.record_id]) {
      issues.push({
        source: "relations",
        path: `activity_history[${index}].record_id`,
        message: `Duplicate identifier: ${row.record_id}`,
      });
      return;
    }
    seen[row.record_id] = true;
    history.push({
      id: row.record_id,
      employeeId: row.employee_id,
      eventId: row.event_id,
      date: row.date,
      dueDate: row.due_date,
      status: row.status,
      completionPct: row.completion_pct,
      score: row.score,
      feedbackRating: row.feedback_rating,
      assignedBy: row.assigned_by,
    });
  });
  return history.sort(
    (a, b) => a.date.localeCompare(b.date) || a.employeeId.localeCompare(b.employeeId) || a.id.localeCompare(b.id),
  );
}

function validateRelations(dataset: Omit<NormalizedDataset, "historyByEmployeeId">): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const hasSkill = (skillId: string) => skillId in dataset.skillsById;

  Object.values(dataset.roleProfilesByKey).forEach((profile) => {
    Object.keys(profile.requiredSkills).forEach((skillId) => {
      if (!hasSkill(skillId)) {
        issues.push({ source: "relations", path: `role_profile.${profile.role}.${profile.grade}.${skillId}`, message: "Unknown skill" });
      }
    });
    profile.criticalSkills.forEach((skillId) => {
      if (!hasSkill(skillId) || !(skillId in profile.requiredSkills)) {
        issues.push({ source: "relations", path: `role_profile.${profile.role}.${profile.grade}.critical.${skillId}`, message: "Critical skill must exist in required skills" });
      }
    });
  });

  Object.values(dataset.employeesById).forEach((employee) => {
    if (!(roleProfileKey(employee.role, employee.grade) in dataset.roleProfilesByKey)) {
      issues.push({ source: "relations", path: `employee.${employee.id}.role_grade`, message: "Unknown role/grade profile" });
    }
    if (employee.careerGoal && !(roleProfileKey(employee.careerGoal.targetRole, employee.careerGoal.targetGrade) in dataset.roleProfilesByKey)) {
      issues.push({ source: "relations", path: `employee.${employee.id}.career_goal`, message: "Unknown target role/grade profile" });
    }
    if (employee.managerId && !(employee.managerId in dataset.employeesById)) {
      issues.push({ source: "relations", path: `employee.${employee.id}.manager_id`, message: "Unknown manager" });
    }
    Object.keys(employee.skills).forEach((skillId) => {
      if (!hasSkill(skillId)) issues.push({ source: "relations", path: `employee.${employee.id}.skills.${skillId}`, message: "Unknown skill" });
    });
  });

  Object.values(dataset.eventsById).forEach((event) => {
    event.developsSkills.forEach((effect) => {
      if (!hasSkill(effect.skillId)) issues.push({ source: "relations", path: `event.${event.id}.develops.${effect.skillId}`, message: "Unknown skill" });
    });
    Object.keys(event.prerequisites).forEach((skillId) => {
      if (!hasSkill(skillId)) issues.push({ source: "relations", path: `event.${event.id}.prerequisite.${skillId}`, message: "Unknown skill" });
    });
  });

  dataset.history.forEach((record) => {
    if (!(record.employeeId in dataset.employeesById)) {
      issues.push({ source: "relations", path: `history.${record.id}.employee_id`, message: "Unknown employee" });
    }
    if (!(record.eventId in dataset.eventsById)) {
      issues.push({ source: "relations", path: `history.${record.id}.event_id`, message: "Unknown event" });
    }
  });
  return issues;
}

export function importCareerQuestDataset(files: CareerQuestFiles): NormalizedDataset {
  const skills = parseWithSchema(skillsFileSchema, parseJson(files.skills, "skills.json"), "skills.json");
  const employees = parseWithSchema(employeesFileSchema, parseJson(files.employees, "employees.json"), "employees.json");
  const events = parseWithSchema(eventsFileSchema, parseJson(files.events, "events.json"), "events.json");
  const historyRows = parseHistory(files.activityHistoryCsv);
  const issues: ValidationIssue[] = [];

  const { skillsById, roleProfilesByKey } = normalizeSkills(skills, issues);
  const employeesById = normalizeEmployees(employees, issues);
  const eventsById = normalizeEvents(events, issues);
  const history = normalizeHistory(historyRows, issues);

  const metaDates = [skills.meta.as_of_date, employees.meta.as_of_date, events.meta.as_of_date];
  if (new Set(metaDates).size !== 1) {
    issues.push({ source: "relations", path: "meta.as_of_date", message: "Dataset files use different snapshot dates" });
  }
  historyRows.forEach((row, index) => {
    if (row.date > skills.meta.as_of_date) {
      issues.push({
        source: "activity_history.csv",
        path: `row.${index + 2}.date`,
        message: "History date must not be after the dataset snapshot",
      });
    }
  });

  const partial: Omit<NormalizedDataset, "historyByEmployeeId"> = {
    meta: {
      dataset: skills.meta.dataset,
      version: skills.meta.version,
      asOfDate: skills.meta.as_of_date,
    },
    proficiencyScale: skills.proficiency_scale,
    skillsById,
    roleProfilesByKey,
    employeesById,
    eventsById,
    history,
  };
  issues.push(...validateRelations(partial));
  if (issues.length) throw new DatasetValidationError(issues);

  const historyByEmployeeId: NormalizedDataset["historyByEmployeeId"] = {};
  history.forEach((record) => {
    (historyByEmployeeId[record.employeeId] ??= []).push(record);
  });
  return { ...partial, historyByEmployeeId };
}
