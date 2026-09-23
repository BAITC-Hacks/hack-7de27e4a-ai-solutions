import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected ISO date YYYY-MM-DD");
const proficiencyLevel = z.number().int().min(0).max(5);
const grade = z.enum(["Junior", "Middle", "Senior", "Lead"]);

const meta = z.object({
  dataset: z.string().min(1),
  version: z.string().min(1),
  as_of_date: isoDate,
});

export const skillsFileSchema = z.object({
  meta,
  proficiency_scale: z.record(z.string(), z.string()),
  skills: z.array(
    z.object({
      skill_id: z.string().min(1),
      name: z.string().min(1),
      type: z.enum(["hard", "soft"]),
      category: z.string().min(1),
      description: z.string(),
    }),
  ),
  role_profiles: z.array(
    z.object({
      role: z.string().min(1),
      grade,
      required_skills: z.record(z.string(), proficiencyLevel),
      critical_skills: z.array(z.string().min(1)),
    }),
  ),
});

export const employeesFileSchema = z.object({
  meta,
  employees: z.array(
    z.object({
      employee_id: z.string().min(1),
      full_name: z.string().min(1),
      department: z.string().min(1),
      role: z.string().min(1),
      grade,
      manager_id: z.string().min(1).nullable(),
      hire_date: isoDate,
      tenure_months: z.number().int().nonnegative(),
      work_format: z.enum(["office", "hybrid", "remote"]),
      preferred_language: z.enum(["kk", "ru", "en"]),
      career_goal: z
        .object({
          target_role: z.string().min(1),
          target_grade: grade,
        })
        .nullable(),
      skills: z.record(z.string(), proficiencyLevel),
      last_review_date: isoDate,
    }),
  ),
});

export const eventsFileSchema = z.object({
  meta,
  events: z.array(
    z.object({
      event_id: z.string().min(1),
      title: z.string().min(1),
      description: z.string(),
      type: z.string().min(1),
      format: z.enum(["online", "offline", "self_paced"]),
      duration_hours: z.number().positive(),
      mandatory: z.boolean(),
      target_roles: z.array(z.string().min(1)),
      target_grades: z.array(grade),
      develops_skills: z.array(
        z.object({
          skill_id: z.string().min(1),
          gain: z.number().int().positive(),
          max_level: proficiencyLevel,
        }),
      ),
      prerequisites: z.record(z.string(), proficiencyLevel),
      upcoming_sessions: z.array(isoDate),
    }),
  ),
});

const optionalInteger = (min: number, max: number) =>
  z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : Number(value)),
    z.number().int().min(min).max(max).optional(),
  );

export const activityHistoryRowSchema = z.object({
  record_id: z.string().min(1),
  employee_id: z.string().min(1),
  event_id: z.string().min(1),
  date: isoDate,
  due_date: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    isoDate.optional(),
  ),
  status: z.enum(["completed", "in_progress", "dropped", "no_show", "declined", "overdue"]),
  completion_pct: z.preprocess((value) => Number(value), z.number().int().min(0).max(100)),
  score: optionalInteger(0, 100),
  feedback_rating: optionalInteger(1, 5),
  assigned_by: z.enum(["self", "manager", "hr"]),
});

export type SkillsFileInput = z.infer<typeof skillsFileSchema>;
export type EmployeesFileInput = z.infer<typeof employeesFileSchema>;
export type EventsFileInput = z.infer<typeof eventsFileSchema>;
export type ActivityHistoryRowInput = z.infer<typeof activityHistoryRowSchema>;
