"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { catalogName } from "@/lib/i18n/domain";
import { ChatApiError, chatApi, type Mentor, type ThreadSummary } from "./api";
import { chatError } from "./copy";
import styles from "./chat.module.css";

export function RequestDialog({
  mentor,
  skillId,
  employeeId,
  onClose,
  onCreated,
  onExpired,
}: {
  mentor: Mentor;
  skillId: string;
  employeeId: string;
  onClose: () => void;
  onCreated: (thread: ThreadSummary) => void;
  onExpired: () => void;
}) {
  const { t, locale, number } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const modal = dialog.current;
    modal?.showModal();
    return () => {
      controller.current?.abort();
      modal?.close();
    };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !subject.trim() || !text.trim()) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError(null);
    try {
      const result = await chatApi<{ thread: ThreadSummary }>(
        "/api/messages/threads",
        {
          method: "POST",
          body: { mentorId: mentor.employeeId, skillId, subject, text },
          signal: request.signal,
          employeeId,
        },
      );
      if (!request.signal.aborted) onCreated(result.thread);
    } catch (caught) {
      if (request.signal.aborted) return;
      const code =
        caught instanceof ChatApiError ? caught.code : "SERVICE_UNAVAILABLE";
      setError(code);
      if (code === "AUTH_REQUIRED" || code === "SESSION_CHANGED") onExpired();
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
      aria-labelledby="request-title"
    >
      <div className={styles.dialogHeading}>
        <div>
          <span className={styles.caption}>{catalogName(skillId, locale)}</span>
          <h2 id="request-title">
            {t("Запрос наставнику", "Тәлімгерге сұрау", "Mentoring request")}
          </h2>
        </div>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onClose}
          disabled={busy}
          aria-label={t("Закрыть", "Жабу", "Close")}
        >
          ×
        </button>
      </div>
      <p className={styles.dialogRecipient}>
        {t("Кому", "Кімге", "To")}: <strong>{mentor.fullName}</strong>
      </p>
      <form onSubmit={submit}>
        <label className={styles.field}>
          <span>{t("Тема", "Тақырып", "Subject")}</span>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={120}
            required
            autoFocus
            disabled={busy}
            placeholder={t(
              "С чем нужна помощь?",
              "Қандай көмек қажет?",
              "What would you like help with?",
            )}
          />
        </label>
        <label className={styles.field}>
          <span>
            {t("Первое сообщение", "Бірінші хабарлама", "First message")}
          </span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={2000}
            required
            rows={6}
            disabled={busy}
            placeholder={t(
              "Расскажите о задаче и удобном формате общения.",
              "Тапсырмаңыз бен ыңғайлы байланыс форматын сипаттаңыз.",
              "Describe your goal and how you would like to connect.",
            )}
          />
        </label>
        <div className={styles.caption}>
          {number(text.length)} / {number(2000)}
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {chatError(error, t)}
          </p>
        )}
        <div className={styles.dialogFooter}>
          <button
            type="button"
            className={styles.secondary}
            onClick={onClose}
            disabled={busy}
          >
            {t("Отмена", "Болдырмау", "Cancel")}
          </button>
          <button
            type="submit"
            className={styles.primary}
            disabled={busy || !subject.trim() || !text.trim()}
          >
            {busy
              ? t("Отправка…", "Жіберілуде…", "Sending…")
              : t("Отправить запрос", "Сұрау жіберу", "Send request")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
