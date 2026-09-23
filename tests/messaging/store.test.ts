import {
  mkdir,
  readFile,
  rename,
  rmdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MessagingStore } from "@/server/messaging/store";
import { conversationFixture, temporaryStore } from "./fixtures";

let temporary: Awaited<ReturnType<typeof temporaryStore>>;
let fixture: Awaited<ReturnType<typeof conversationFixture>>;
let now = 1_800_000_000_000;
beforeEach(async () => {
  temporary = await temporaryStore(() => now);
  fixture = await conversationFixture();
});
afterEach(async () => {
  await temporary.cleanup();
});
const input = () => ({
  mentorId: fixture.mentorId,
  skillId: fixture.skillId,
  subject: "Mentorship",
  text: "Can we discuss this skill?",
});
const create = () =>
  temporary.store.create(
    fixture.requesterId,
    input(),
    fixture.dataset,
    () => undefined,
  );

describe("Atomic messaging storage", () => {
  it("creates a writable directory and treats an absent file as empty state", async () => {
    expect(
      await temporary.store.list(fixture.requesterId, fixture.dataset),
    ).toEqual({ threads: [], cursor: 0 });
    expect((await stat(temporary.directory)).isDirectory()).toBe(true);
    await expect(stat(temporary.store.filePath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("persists exact plain text, read receipts, availability and cursor across restart", async () => {
    const { thread } = await create();
    const html =
      '<img src=x onerror="alert(1)"><script>unsafe()</script> & text';
    await temporary.store.send(thread.id, fixture.mentorId, html);
    await temporary.store.setAvailability(fixture.mentorId, false);
    expect(
      (
        await temporary.store.get(
          thread.id,
          fixture.requesterId,
          fixture.dataset,
        )
      ).thread.unreadCount,
    ).toBe(1);
    await temporary.store.markRead(thread.id, fixture.requesterId);
    const before = await temporary.store.get(
      thread.id,
      fixture.requesterId,
      fixture.dataset,
    );
    const restarted = new MessagingStore(temporary.store.filePath, () => now);
    expect(
      await restarted.get(thread.id, fixture.requesterId, fixture.dataset),
    ).toEqual(before);
    expect(before.messages[1].text).toBe(html);
    expect(before.messages[1].readBy).toEqual([
      fixture.mentorId,
      fixture.requesterId,
    ]);
    expect(before.thread.unreadCount).toBe(0);
    expect(
      (await restarted.mentorOptions()).availability[fixture.mentorId],
    ).toBe(false);
    expect((await restarted.updates(fixture.requesterId, 0)).changed).toBe(
      true,
    );
  });

  it("serializes concurrent sends without losing messages and persists the identity rate limit", async () => {
    const { thread } = await create();
    await Promise.all(
      Array.from({ length: 19 }, (_, index) =>
        temporary.store.send(
          thread.id,
          fixture.requesterId,
          `Message ${index}`,
        ),
      ),
    );
    expect(
      (
        await temporary.store.get(
          thread.id,
          fixture.requesterId,
          fixture.dataset,
        )
      ).messages,
    ).toHaveLength(20);
    await expect(
      temporary.store.send(thread.id, fixture.requesterId, "Too many"),
    ).rejects.toMatchObject({ status: 429, code: "RATE_LIMITED" });
    const restarted = new MessagingStore(temporary.store.filePath, () => now);
    await expect(
      restarted.send(thread.id, fixture.requesterId, "Relogin is not a reset"),
    ).rejects.toMatchObject({ status: 429 });
    await restarted.send(
      thread.id,
      fixture.mentorId,
      "Other participant has a separate limit",
    );
    now += 60_000;
    await restarted.send(thread.id, fixture.requesterId, "Next window");
    const messages = (
      await restarted.get(thread.id, fixture.requesterId, fixture.dataset)
    ).messages;
    expect(messages).toHaveLength(22);
    expect(new Set(messages.map((message) => message.id)).size).toBe(22);
  });

  it("keeps cached and durable state unchanged after a failed atomic replacement and recovers", async () => {
    const { thread } = await create();
    const prior = await readFile(temporary.store.filePath, "utf8");
    const backup = path.join(temporary.directory, "backup.json");
    await rename(temporary.store.filePath, backup);
    await mkdir(temporary.store.filePath);
    await expect(
      temporary.store.send(thread.id, fixture.requesterId, "Must not appear"),
    ).rejects.toMatchObject({ status: 503 });
    expect(
      (
        await temporary.store.get(
          thread.id,
          fixture.requesterId,
          fixture.dataset,
        )
      ).messages,
    ).toHaveLength(1);
    expect(await readFile(backup, "utf8")).toBe(prior);
    await rmdir(temporary.store.filePath);
    await rename(backup, temporary.store.filePath);
    await temporary.store.send(thread.id, fixture.requesterId, "Recovered");
    expect(
      (
        await new MessagingStore(temporary.store.filePath).get(
          thread.id,
          fixture.requesterId,
          fixture.dataset,
        )
      ).messages.map((message) => message.text),
    ).toEqual([input().text, "Recovered"]);
  });

  it("does not overwrite corrupted data or expose another participant's mutation cursor", async () => {
    const { thread } = await create();
    const unchanged = await temporary.store.updates(fixture.strangerId, 0);
    const prior = await temporary.store.updates(fixture.requesterId, 0);
    await temporary.store.setAvailability(fixture.hrId, true);
    await temporary.store.setAvailability(fixture.hrId, false);
    await temporary.store.send(thread.id, fixture.mentorId, "Private update");
    expect(
      (await temporary.store.updates(fixture.requesterId, prior.cursor)).cursor,
    ).toBe(prior.cursor + 1);
    expect(await temporary.store.updates(fixture.strangerId, 0)).toEqual(
      unchanged,
    );
    expect(unchanged).toEqual({ changed: false, cursor: 0 });
    await writeFile(temporary.store.filePath, "{broken", "utf8");
    const restarted = new MessagingStore(temporary.store.filePath);
    await expect(
      restarted.list(fixture.requesterId, fixture.dataset),
    ).rejects.toMatchObject({ status: 503 });
    expect(await readFile(temporary.store.filePath, "utf8")).toBe("{broken");
  });
});
