import { z } from "zod";
import { getIdentityDataset } from "@/lib/identity";
import {
  ApiError,
  apiError,
  apiJson,
  checkWriteOrigin,
  readJson,
  requireSession,
} from "@/lib/identity/http";
import {
  analyzeGaps,
  buildEffectiveEmployeeProfile,
  resolveTarget,
} from "@/domain/recommendation";
import {
  getDefaultMentorAvailability,
  MentorSearchError,
  searchMentors,
} from "@/domain/mentorship";
import { getMessagingStore } from "./store";
import type { MentorshipCatalog } from "./types";

type ThreadContext = { params: Promise<{ id: string }> };
const identifier = z.string().regex(/^[A-Za-z0-9_.:-]{1,120}$/);
const plainText = z
  .string()
  .min(1)
  .max(2000)
  .refine((value) => value.trim().length > 0 && !value.includes("\u0000"));
const createSchema = z
  .object({
    mentorId: identifier,
    skillId: identifier,
    subject: z.string().trim().min(1).max(120),
    text: plainText,
  })
  .strict();
const sendSchema = z.object({ text: plainText }).strict();
const statusSchema = z
  .object({ status: z.enum(["accepted", "declined", "closed"]) })
  .strict();

function failed(error: unknown): Response {
  if (error instanceof MentorSearchError)
    return apiJson(
      { error: error.code },
      {
        status:
          error.code === "UNKNOWN_EMPLOYEE" || error.code === "UNKNOWN_SKILL"
            ? 404
            : 400,
      },
    );
  return apiError(error);
}
async function threadId(context: ThreadContext): Promise<string> {
  const parsed = identifier.safeParse((await context.params).id);
  if (!parsed.success) throw new ApiError(404, "NOT_FOUND");
  return parsed.data;
}

