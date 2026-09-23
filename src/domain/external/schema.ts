import { z } from "zod";

import type { SkillDefinition } from "@/lib/contracts";

export const EXTERNAL_COURSE_ALLOWED_HOSTS = [
  "coursera.org",
  "edx.org",
  "kaggle.com",
  "learn.microsoft.com",
  "online.iitu.edu.kz",
  "open.kaznu.kz",
  "openedu.ru",
  "openu.kz",
  "stepik.org",
  "trailhead.salesforce.com",
] as const;

const allowedHosts = new Set<string>(EXTERNAL_COURSE_ALLOWED_HOSTS);

function isAllowedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return [...allowedHosts].some(
    (host) => normalized === host || normalized.endsWith(`.${host}`),
  );
}

const safeExternalUrl = z.string().url().superRefine((value, context) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return;
  }
  if (url.protocol !== "https:") {
    context.addIssue({
      code: "custom",
      message: "External course URL must use HTTPS",
    });
  }
  if (!isAllowedHostname(url.hostname)) {
    context.addIssue({
      code: "custom",
      message: `External course host is not allowlisted: ${url.hostname}`,
    });
  }
  if (url.username || url.password) {
    context.addIssue({
      code: "custom",
      message: "External course URL must not contain credentials",
    });
  }
  if (url.port) {
    context.addIssue({
      code: "custom",
      message: "External course URL must use the default HTTPS port",
    });
  }
});

const proficiencyLevel = z.number().int().min(0).max(5);

export const externalCourseSchema = z
  .object({
    id: z.string().regex(/^EXT_[A-Z0-9_]+$/),
    title: z.string().min(1),
    provider: z.string().min(1),
    url: safeExternalUrl,
    languages: z
      .array(z.enum(["ru", "kk", "en"]))
      .min(1)
      .refine((values) => new Set(values).size === values.length, {
        message: "Course languages must be unique",
      }),
    durationHours: z.number().positive().max(1_000),
    free: z.boolean(),
    developsSkillIds: z
      .array(z.string().regex(/^SK_[A-Z0-9_]+$/))
      .min(1)
      .refine((values) => new Set(values).size === values.length, {
        message: "Course skill references must be unique",
      }),
    suitableFrom: proficiencyLevel,
    suitableTo: proficiencyLevel,
    source: z.literal("external"),
  })
  .strict()
  .refine((course) => course.suitableFrom <= course.suitableTo, {
    message: "suitableFrom must be less than or equal to suitableTo",
    path: ["suitableTo"],
  });

export const externalCourseCatalogSchema = z
  .object({
    meta: z
      .object({
        version: z.string().min(1),
        curatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        mode: z.literal("curated_offline"),
      })
      .strict(),
    courses: z.array(externalCourseSchema).min(1),
  })
  .strict();

export type ExternalCourse = z.infer<typeof externalCourseSchema>;
export type ExternalCourseCatalog = z.infer<typeof externalCourseCatalogSchema>;

export interface ExternalCatalogIssue {
  path: string;
  message: string;
}

export class ExternalCatalogValidationError extends Error {
  constructor(public readonly issues: ExternalCatalogIssue[]) {
    super(
      `External course catalog rejected: ${issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    );
    this.name = "ExternalCatalogValidationError";
  }
}

function parseJson(input: unknown): unknown {
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input) as unknown;
  } catch (error) {
    throw new ExternalCatalogValidationError([
      {
        path: "$",
        message: error instanceof Error ? error.message : "Invalid JSON",
      },
    ]);
  }
}

export function parseExternalCourseCatalog(
  input: unknown,
  skillsById: Readonly<Record<string, SkillDefinition>>,
): ExternalCourseCatalog {
  const parsed = externalCourseCatalogSchema.safeParse(parseJson(input));
  if (!parsed.success) {
    throw new ExternalCatalogValidationError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.length ? `$.${issue.path.join(".")}` : "$",
        message: issue.message,
      })),
    );
  }

  const issues: ExternalCatalogIssue[] = [];
  const ids = new Set<string>();
  parsed.data.courses.forEach((course, courseIndex) => {
    if (ids.has(course.id)) {
      issues.push({
        path: `$.courses.${courseIndex}.id`,
        message: `Duplicate course id: ${course.id}`,
      });
    }
    ids.add(course.id);
    course.developsSkillIds.forEach((skillId, skillIndex) => {
      if (!skillsById[skillId]) {
        issues.push({
          path: `$.courses.${courseIndex}.developsSkillIds.${skillIndex}`,
          message: `Unknown skill reference: ${skillId}`,
        });
      }
    });
  });

  if (issues.length) throw new ExternalCatalogValidationError(issues);
  return parsed.data;
}
