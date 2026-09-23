import { writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as identity } from "@/app/api/identity/session/route";
import { GET as demoDataset } from "@/app/api/demo-dataset/route";
import {
  createThread,
  getAvailability,
  getThread,
  listThreads,
  markThreadRead,
  mentorCatalog,
  mentorSearch,
  messageSummary,
  messageUpdates,
  putAvailability,
  sendMessage,
  updateThread,
} from "@/server/messaging/api";
import { MessagingStore } from "@/server/messaging/store";
import {
  clearStore,
  context,
  conversationFixture,
  installStore,
  request,
  temporaryStore,
} from "./fixtures";

let temporary: Awaited<ReturnType<typeof temporaryStore>>;
let fixture: Awaited<ReturnType<typeof conversationFixture>>;
beforeEach(async () => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret-at-least-thirty-two-bytes");
  temporary = await temporaryStore();
  installStore(temporary.store);
  fixture = await conversationFixture();
  await temporary.store.setAvailability(fixture.mentorId, true);
});
afterEach(async () => {
  clearStore();
  await temporary.cleanup();
  vi.unstubAllEnvs();
});
const input = () => ({
  mentorId: fixture.mentorId,
  skillId: fixture.skillId,
  subject: "Mentoring request",
  text: "Please help with this skill.",
});
async function create() {
  const response = await createThread(
    request("/api/messages/threads", fixture.requesterId, "POST", input()),
  );
  expect(response.status).toBe(201);
  return (await response.json()).thread as { id: string };
}