export async function listThreads(request: Request): Promise<Response> {
  try {
    const session = await requireSession(request);
    return apiJson(
      await getMessagingStore().list(
        session.employeeId,
        await getIdentityDataset(),
      ),
    );
  } catch (error) {
    return failed(error);
  }
}
export async function createThread(request: Request): Promise<Response> {
  try {
    const session = await requireSession(request);
    const input = await readJson(request, createSchema);
    const dataset = await getIdentityDataset();
    if (input.mentorId === session.employeeId)
      throw new ApiError(400, "SELF_MENTOR");
    const mentor = Object.hasOwn(dataset.employeesById, input.mentorId)
      ? dataset.employeesById[input.mentorId]
      : undefined;
    if (!mentor) throw new ApiError(404, "UNKNOWN_EMPLOYEE");
    const result = await getMessagingStore().create(
      session.employeeId,
      input,
      dataset,
      (options) => {
        const search = searchMentors(
          dataset,
          {
            employeeId: session.employeeId,
            skillId: input.skillId,
            mentorId: mentor.id,
            limit: 1,
          },
          options,
        );
        const candidate = search.mentors.find(
          (employee) => employee.employeeId === input.mentorId,
        );
        if (!candidate) throw new ApiError(400, "MENTOR_NOT_ELIGIBLE");
        if (!candidate.available) throw new ApiError(409, "MENTOR_UNAVAILABLE");
      },
    );
    return apiJson(result, { status: 201 });
  } catch (error) {
    return failed(error);
  }
}
export async function getThread(
  request: Request,
  context: ThreadContext,
): Promise<Response> {
  try {
    const session = await requireSession(request);
    return apiJson(
      await getMessagingStore().get(
        await threadId(context),
        session.employeeId,
        await getIdentityDataset(),
      ),
    );
  } catch (error) {
    return failed(error);
  }
}
export async function sendMessage(
  request: Request,
  context: ThreadContext,
): Promise<Response> {
  try {
    const session = await requireSession(request);
    const input = await readJson(request, sendSchema);
    return apiJson(
      await getMessagingStore().send(
        await threadId(context),
        session.employeeId,
        input.text,
      ),
      { status: 201 },
    );
  } catch (error) {
    return failed(error);
  }
}
export async function markThreadRead(
  request: Request,
  context: ThreadContext,
): Promise<Response> {
  try {
    checkWriteOrigin(request);
    const session = await requireSession(request);
    return apiJson(
      await getMessagingStore().markRead(
        await threadId(context),
        session.employeeId,
      ),
    );
  } catch (error) {
    return failed(error);
  }
}
export async function updateThread(
  request: Request,
  context: ThreadContext,
): Promise<Response> {
  try {
    const session = await requireSession(request);
    const { status } = await readJson(request, statusSchema, 1024);
    return apiJson(
      await getMessagingStore().changeStatus(
        await threadId(context),
        session.employeeId,
        status,
        await getIdentityDataset(),
      ),
    );
  } catch (error) {
    return failed(error);
  }
}
export async function messageUpdates(request: Request): Promise<Response> {
  try {
    const session = await requireSession(request);
    const query = new URL(request.url).searchParams;
    if (
      [...query.keys()].some((key) => key !== "cursor") ||
      query.getAll("cursor").length > 1
    )
      throw new ApiError(400, "INVALID_REQUEST");
    const cursorText = query.get("cursor") ?? "0";
    if (
      !/^\d{1,16}$/.test(cursorText) ||
      !Number.isSafeInteger(Number(cursorText))
    )
      throw new ApiError(400, "INVALID_REQUEST");
    return apiJson(
      await getMessagingStore().updates(session.employeeId, Number(cursorText)),
    );
  } catch (error) {
    return failed(error);
  }
}
export async function messageSummary(request: Request): Promise<Response> {
  try {
    const session = await requireSession(request);
    if (session.role !== "hr") throw new ApiError(403, "FORBIDDEN");
    const dataset = await getIdentityDataset();
    return apiJson(
      await getMessagingStore().aggregate(
        (availability) =>
          Object.keys(dataset.employeesById).filter(
            (employeeId) =>
              availability[employeeId] ??
              getDefaultMentorAvailability(dataset, employeeId),
          ).length,
      ),
    );
  } catch (error) {
    return failed(error);
  }
}
export async function mentorSearch(request: Request): Promise<Response> {
  try {
    const session = await requireSession(request);
    const query = new URL(request.url).searchParams;
    const allowed = ["skillId", "department", "role", "availableOnly"];
    if (
      [...query.keys()].some(
        (key) => !allowed.includes(key) || query.getAll(key).length > 1,
      )
    )
      throw new ApiError(400, "INVALID_REQUEST");
    const skillId = identifier.safeParse(query.get("skillId"));
    if (!skillId.success) throw new ApiError(400, "INVALID_REQUEST");
    const availableOnly = query.get("availableOnly");
    if (
      availableOnly !== null &&
      availableOnly !== "true" &&
      availableOnly !== "false"
    )
      throw new ApiError(400, "INVALID_REQUEST");
    const department = query.get("department") || undefined;
    const role = query.get("role") || undefined;
    if ((department?.length ?? 0) > 200 || (role?.length ?? 0) > 200)
      throw new ApiError(400, "INVALID_REQUEST");
    return apiJson(
      searchMentors(
        await getIdentityDataset(),
        {
          employeeId: session.employeeId,
          skillId: skillId.data,
          department,
          role,
          availableOnly: availableOnly === "true",
        },
        await getMessagingStore().mentorOptions(),
      ),
    );
  } catch (error) {
    return failed(error);
  }
}
export async function mentorCatalog(request: Request): Promise<Response> {
  try {
    const session = await requireSession(request);
    const dataset = await getIdentityDataset();
    const profile = buildEffectiveEmployeeProfile(dataset, session.employeeId);
    const gaps = analyzeGaps(profile, resolveTarget(dataset, profile));
    const options = await getMessagingStore().mentorOptions();
    const catalog: MentorshipCatalog = {
      skills: Object.values(dataset.skillsById)
        .map(({ id, name }) => ({ id, name }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      criticalGaps: gaps.gaps
        .filter((gap) => gap.critical && gap.gap > 0)
        .map(({ skillId, currentLevel, requiredLevel, gap }) => ({
          skillId,
          currentLevel,
          requiredLevel,
          gap,
        })),
      departments: [
        ...new Set(
          Object.values(dataset.employeesById).map(
            (employee) => employee.department,
          ),
        ),
      ].sort(),
      roles: [
        ...new Set(
          Object.values(dataset.employeesById).map((employee) => employee.role),
        ),
      ].sort(),
      available:
        options.availability[session.employeeId] ??
        getDefaultMentorAvailability(dataset, session.employeeId),
    };
    return apiJson(catalog);
  } catch (error) {
    return failed(error);
  }
}
export async function getAvailability(request: Request): Promise<Response> {
  try {
    const session = await requireSession(request);
    const options = await getMessagingStore().mentorOptions();
    return apiJson({
      available:
        options.availability[session.employeeId] ??
        getDefaultMentorAvailability(
          await getIdentityDataset(),
          session.employeeId,
        ),
    });
  } catch (error) {
    return failed(error);
  }
}
export async function putAvailability(request: Request): Promise<Response> {
  try {
    const session = await requireSession(request);
    const input = await readJson(
      request,
      z.object({ available: z.boolean() }).strict(),
      1024,
    );
    return apiJson(
      await getMessagingStore().setAvailability(
        session.employeeId,
        input.available,
      ),
    );
  } catch (error) {
    return failed(error);
  }
}
