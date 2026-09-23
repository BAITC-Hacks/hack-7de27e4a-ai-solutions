import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { NormalizedDataset } from "@/lib/contracts";
import { ApiError } from "@/lib/identity/http";
import type {
  Message,
  MessagingSummary,
  ThreadStatus,
  ThreadSummary,
} from "./types";

const id = z.string().min(1).max(120);
const timestamp = z.string().datetime();
const messageSchema = z
  .object({
    id,
    threadId: id,
    authorId: id,
    text: z.string().min(1).max(2000),
    sentAt: timestamp,
    readBy: z.array(id).max(2),
  })
  .strict();
const threadSchema = z
  .object({
    id,
    skillId: id,
    requesterId: id,
    mentorId: id,
    subject: z.string().min(1).max(120),
    status: z.enum(["open", "accepted", "declined", "closed"]),
    createdAt: timestamp,
    lastMessageAt: timestamp,
  })
  .strict();
const persistedSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    threads: z.array(threadSchema),
    messages: z.array(messageSchema),
    availability: z.record(
      z.string(),
      z.object({ available: z.boolean(), updatedAt: timestamp }).strict(),
    ),
    userRevisions: z.record(z.string(), z.number().int().nonnegative()),
    rateWindows: z.record(
      z.string(),
      z
        .object({
          startedAt: z.number().finite(),
          count: z.number().int().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict();
type StoredState = z.infer<typeof persistedSchema>;
type StoredThread = z.infer<typeof threadSchema>;
const emptyState = (): StoredState => ({
  version: 1,
  revision: 0,
  threads: [],
  messages: [],
  availability: {},
  userRevisions: {},
  rateWindows: {},
});

/** Single-process demo storage. Every read and atomic write goes through the same queue. */
export class MessagingStore {
  private cache: StoredState | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    readonly filePath: string,
    private readonly now: () => number = Date.now,
  ) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.catch(() => undefined);
    return next;
  }
  private async load(): Promise<StoredState> {
    if (this.cache) return this.cache;
    try {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      let raw: string;
      try {
        raw = await readFile(this.filePath, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          return (this.cache = emptyState());
        throw error;
      }
      const state = persistedSchema.parse(JSON.parse(raw));
      const threads = new Map(
        state.threads.map((thread) => [thread.id, thread]),
      );
      if (
        threads.size !== state.threads.length ||
        new Set(state.messages.map((message) => message.id)).size !==
          state.messages.length
      )
        throw new Error("Duplicate persisted IDs");
      for (const thread of state.threads)
        if (thread.requesterId === thread.mentorId)
          throw new Error("Invalid participants");
      for (const message of state.messages) {
        const thread = threads.get(message.threadId);
        if (
          !thread ||
          ![thread.requesterId, thread.mentorId].includes(message.authorId) ||
          message.readBy.some(
            (employeeId) =>
              ![thread.requesterId, thread.mentorId].includes(employeeId),
          )
        )
          throw new Error("Invalid message participants");
      }
      if (
        Object.values(state.userRevisions).some(
          (revision) => revision > state.revision,
        )
      )
        throw new Error("Invalid revision");
      this.cache = state;
      return state;
    } catch {
      throw new ApiError(503, "SERVICE_UNAVAILABLE");
    }
  }
  private async save(state: StoredState): Promise<void> {
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(temporary, JSON.stringify(state), {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      await rename(temporary, this.filePath);
      this.cache = state;
    } catch {
      await unlink(temporary).catch(() => undefined);
      throw new ApiError(503, "SERVICE_UNAVAILABLE");
    }
  }
  private read<T>(operation: (state: StoredState) => T): Promise<T> {
    return this.enqueue(async () =>
      structuredClone(operation(await this.load())),
    );
  }
  private mutate<T>(
    operation: (state: StoredState) => { changed: boolean; value: T },
  ): Promise<T> {
    return this.enqueue(async () => {
      const next = structuredClone(await this.load());
      const result = operation(next);
      if (result.changed) await this.save(next);
      return structuredClone(result.value);
    });
  }
  private participant(
    state: StoredState,
    threadId: string,
    employeeId: string,
  ): StoredThread {
    const thread = state.threads.find((item) => item.id === threadId);
    // A foreign thread is indistinguishable from a nonexistent one, including to HR.
    if (
      !thread ||
      (thread.requesterId !== employeeId && thread.mentorId !== employeeId)
    )
      throw new ApiError(404, "NOT_FOUND");
    return thread;
  }
  private bump(state: StoredState, employees: string[]): void {
    if (state.revision >= Number.MAX_SAFE_INTEGER)
      throw new ApiError(503, "SERVICE_UNAVAILABLE");
    state.revision += 1;
    // A cursor counts only this participant's changes; global gaps must not reveal
    // the volume of other people's private conversations.
    for (const employeeId of employees)
      state.userRevisions[employeeId] =
        (state.userRevisions[employeeId] ?? 0) + 1;
  }
  private consumeMessageRate(state: StoredState, employeeId: string): void {
    const now = this.now();
    let window = state.rateWindows[employeeId];
    if (!window || now - window.startedAt >= 60_000 || now < window.startedAt)
      window = { startedAt: now, count: 0 };
    if (window.count >= 20)
      throw new ApiError(
        429,
        "RATE_LIMITED",
        Math.max(1, Math.ceil((60_000 - (now - window.startedAt)) / 1000)),
      );
    state.rateWindows[employeeId] = {
      startedAt: window.startedAt,
      count: window.count + 1,
    };
  }
  private summary(
    thread: StoredThread,
    state: StoredState,
    employeeId: string,
    dataset: NormalizedDataset,
  ): ThreadSummary {
    const otherId =
      thread.requesterId === employeeId ? thread.mentorId : thread.requesterId;
    const other = dataset.employeesById[otherId];
    return {
      ...thread,
      unreadCount: state.messages.filter(
        (message) =>
          message.threadId === thread.id &&
          message.authorId !== employeeId &&
          !message.readBy.includes(employeeId),
      ).length,
      other: {
        employeeId: otherId,
        fullName: other?.fullName ?? otherId,
        role: other?.role ?? "",
        grade: other?.grade ?? "",
      },
    };
  }
  list(employeeId: string, dataset: NormalizedDataset) {
    return this.read((state) => ({
      threads: state.threads
        .filter(
          (thread) =>
            thread.requesterId === employeeId || thread.mentorId === employeeId,
        )
        .sort(
          (a, b) =>
            b.lastMessageAt.localeCompare(a.lastMessageAt) ||
            a.id.localeCompare(b.id),
        )
        .map((thread) => this.summary(thread, state, employeeId, dataset)),
      cursor: state.userRevisions[employeeId] ?? 0,
    }));
  }
  get(threadId: string, employeeId: string, dataset: NormalizedDataset) {
    return this.read((state) => {
      const thread = this.participant(state, threadId, employeeId);
      return {
        thread: this.summary(thread, state, employeeId, dataset),
        messages: state.messages.filter(
          (message) => message.threadId === threadId,
        ),
        cursor: state.userRevisions[employeeId] ?? 0,
      };
    });
  }
  create(
    employeeId: string,
    input: { mentorId: string; skillId: string; subject: string; text: string },
    dataset: NormalizedDataset,
    validateMentor: (options: {
      availability: Record<string, boolean>;
      activeLoad: Record<string, number>;
    }) => void,
  ) {
    return this.mutate((state) => {
      validateMentor(this.options(state));
      if (input.mentorId === employeeId) throw new ApiError(400, "SELF_MENTOR");
      this.consumeMessageRate(state, employeeId);
      const time = new Date(this.now()).toISOString();
      const thread: StoredThread = {
        id: randomUUID(),
        skillId: input.skillId,
        requesterId: employeeId,
        mentorId: input.mentorId,
        subject: input.subject,
        status: "open",
        createdAt: time,
        lastMessageAt: time,
      };
      const message: Message = {
        id: randomUUID(),
        threadId: thread.id,
        authorId: employeeId,
        text: input.text,
        sentAt: time,
        readBy: [employeeId],
      };
      state.threads.push(thread);
      state.messages.push(message);
      this.bump(state, [employeeId, input.mentorId]);
      return {
        changed: true,
        value: { thread: this.summary(thread, state, employeeId, dataset) },
      };
    });
  }
  send(threadId: string, employeeId: string, text: string) {
    return this.mutate((state) => {
      const thread = this.participant(state, threadId, employeeId);
      if (thread.status === "closed" || thread.status === "declined")
        throw new ApiError(409, "THREAD_CLOSED");
      this.consumeMessageRate(state, employeeId);
      const message: Message = {
        id: randomUUID(),
        threadId,
        authorId: employeeId,
        text,
        sentAt: new Date(this.now()).toISOString(),
        readBy: [employeeId],
      };
      state.messages.push(message);
      thread.lastMessageAt = message.sentAt;
      this.bump(state, [thread.requesterId, thread.mentorId]);
      return { changed: true, value: { message } };
    });
  }
  markRead(threadId: string, employeeId: string) {
    return this.mutate((state) => {
      const thread = this.participant(state, threadId, employeeId);
      let changed = false;
      for (const message of state.messages) {
        if (
          message.threadId === threadId &&
          !message.readBy.includes(employeeId)
        ) {
          message.readBy.push(employeeId);
          changed = true;
        }
      }
      if (changed) this.bump(state, [thread.requesterId, thread.mentorId]);
      return {
        changed,
        value: { ok: true, cursor: state.userRevisions[employeeId] ?? 0 },
      };
    });
  }
  changeStatus(
    threadId: string,
    employeeId: string,
    status: Exclude<ThreadStatus, "open">,
    dataset: NormalizedDataset,
  ) {
    return this.mutate((state) => {
      const thread = this.participant(state, threadId, employeeId);
      if (status !== "closed" && employeeId !== thread.mentorId)
        throw new ApiError(403, "FORBIDDEN");
      if (thread.status === status)
        return {
          changed: false,
          value: { thread: this.summary(thread, state, employeeId, dataset) },
        };
      if (
        thread.status === "closed" ||
        (status !== "closed" && thread.status !== "open")
      )
        throw new ApiError(409, "INVALID_STATUS");
      thread.status = status;
      this.bump(state, [thread.requesterId, thread.mentorId]);
      return {
        changed: true,
        value: { thread: this.summary(thread, state, employeeId, dataset) },
      };
    });
  }
  updates(employeeId: string, cursor: number) {
    return this.read((state) => {
      const current = state.userRevisions[employeeId] ?? 0;
      return { cursor: current, changed: current !== cursor };
    });
  }
  setAvailability(employeeId: string, available: boolean) {
    return this.mutate((state) => {
      if (state.availability[employeeId]?.available === available)
        return { changed: false, value: { available } };
      state.availability[employeeId] = {
        available,
        updatedAt: new Date(this.now()).toISOString(),
      };
      this.bump(state, [employeeId]);
      return { changed: true, value: { available } };
    });
  }
  private options(state: StoredState) {
    const activeLoad: Record<string, number> = {};
    for (const thread of state.threads)
      if (thread.status === "open" || thread.status === "accepted")
        activeLoad[thread.mentorId] = (activeLoad[thread.mentorId] ?? 0) + 1;
    return {
      availability: Object.fromEntries(
        Object.entries(state.availability).map(([employeeId, value]) => [
          employeeId,
          value.available,
        ]),
      ),
      activeLoad,
    };
  }
  mentorOptions() {
    return this.read((state) => this.options(state));
  }
  aggregate(
    availableMentors: (availability: Record<string, boolean>) => number,
  ): Promise<{ summary: MessagingSummary }> {
    return this.read((state) => ({
      summary: {
        threadCount: state.threads.length,
        messageCount: state.messages.length,
        openCount: state.threads.filter((thread) => thread.status === "open")
          .length,
        acceptedCount: state.threads.filter(
          (thread) => thread.status === "accepted",
        ).length,
        declinedCount: state.threads.filter(
          (thread) => thread.status === "declined",
        ).length,
        closedCount: state.threads.filter(
          (thread) => thread.status === "closed",
        ).length,
        availableMentorCount: availableMentors(
          this.options(state).availability,
        ),
      },
    }));
  }
}

const runtime = globalThis as typeof globalThis & {
  __careerQuestMessagingStore?: MessagingStore;
};
export function getMessagingStore(): MessagingStore {
  runtime.__careerQuestMessagingStore ??= new MessagingStore(
    // Runtime conversations are mounted writable data, never build-time assets.
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "data",
      "runtime",
      "messages.json",
    ),
  );
  return runtime.__careerQuestMessagingStore;
}