describe("Participant-only messaging API", () => {
  it("gates the actual demo data endpoint and projects only the signed employee's private history", async () => {
    expect((await demoDataset(request("/api/demo-dataset"))).status).toBe(401);
    const response = await demoDataset(
      request("/api/demo-dataset", fixture.requesterId),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { dataset } = await response.json();
    expect(Object.keys(dataset.employeesById)).toEqual([fixture.requesterId]);
    expect(Object.keys(dataset.historyByEmployeeId)).toEqual([
      fixture.requesterId,
    ]);
    expect(dataset.history).toEqual(
      fixture.dataset.historyByEmployeeId[fixture.requesterId] ?? [],
    );
    const stale = await demoDataset(
      request("/api/demo-dataset", fixture.requesterId, "GET", undefined, {
        "x-career-identity": fixture.mentorId,
      }),
    );
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: "SESSION_CHANGED" });
    const organization = await (
      await demoDataset(request("/api/demo-dataset", fixture.hrId))
    ).json();
    expect(Object.keys(organization.dataset.employeesById).sort()).toEqual(
      Object.keys(fixture.dataset.employeesById).sort(),
    );
    expect(organization.dataset.history).toEqual(fixture.dataset.history);
  });
  it("requires a signed identity and rejects writes from a stale identity tab", async () => {
    expect((await listThreads(request("/api/messages/threads"))).status).toBe(
      401,
    );
    expect(
      (
        await mentorSearch(
          request(`/api/mentorship/search?skillId=${fixture.skillId}`),
        )
      ).status,
    ).toBe(401);
    const changed = await createThread(
      request("/api/messages/threads", fixture.mentorId, "POST", input(), {
        "x-career-identity": fixture.requesterId,
      }),
    );
    expect(changed.status).toBe(409);
    expect(await changed.json()).toEqual({ error: "SESSION_CHANGED" });
    expect(
      (await temporary.store.list(fixture.requesterId, fixture.dataset))
        .threads,
    ).toEqual([]);
  });

  it("denies every foreign thread operation, including HR, without leaking existence or updates", async () => {
    const thread = await create();
    for (const employeeId of [fixture.strangerId, fixture.hrId]) {
      expect(
        await (
          await listThreads(request("/api/messages/threads", employeeId))
        ).json(),
      ).toEqual({ threads: [], cursor: 0 });
      const responses = await Promise.all([
        getThread(
          request(`/api/messages/threads/${thread.id}`, employeeId),
          context(thread.id),
        ),
        sendMessage(
          request(
            `/api/messages/threads/${thread.id}/messages`,
            employeeId,
            "POST",
            { text: "intrusion" },
          ),
          context(thread.id),
        ),
        updateThread(
          request(`/api/messages/threads/${thread.id}`, employeeId, "PATCH", {
            status: "closed",
          }),
          context(thread.id),
        ),
        markThreadRead(
          request(
            `/api/messages/threads/${thread.id}/read`,
            employeeId,
            "POST",
          ),
          context(thread.id),
        ),
      ]);
      for (const response of responses) {
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "NOT_FOUND" });
      }
      expect(
        await (
          await messageUpdates(
            request("/api/messages/updates?cursor=0", employeeId),
          )
        ).json(),
      ).toEqual({ changed: false, cursor: 0 });
    }
    const owner = await getThread(
      request(`/api/messages/threads/${thread.id}`, fixture.mentorId),
      context(thread.id),
    );
    expect(owner.status).toBe(200);
    expect((await owner.json()).messages).toHaveLength(1);
  });

  it("delivers unread/read receipts and monotonic revisions even when wall-clock timestamps match", async () => {
    const thread = await create();
    const initial = await temporary.store.get(
      thread.id,
      fixture.mentorId,
      fixture.dataset,
    );
    expect(initial.thread.unreadCount).toBe(1);
    const read = await markThreadRead(
      request(
        `/api/messages/threads/${thread.id}/read`,
        fixture.mentorId,
        "POST",
      ),
      context(thread.id),
    );
    const readCursor = (await read.json()).cursor;
    expect(readCursor).toBeGreaterThan(initial.cursor);
    // Cursors belong to an identity; the mentor's prior availability change is private.
    const requesterBeforeReply = (
      await temporary.store.updates(fixture.requesterId, 0)
    ).cursor;
    const text = '<b onclick="evil()">This is plain text</b>';
    const sent = await sendMessage(
      request(
        `/api/messages/threads/${thread.id}/messages`,
        fixture.mentorId,
        "POST",
        { text },
      ),
      context(thread.id),
    );
    expect(sent.status).toBe(201);
    expect((await sent.json()).message.text).toBe(text);
    const current = await temporary.store.get(
      thread.id,
      fixture.requesterId,
      fixture.dataset,
    );
    expect(current.thread.unreadCount).toBe(1);
    expect(current.cursor).toBeGreaterThan(requesterBeforeReply);
    expect(
      await (
        await messageUpdates(
          request(
            `/api/messages/updates?cursor=${requesterBeforeReply}`,
            fixture.requesterId,
          ),
        )
      ).json(),
    ).toEqual({ changed: true, cursor: current.cursor });
  });

  it("allows only the mentor to accept or decline and forbids messages after decline or close", async () => {
    const thread = await create();
    expect(
      (
        await updateThread(
          request("/", fixture.requesterId, "PATCH", { status: "accepted" }),
          context(thread.id),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await updateThread(
          request("/", fixture.mentorId, "PATCH", { status: "declined" }),
          context(thread.id),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await sendMessage(
          request("/", fixture.requesterId, "POST", { text: "Too late" }),
          context(thread.id),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await updateThread(
          request("/", fixture.mentorId, "PATCH", { status: "accepted" }),
          context(thread.id),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await updateThread(
          request("/", fixture.requesterId, "PATCH", { status: "closed" }),
          context(thread.id),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await sendMessage(
          request("/", fixture.mentorId, "POST", { text: "Closed" }),
          context(thread.id),
        )
      ).status,
    ).toBe(409);
  });

  it("exposes only numeric HR aggregates and never message bodies or individual employee data", async () => {
    await create();
    expect(
      (
        await messageSummary(
          request("/api/messages/summary", fixture.requesterId),
        )
      ).status,
    ).toBe(403);
    const response = await messageSummary(
      request("/api/messages/summary", fixture.hrId),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.summary).toMatchObject({
      threadCount: 1,
      messageCount: 1,
      openCount: 1,
    });
    expect(
      Object.values(body.summary).every((value) => typeof value === "number"),
    ).toBe(true);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(fixture.requesterId);
    expect(serialized).not.toContain(input().text);
    expect(serialized).not.toContain(input().subject);
  });

  it("limits plain text lengths, rejects raw actor fields and blocks cross-origin writes", async () => {
    const thread = await create();
    for (const text of [" ", "x".repeat(2001), "a\u0000b"])
      expect(
        (
          await sendMessage(
            request("/", fixture.requesterId, "POST", { text }),
            context(thread.id),
          )
        ).status,
      ).toBe(400);
    expect(
      (
        await sendMessage(
          request("/", fixture.requesterId, "POST", {
            text: "Hello",
            authorId: fixture.mentorId,
          }),
          context(thread.id),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await sendMessage(
          request(
            "/",
            fixture.requesterId,
            "POST",
            { text: "Hello" },
            { origin: "https://evil.example" },
          ),
          context(thread.id),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await sendMessage(
          request(
            "/",
            fixture.requesterId,
            "POST",
            { text: "Hello" },
            { "sec-fetch-site": "cross-site" },
          ),
          context(thread.id),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await sendMessage(
          request("/", fixture.requesterId, "POST", {
            text: "x".repeat(20_000),
          }),
          context(thread.id),
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await sendMessage(
          request(
            "/",
            fixture.requesterId,
            "POST",
            { text: "Hello" },
            { "content-type": "application/jsonp" },
          ),
          context(thread.id),
        )
      ).status,
    ).toBe(415);
  });

  it("enforces the 20-message identity limit across endpoint calls", async () => {
    const thread = await create();
    for (let index = 0; index < 19; index += 1)
      expect(
        (
          await sendMessage(
            request("/", fixture.requesterId, "POST", {
              text: `Message ${index}`,
            }),
            context(thread.id),
          )
        ).status,
      ).toBe(201);
    const response = await sendMessage(
      request("/", fixture.requesterId, "POST", { text: "Over limit" }),
      context(thread.id),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).not.toBeNull();
    expect(await response.json()).toEqual({ error: "RATE_LIMITED" });
  });

  it("derives mentorship requester from the session and never exposes history or engagement", async () => {
    const url = `/api/mentorship/search?skillId=${fixture.skillId}&availableOnly=true`;
    const result = await (
      await mentorSearch(request(url, fixture.requesterId))
    ).json();
    expect(result.mentors.length).toBeGreaterThan(0);
    for (const mentor of result.mentors)
      expect(Object.keys(mentor).sort()).toEqual([
        "available",
        "employeeId",
        "fullName",
        "grade",
        "role",
        "skillLevel",
      ]);
    expect(
      result.mentors.some(
        (mentor: { employeeId: string }) =>
          mentor.employeeId === fixture.requesterId,
      ),
    ).toBe(false);
    expect(
      (
        await mentorSearch(
          request(
            `${url}&employeeId=${fixture.strangerId}`,
            fixture.requesterId,
          ),
        )
      ).status,
    ).toBe(400);
    const catalog = await (
      await mentorCatalog(
        request("/api/mentorship/catalog", fixture.requesterId),
      )
    ).json();
    expect(
      catalog.criticalGaps.some(
        (gap: { skillId: string }) => gap.skillId === fixture.skillId,
      ),
    ).toBe(true);
    expect(
      catalog.skills.every(
        (skill: object) => Object.keys(skill).sort().join(",") === "id,name",
      ),
    ).toBe(true);
  });

  it("changes availability only for the cookie owner and checks consent atomically at thread creation", async () => {
    expect(
      (
        await putAvailability(
          request("/", fixture.requesterId, "PUT", {
            available: false,
            employeeId: fixture.mentorId,
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      await (await getAvailability(request("/", fixture.mentorId))).json(),
    ).toEqual({ available: true });
    expect(
      (
        await putAvailability(
          request("/", fixture.mentorId, "PUT", { available: false }),
        )
      ).status,
    ).toBe(200);
    const response = await createThread(
      request("/", fixture.requesterId, "POST", input()),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "MENTOR_UNAVAILABLE" });
    expect(
      (await temporary.store.list(fixture.requesterId, fixture.dataset))
        .threads,
    ).toHaveLength(0);
  });

  it("degrades only messaging when the storage directory is unavailable", async () => {
    const blockedParent = path.join(temporary.directory, "not-a-directory");
    await writeFile(blockedParent, "file");
    installStore(new MessagingStore(path.join(blockedParent, "messages.json")));
    const unavailable = await listThreads(
      request("/api/messages/threads", fixture.requesterId),
    );
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ error: "SERVICE_UNAVAILABLE" });
    const session = await identity(
      request("/api/identity/session", fixture.requesterId),
    );
    expect(session.status).toBe(200);
    expect((await session.json()).session.employeeId).toBe(fixture.requesterId);
    const workspace = await demoDataset(
      request("/api/demo-dataset", fixture.requesterId),
    );
    expect(workspace.status).toBe(200);
    expect(Object.keys((await workspace.json()).dataset.employeesById)).toEqual(
      [fixture.requesterId],
    );
  });
});
