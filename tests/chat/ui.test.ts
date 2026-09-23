import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../../src/lib/i18n/I18nProvider";
import { ChatWorkspace } from "../../src/components/chat/ChatWorkspace";
import {
  MessageList,
  ThreadPanel,
} from "../../src/components/chat/ThreadPanel";
import {
  ChatApiError,
  chatApi,
  startVisiblePolling,
  type ThreadDetail,
} from "../../src/components/chat/api";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const detail: ThreadDetail = {
  thread: {
    id: "thread-a",
    skillId: "SK_PYTHON",
    requesterId: "requester",
    mentorId: "mentor",
    subject: "Python practice",
    status: "open",
    createdAt: "2026-09-23T10:00:00.000Z",
    lastMessageAt: "2026-09-23T10:00:00.000Z",
    unreadCount: 1,
    other: {
      employeeId: "mentor",
      fullName: "Colleague",
      role: "Backend Engineer",
      grade: "Senior",
    },
  },
  messages: [
    {
      id: "message-a",
      threadId: "thread-a",
      authorId: "mentor",
      text: '<img src=x onerror="alert(1)">\nHello & welcome',
      sentAt: "2026-09-23T10:00:00.000Z",
      readBy: ["mentor"],
    },
  ],
  cursor: 1,
};

describe("chat privacy and presentation", () => {
  it.each([
    ["ru", "Выбрать профиль"],
    ["kk", "Профильді таңдау"],
    ["en", "Choose profile"],
  ] as const)(
    "logged-out %s view exposes only the identity gate",
    (locale, label) => {
      const html = renderToStaticMarkup(
        createElement(I18nProvider, {
          initialLocale: locale,
          children: createElement(ChatWorkspace, { initialSkill: "SK_PYTHON" }),
        }),
      );
      expect(html).toContain(label);
      expect(html).not.toContain("chat-message");
      expect(html).not.toContain("request-title");
      expect(html).not.toContain("Colleague");
    },
  );

  it("renders received markup as text rather than DOM", () => {
    const html = renderToStaticMarkup(
      createElement(MessageList, {
        messages: detail.messages,
        employeeId: "requester",
        otherName: "Colleague",
      }),
    );
    expect(html).toContain("&lt;img");
    expect(html).toContain("Hello &amp; welcome");
    expect(html).not.toContain("<img");
  });

  it("only offers accept/decline to the requested mentor and disables closed conversations", () => {
    const render = (employeeId: string, value = detail) =>
      renderToStaticMarkup(
        createElement(ThreadPanel, {
          detail: value,
          employeeId,
          busy: false,
          onSend: async () => true,
          onStatus: async () => true,
          onBack: () => {},
        }),
      );
    expect(render("mentor")).toContain(">Принять</button>");
    expect(render("mentor")).toContain(">Отклонить</button>");
    expect(render("requester")).not.toContain(">Принять</button>");
    const closed = render("requester", {
      ...detail,
      thread: { ...detail.thread, status: "closed" },
    });
    expect(closed).not.toContain("<textarea");
    expect(closed).toContain("История переписки сохранена");
  });

  it("binds a private request to the displayed identity and surfaces session mismatch", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: "SESSION_CHANGED" }, { status: 409 }),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(
      chatApi("/api/messages/threads", { employeeId: "requester" }),
    ).rejects.toMatchObject({ code: "SESSION_CHANGED", status: 409 });
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      credentials: "same-origin",
      cache: "no-store",
      headers: { "X-Career-Identity": "requester" },
    });
  });

  it("keeps server error bodies out of the user-visible error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("private storage path", { status: 503 }),
        ),
    );
    await expect(
      chatApi("/api/messages/threads", { employeeId: "requester" }),
    ).rejects.toEqual(new ChatApiError("SERVICE_UNAVAILABLE", 503));
  });
});

describe("visible-tab message updates", () => {
  it("polls every three seconds, stops on hide and resumes immediately on show", async () => {
    vi.useFakeTimers();
    let visible = true;
    let notify = () => {};
    const signals: AbortSignal[] = [];
    const sync = vi.fn(async (signal: AbortSignal) => {
      signals.push(signal);
    });
    const unsubscribe = vi.fn();
    const cleanup = startVisiblePolling({
      visible: () => visible,
      subscribe: (callback) => {
        notify = callback;
        return unsubscribe;
      },
      sync,
      onError: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(sync).toHaveBeenCalledTimes(2);
    visible = false;
    notify();
    expect(signals.at(-1)?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(9000);
    expect(sync).toHaveBeenCalledTimes(2);
    visible = true;
    notify();
    await vi.advanceTimersByTimeAsync(0);
    expect(sync).toHaveBeenCalledTimes(3);
    cleanup();
    expect(signals.at(-1)?.aborted).toBe(true);
    expect(unsubscribe).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(6000);
    expect(sync).toHaveBeenCalledTimes(3);
  });

  it("does not start hidden or overlap a pending fetch", async () => {
    vi.useFakeTimers();
    let visible = false;
    let notify = () => {};
    let finish: (() => void) | undefined;
    const sync = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const cleanup = startVisiblePolling({
      visible: () => visible,
      subscribe: (callback) => {
        notify = callback;
        return () => {};
      },
      sync,
      onError: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(6000);
    expect(sync).not.toHaveBeenCalled();
    visible = true;
    notify();
    await vi.advanceTimersByTimeAsync(9000);
    expect(sync).toHaveBeenCalledOnce();
    cleanup();
    finish?.();
    await vi.advanceTimersByTimeAsync(6000);
    expect(sync).toHaveBeenCalledOnce();
  });
});
