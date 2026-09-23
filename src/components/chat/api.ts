import type {
  ThreadSummary,
  Message,
  MessagingSummary,
  MentorshipCatalog,
} from "@/server/messaging/types";
export type { ThreadStatus, ThreadSummary } from "@/server/messaging/types";
export type ChatPerson = ThreadSummary["other"];
export type ChatMessage = Message;
export interface ThreadDetail {
  thread: ThreadSummary;
  messages: ChatMessage[];
  cursor: number;
}
export interface Mentor extends ChatPerson {
  skillLevel: number;
  available: boolean;
}
export type MentorCatalog = MentorshipCatalog;
export type MessageSummary = MessagingSummary;
export class ChatApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 0,
  ) {
    super(code);
  }
}
export async function chatApi<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    employeeId?: string;
  } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      signal: options.signal,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        ...(options.employeeId
          ? { "X-Career-Identity": options.employeeId }
          : {}),
        ...(options.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ChatApiError("NETWORK_ERROR");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new ChatApiError(
      typeof payload?.error === "string"
        ? payload.error
        : "SERVICE_UNAVAILABLE",
      response.status,
    );
  return payload as T;
}

/** One in-flight refresh. Hiding the tab aborts it; showing resumes immediately. */
export function startVisiblePolling(options: {
  visible: () => boolean;
  subscribe: (callback: () => void) => () => void;
  sync: (signal: AbortSignal) => Promise<void>;
  onError: (error: unknown) => void;
  intervalMs?: number;
}) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const stopCurrent = () => {
    clearTimeout(timer);
    controller?.abort();
    controller = undefined;
  };
  const run = async () => {
    if (stopped || !options.visible()) return;
    const current = new AbortController();
    controller = current;
    try {
      await options.sync(current.signal);
    } catch (error) {
      if (!current.signal.aborted && !stopped) options.onError(error);
    } finally {
      if (!stopped && !current.signal.aborted && options.visible()) {
        timer = setTimeout(run, options.intervalMs ?? 3000);
      }
    }
  };
  const unsubscribe = options.subscribe(() => {
    stopCurrent();
    if (options.visible()) void run();
  });
  void run();
  return () => {
    stopped = true;
    stopCurrent();
    unsubscribe();
  };
}
