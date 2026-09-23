"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { catalogName } from "@/lib/i18n/domain";
import { statusLabel } from "./copy";
import type { ChatMessage, ThreadDetail, ThreadStatus } from "./api";
import styles from "./chat.module.css";

export function MessageList({
  messages,
  employeeId,
  otherName,
}: {
  messages: ChatMessage[];
  employeeId: string;
  otherName: string;
}) {
  const { locale, t, date } = useI18n();
  return (
    <div
      className={styles.messages}
      role="log"
      aria-label={t(
        "История сообщений",
        "Хабарламалар тарихы",
        "Message history",
      )}
      aria-live="polite"
      aria-relevant="additions"
    >
      {messages.map((message) => (
        <article
          key={message.id}
          className={`${styles.message} ${message.authorId === employeeId ? styles.ownMessage : ""}`}
        >
          <span className={styles.messageAuthor}>
            {message.authorId === employeeId
              ? t("Вы", "Сіз", "You")
              : otherName}
          </span>
          <p>{message.text}</p>
          <time dateTime={message.sentAt}>
            {date(message.sentAt)} ·{" "}
            {new Intl.DateTimeFormat(
              locale === "kk" ? "kk-KZ" : locale === "ru" ? "ru-RU" : "en-GB",
              { hour: "2-digit", minute: "2-digit" },
            ).format(new Date(message.sentAt))}
          </time>
        </article>
      ))}
    </div>
  );
}

export function ThreadPanel({
  detail,
  employeeId,
  busy,
  onSend,
  onStatus,
  onBack,
}: {
  detail: ThreadDetail;
  employeeId: string;
  busy: boolean;
  onSend: (text: string) => Promise<boolean>;
  onStatus: (status: ThreadStatus) => Promise<boolean>;
  onBack: () => void;
}) {
  const { t, locale, number } = useI18n();
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const { thread, messages } = detail;
  const mayReply = thread.status === "open" || thread.status === "accepted";
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);
  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!draft.trim() || draft.length > 2000 || busy || !mayReply) return;
    if (await onSend(draft)) {
      setDraft("");
      setSent(true);
      input.current?.focus();
    }
  }
  return (
    <section className={styles.threadPanel} aria-label={thread.subject}>
      <header className={styles.threadHeader}>
        <button
          className={`${styles.iconButton} ${styles.mobileBack}`}
          onClick={onBack}
          aria-label={t(
            "К списку диалогов",
            "Диалогтар тізіміне",
            "Back to conversations",
          )}
          type="button"
        >
          ←
        </button>
        <div className={styles.avatar} aria-hidden="true">
          {thread.other.fullName
            .split(/\s+/)
            .map((part) => part[0])
            .slice(0, 2)
            .join("")}
        </div>
        <div className={styles.threadHeading}>
          <h2>{thread.other.fullName}</h2>
          <p>
            {catalogName(thread.skillId, locale)} ·{" "}
            {catalogName(thread.other.role, locale)}
          </p>
        </div>
        <span className={`${styles.status} ${styles[thread.status]}`}>
          {statusLabel(thread.status, t)}
        </span>
      </header>
      <div className={styles.requestBar}>
        <div>
          <span className={styles.caption}>
            {t("Тема запроса", "Сұрау тақырыбы", "Request subject")}
          </span>
          <h3>{thread.subject}</h3>
        </div>
        <div className={styles.actions}>
          {thread.status === "open" && thread.mentorId === employeeId && (
            <>
              <button
                type="button"
                className={styles.primary}
                disabled={busy}
                onClick={() => void onStatus("accepted")}
              >
                {t("Принять", "Қабылдау", "Accept")}
              </button>
              <button
                type="button"
                className={styles.secondary}
                disabled={busy}
                onClick={() => void onStatus("declined")}
              >
                {t("Отклонить", "Бас тарту", "Decline")}
              </button>
            </>
          )}
          {thread.status !== "closed" && (
            <button
              type="button"
              className={styles.textButton}
              disabled={busy}
              onClick={() => void onStatus("closed")}
            >
              {t("Закрыть запрос", "Сұрауды жабу", "Close request")}
            </button>
          )}
        </div>
      </div>
      <div className={styles.historyScroll}>
        <MessageList
          messages={messages}
          employeeId={employeeId}
          otherName={thread.other.fullName}
        />
        <div ref={bottom} />
      </div>
      {mayReply ? (
        <form className={styles.composer} onSubmit={submit}>
          <label className={styles.srOnly} htmlFor="chat-message">
            {t("Сообщение", "Хабарлама", "Message")}
          </label>
          <textarea
            ref={input}
            id="chat-message"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setSent(false);
            }}
            maxLength={2000}
            rows={3}
            placeholder={t(
              "Напишите сообщение…",
              "Хабарлама жазыңыз…",
              "Write a message…",
            )}
            disabled={busy}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <div className={styles.composerFooter}>
            <span className={styles.caption} aria-live="polite">
              {sent
                ? t(
                    "Сообщение отправлено",
                    "Хабарлама жіберілді",
                    "Message sent",
                  )
                : `${number(draft.length)} / ${number(2000)}`}
            </span>
            <button
              type="submit"
              className={styles.primary}
              disabled={busy || !draft.trim()}
            >
              {busy
                ? t("Отправка…", "Жіберілуде…", "Sending…")
                : t("Отправить", "Жіберу", "Send")}{" "}
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </form>
      ) : (
        <div className={styles.closedNote}>
          {thread.status === "declined"
            ? t(
                "Запрос отклонён. Отправка сообщений недоступна.",
                "Сұрау қабылданбады. Хабарлама жіберу қолжетімсіз.",
                "This request was declined. Messaging is disabled.",
              )
            : t(
                "Диалог закрыт. История переписки сохранена.",
                "Диалог жабылды. Хабарламалар тарихы сақталды.",
                "This conversation is closed. Message history is preserved.",
              )}
        </div>
      )}
    </section>
  );
}
