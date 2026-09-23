import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import {
  getIdentityDataset,
  SESSION_COOKIE_NAME,
  signDemoSession,
} from "@/lib/identity";
import {
  analyzeGaps,
  buildEffectiveEmployeeProfile,
  resolveTarget,
} from "@/domain/recommendation";
import { searchMentors } from "@/domain/mentorship";
import { MessagingStore } from "@/server/messaging/store";

const base = path.resolve(process.cwd(), "../../work/messaging-tests");
export async function temporaryStore(now?: () => number) {
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(path.join(base, "case-"));
  const store = new MessagingStore(path.join(directory, "messages.json"), now);
  return {
    store,
    directory,
    async cleanup() {
      const absolute = path.resolve(directory);
      if (!absolute.startsWith(`${base}${path.sep}`))
        throw new Error("Unsafe test cleanup path");
      await rm(absolute, { recursive: true, force: true });
    },
  };
}

export function installStore(store: MessagingStore): void {
  (
    globalThis as typeof globalThis & {
      __careerQuestMessagingStore?: MessagingStore;
    }
  ).__careerQuestMessagingStore = store;
}
export function clearStore(): void {
  delete (
    globalThis as typeof globalThis & {
      __careerQuestMessagingStore?: MessagingStore;
    }
  ).__careerQuestMessagingStore;
}
export async function conversationFixture() {
  const dataset = await getIdentityDataset();
  const availability = Object.fromEntries(
    Object.keys(dataset.employeesById).map((id) => [id, true]),
  );
  const hr = Object.values(dataset.employeesById).find(
    (employee) => employee.role === "HR Business Partner",
  )!;
  for (const employee of Object.values(dataset.employeesById)) {
    if (employee.id === hr.id || employee.role === "HR Business Partner")
      continue;
    const profile = buildEffectiveEmployeeProfile(dataset, employee.id);
    const gaps = analyzeGaps(profile, resolveTarget(dataset, profile));
    for (const gap of gaps.gaps.filter(
      (item) => item.critical && item.gap > 0,
    )) {
      const mentor = searchMentors(
        dataset,
        { employeeId: employee.id, skillId: gap.skillId, limit: 100 },
        { availability },
      ).mentors.find((candidate) => candidate.role !== "HR Business Partner");
      if (!mentor) continue;
      const stranger = Object.values(dataset.employeesById).find(
        (candidate) =>
          ![employee.id, mentor.employeeId, hr.id].includes(candidate.id),
      )!;
      return {
        dataset,
        requesterId: employee.id,
        mentorId: mentor.employeeId,
        strangerId: stranger.id,
        hrId: hr.id,
        skillId: gap.skillId,
      };
    }
  }
  throw new Error("Missing real-data mentor fixture");
}
export function request(
  url: string,
  employeeId?: string,
  method = "GET",
  body?: unknown,
  extraHeaders: Record<string, string> = {},
) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: {
      ...(employeeId
        ? { cookie: `${SESSION_COOKIE_NAME}=${signDemoSession(employeeId)}` }
        : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...extraHeaders,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
export const context = (id: string) => ({ params: Promise.resolve({ id }) });
