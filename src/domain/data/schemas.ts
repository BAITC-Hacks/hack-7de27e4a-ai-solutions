import { z } from "zod";

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected ISO date YYYY-MM-DD");
export const proficiencyLevelSchema = z.number().int().min(0).max(5);
export const gradeSchema = z.enum(["Junior", "Middle", "Senior", "Lead"]);

const meta = z.object({
  dataset: z.string().min(1),
  version: z.string().min(1),
  as_of_date: isoDateSchema,
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
      grade: gradeSchema,
      required_skills: z.record(z.string(), proficiencyLevelSchema),
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
      grade: gradeSchema,
      manager_id: z.string().min(1).nullable(),
      hire_date: isoDateSchema,
      tenure_months: z.number().int().nonnegative(),
      work_format: z.enum(["office", "hybrid", "remote"]),
      preferred_language: z.enum(["kk", "ru", "en"]),
      career_goal: z
        .object({
          target_role: z.string().min(1),
          target_grade: gradeSchema,
        })
        .nullable(),
      skills: z.record(z.string(), proficiencyLevelSchema),
      last_review_date: isoDateSchema,
    }),
  ),
});

/**
 * Canonical event input shape shared by the immutable starter-kit import and
 * the session-scoped HR event builder. Domain-specific policies are layered on
 * top of this schema instead of introducing a second event model.
 */
export const developmentEventInputSchema = z.object({
  event_id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  type: z.string().min(1),
  format: z.enum(["online", "offline", "self_paced"]),
  duration_hours: z.number().positive(),
  mandatory: z.boolean(),
  target_roles: z.array(z.string().min(1)),
  target_grades: z.array(gradeSchema),
  develops_skills: z.array(
    z.object({
      skill_id: z.string().min(1),
      gain: z.number().int().positive(),
      max_level: proficiencyLevelSchema,
    }),
  ),
  prerequisites: z.record(z.string(), proficiencyLevelSchema),
  upcoming_sessions: z.array(isoDateSchema),
});

export const eventsFileSchema = z.object({
  meta,
  events: z.array(developmentEventInputSchema),
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
  date: isoDateSchema,
  due_date: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    isoDateSchema.optional(),
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
