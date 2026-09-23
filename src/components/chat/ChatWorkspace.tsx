"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useIdentity } from "@/components/identity/IdentityProvider";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { catalogName } from "@/lib/i18n/domain";
import {
  ChatApiError,
  chatApi,
  type MentorCatalog,
  type MessageSummary,
} from "./api";
import { chatError, statusLabel } from "./copy";
import { useChatInbox } from "./useChatInbox";
import { MentorSearch } from "./MentorSearch";
import { ThreadPanel } from "./ThreadPanel";
import styles from "./chat.module.css";

function EntryGate({ expired = false }: { expired?: boolean }) {
  const { t } = useI18n();
  const { openPicker } = useIdentity();
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon} aria-hidden="true">
        ↔
      </span>
      <h2>
        {t(
          "Общайтесь с коллегами",
          "Әріптестермен байланысыңыз",
          "Connect with colleagues",
        )}
      </h2>
      <p>
        {expired
          ? chatError("SESSION_CHANGED", t)
          : t(
              "Выберите свой демо-профиль, чтобы найти наставника и открыть личные диалоги.",
              "Тәлімгерді тауып, жеке диалогтарды ашу үшін демо-профиліңізді таңдаңыз.",
              "Choose your demo profile to find a mentor and open your conversations.",
            )}
      </p>
      <button
        type="button"
        className={styles.primary}
        onClick={() => openPicker()}
      >
        {t("Выбрать профиль", "Профильді таңдау", "Choose profile")}
      </button>
    </div>
  );
}

export function ChatWorkspace({
  initialSkill,
  initialMentor,
}: {
  initialSkill?: string;
  initialMentor?: string;
}) {
  const { session, loading } = useIdentity();
  const { t } = useI18n();
  return (
    <div className={styles.workspace}>
      <header className={styles.pageHeader}>
        <div>
          <h1>{t("Обмен навыками", "Дағдылар алмасу", "Skill exchange")}</h1>
          <p>
            {session ? t(
              "Профиль переписки: {name}",
              "Хат алмасу профилі: {name}",
              "Messaging profile: {name}",
              { name: session.fullName },
            ) : t(
              "Помогайте друг другу расти.",
              "Бір-біріңізге дамуға көмектесіңіз.",
              "Help each other grow.",
            )}
          </p>
        </div>
      </header>
      {loading ? (
        <div className={styles.empty} role="status">
          {t("Загрузка профиля…", "Профиль жүктелуде…", "Loading profile…")}
        </div>
      ) : session ? (
        <SignedInChat
          key={`${session.employeeId}:${session.role}`}
          employeeId={session.employeeId}
          isHR={session.role === "hr"}
          initialSkill={initialSkill}
          initialMentor={initialMentor}
        />
      ) : (
        <EntryGate />
      )}
    </div>
  );
}

function SignedInChat({
  employeeId,
  isHR,
  initialSkill,
  initialMentor,
}: {
  employeeId: string;
  isHR: boolean;
  initialSkill?: string;
  initialMentor?: string;
}) {
  const { t, locale, number, date } = useI18n();
  const { refresh: refreshIdentity } = useIdentity();
  const [expired, setExpired] = useState(false);
  const [tab, setTab] = useState<"inbox" | "search">(
    initialSkill ? "search" : "inbox",
  );
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [catalog, setCatalog] = useState<MentorCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogEpoch, setCatalogEpoch] = useState(0);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [summary, setSummary] = useState<MessageSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const onExpired = useCallback(() => {
    setExpired(true);
    setCatalog(null);
    setSummary(null);
    void refreshIdentity();
  }, [refreshIdentity]);
  const inbox = useChatInbox(employeeId, onExpired);
  useEffect(() => {
    if (initialSkill) setTab("search");
  }, [initialSkill, initialMentor]);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setCatalogError(null);
    void chatApi<MentorCatalog>("/api/mentorship/catalog", {
      signal: controller.signal,
      employeeId,
    })
      .then((value) => {
        if (!controller.signal.aborted) setCatalog(value);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        const code =
          error instanceof ChatApiError ? error.code : "SERVICE_UNAVAILABLE";
        setCatalogError(code);
        if (code === "AUTH_REQUIRED" || code === "SESSION_CHANGED") onExpired();
      });
    if (isHR)
      void chatApi<{ summary: MessageSummary }>("/api/messages/summary", {
        signal: controller.signal,
        employeeId,
      })
        .then((value) => {
          if (!controller.signal.aborted) {
            setSummary(value.summary);
            setSummaryError(null);
          }
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            const code =
              error instanceof ChatApiError
                ? error.code
                : "SERVICE_UNAVAILABLE";
            setSummaryError(code);
            if (code === "AUTH_REQUIRED" || code === "SESSION_CHANGED")
              onExpired();
          }
        });
    return () => controller.abort();
  }, [employeeId, isHR, catalogEpoch, onExpired]);
  async function setAvailability(available: boolean) {
    if (!lifetime.current || !catalog || availabilityBusy) return;
    const signal = lifetime.current.signal;
    setAvailabilityBusy(true);
    setCatalogError(null);
    try {
      await chatApi("/api/mentorship/availability", {
        method: "PUT",
        body: { available },
        signal,
        employeeId,
      });
      if (!signal.aborted)
        setCatalog((current) =>
          current ? { ...current, available } : current,
        );
    } catch (error) {
      if (!signal.aborted) {
        const code =
          error instanceof ChatApiError ? error.code : "SERVICE_UNAVAILABLE";
        setCatalogError(code);
        if (code === "AUTH_REQUIRED" || code === "SESSION_CHANGED") onExpired();
      }
    } finally {
      if (!signal.aborted) setAvailabilityBusy(false);
    }
  }
  if (expired) return <EntryGate expired />;
  const unread = inbox.threads.reduce(
    (sum, thread) => sum + thread.unreadCount,
    0,
  );
  const visibleThreads = unreadOnly
    ? inbox.threads.filter((thread) => thread.unreadCount > 0)
    : inbox.threads;
  return (
    <>
      <div className={styles.toolbar}>
        <div
          className={styles.tabs}
          role="tablist"
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? "inbox"
                : event.key === "End"
                  ? "search"
                  : tab === "inbox"
                    ? "search"
                    : "inbox";
            setTab(next);
            event.currentTarget
              .querySelector<HTMLButtonElement>(`#${next}-tab`)
              ?.focus();
          }}
          aria-label={t(
            "Разделы обмена навыками",
            "Дағдылар алмасу бөлімдері",
            "Skill exchange sections",
          )}
        >
          <button
            type="button"
            id="inbox-tab"
            role="tab"
            aria-selected={tab === "inbox"}
            tabIndex={tab === "inbox" ? 0 : -1}
            aria-controls="inbox-panel"
            className={tab === "inbox" ? styles.activeTab : ""}
            onClick={() => setTab("inbox")}
          >
            {t("Сообщения", "Хабарламалар", "Messages")}
            {unread > 0 && (
              <span className={styles.unreadBadge}>{number(unread)}</span>
            )}
          </button>
          <button
            type="button"
            id="search-tab"
            role="tab"
            aria-selected={tab === "search"}
            tabIndex={tab === "search" ? 0 : -1}
            aria-controls="search-panel"
            className={tab === "search" ? styles.activeTab : ""}
            onClick={() => setTab("search")}
          >
            {t("Найти наставника", "Тәлімгер табу", "Find a mentor")}
          </button>
        </div>
        {catalog && (
          <label className={styles.availabilityToggle}>
            <input
              type="checkbox"
              role="switch"
              checked={catalog.available}
              disabled={availabilityBusy}
              onChange={(event) => void setAvailability(event.target.checked)}
            />
            <span>
              {t(
                "Готов помогать коллегам",
                "Әріптестерге көмектесуге дайынмын",
                "Available to mentor",
              )}
            </span>
          </label>
        )}
      </div>
      {(inbox.error || catalogError) && (
        <div className={styles.errorBanner} role="alert">
          <p>{chatError(inbox.error ?? catalogError!, t)}</p>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              inbox.retry();
              setCatalogEpoch((value) => value + 1);
            }}
          >
            {t("Повторить", "Қайталау", "Retry")}
          </button>
        </div>
      )}
      <section
        id="inbox-panel"
        role="tabpanel"
        aria-labelledby="inbox-tab"
        hidden={tab !== "inbox"}
      >
        <div
          className={`${styles.inboxLayout} ${inbox.selectedId ? styles.hasSelection : ""}`}
        >
          <aside
            className={styles.inbox}
            aria-label={t(
              "Мои диалоги",
              "Менің диалогтарым",
              "My conversations",
            )}
          >
            <div className={styles.inboxHeading}>
              <h2>{t("Входящие", "Кіріс", "Inbox")}</h2>
              <button
                className={styles.iconButton}
                type="button"
                onClick={inbox.retry}
                aria-label={t(
                  "Обновить диалоги",
                  "Диалогтарды жаңарту",
                  "Refresh conversations",
                )}
              >
                ↻
              </button>
            </div>
            <label className={styles.unreadFilter}>
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(event) => setUnreadOnly(event.target.checked)}
              />
              {t("Непрочитанные", "Оқылмаған", "Unread")}
            </label>
            {inbox.loading ? (
              <p className={styles.listNote} role="status">
                {t(
                  "Загрузка диалогов…",
                  "Диалогтар жүктелуде…",
                  "Loading conversations…",
                )}
              </p>
            ) : visibleThreads.length ? (
              <ul className={styles.threadList}>
                {visibleThreads.map((thread) => (
                  <li key={thread.id}>
                    <button
                      className={`${styles.threadItem} ${inbox.selectedId === thread.id ? styles.selectedThread : ""}`}
                      type="button"
                      onClick={() => inbox.setSelectedId(thread.id)}
                      aria-pressed={inbox.selectedId === thread.id}
                    >
                      <span className={styles.threadItemTop}>
                        <strong>{thread.other.fullName}</strong>
                        {thread.unreadCount > 0 && (
                          <span
                            className={styles.unreadBadge}
                            aria-label={t(
                              "Непрочитанных: {count}",
                              "Оқылмаған: {count}",
                              "Unread: {count}",
                              { count: number(thread.unreadCount) },
                            )}
                          >
                            {number(thread.unreadCount)}
                          </span>
                        )}
                      </span>
                      <span className={styles.threadSubject}>
                        {thread.subject}
                      </span>
                      <span className={styles.threadSkill}>
                        {catalogName(thread.skillId, locale)}
                      </span>
                      <span className={styles.threadItemBottom}>
                        <span
                          className={`${styles.status} ${styles[thread.status]}`}
                        >
                          {statusLabel(thread.status, t)}
                        </span>
                        <time dateTime={thread.lastMessageAt}>
                          {date(thread.lastMessageAt)}
                        </time>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.listEmpty}>
                <p>
                  {unreadOnly
                    ? t("Всё прочитано", "Барлығы оқылды", "All caught up")
                    : t(
                        "У вас пока нет диалогов",
                        "Әзірге диалогтарыңыз жоқ",
                        "No conversations yet",
                      )}
                </p>
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() => setTab("search")}
                >
                  {t("Найти наставника", "Тәлімгер табу", "Find a mentor")} →
                </button>
              </div>
            )}
          </aside>
          <div className={styles.threadSlot}>
            {inbox.detail ? (
              <ThreadPanel
                key={inbox.detail.thread.id}
                detail={inbox.detail}
                employeeId={employeeId}
                busy={inbox.busy}
                onSend={inbox.send}
                onStatus={inbox.updateStatus}
                onBack={() => inbox.setSelectedId(null)}
              />
            ) : (
              <div className={styles.empty}>
                {inbox.selectedId && (
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => inbox.setSelectedId(null)}
                  >
                    ← {t("К диалогам", "Диалогтарға", "Back to conversations")}
                  </button>
                )}
                <span className={styles.emptyIcon} aria-hidden="true">
                  ↔
                </span>
                <h2>
                  {inbox.detailLoading
                    ? t(
                        "Загрузка переписки…",
                        "Хат алмасу жүктелуде…",
                        "Loading messages…",
                      )
                    : t(
                        "Развитие начинается с разговора",
                        "Даму әңгімеден басталады",
                        "Growth starts with a conversation",
                      )}
                </h2>
                <p>
                  {t(
                    "Откройте диалог или найдите коллегу, у которого можно перенять опыт.",
                    "Диалогты ашыңыз немесе тәжірибесімен бөлісетін әріптесті табыңыз.",
                    "Open a conversation or find a colleague to learn from.",
                  )}
                </p>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => setTab("search")}
                >
                  {t("Найти наставника", "Тәлімгер табу", "Find a mentor")}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
      <section
        id="search-panel"
        role="tabpanel"
        aria-labelledby="search-tab"
        hidden={tab !== "search"}
      >
        {catalog ? (
          <MentorSearch
            employeeId={employeeId}
            catalog={catalog}
            initialSkill={initialSkill}
            initialMentor={initialMentor}
            onExpired={onExpired}
            onCreated={(thread) => {
              inbox.openCreated(thread);
              setTab("inbox");
              setUnreadOnly(false);
            }}
          />
        ) : (
          <div className={styles.empty} role="status">
            {catalogError
              ? chatError(catalogError, t)
              : t(
                  "Загрузка навыков…",
                  "Дағдылар жүктелуде…",
                  "Loading skills…",
                )}
          </div>
        )}
      </section>
      {isHR && (
        <details className={styles.help}>
          <summary>{t("Сводка для HR", "HR жиынтығы", "HR summary")}</summary>
          {summary ? (
            <div className={styles.summaryGrid}>
              {[
                [
                  t("Диалоги", "Диалогтар", "Conversations"),
                  summary.threadCount,
                ],
                [
                  t("Сообщения", "Хабарламалар", "Messages"),
                  summary.messageCount,
                ],
                [
                  t("Ожидают ответа", "Жауап күтілуде", "Awaiting reply"),
                  summary.openCount,
                ],
                [t("Приняты", "Қабылданды", "Accepted"), summary.acceptedCount],
                [
                  t("Отклонены", "Қабылданбады", "Declined"),
                  summary.declinedCount,
                ],
                [t("Закрыты", "Жабылды", "Closed"), summary.closedCount],
                [
                  t(
                    "Доступные наставники",
                    "Қолжетімді тәлімгерлер",
                    "Available mentors",
                  ),
                  summary.availableMentorCount,
                ],
              ].map(([label, count]) => (
                <div key={label}>
                  <strong>{number(Number(count))}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          ) : (
            <p>
              {summaryError
                ? chatError(summaryError, t)
                : t("Загрузка…", "Жүктелуде…", "Loading…")}
            </p>
          )}
          <p>
            {t(
              "HR видит общие счётчики и только собственные диалоги.",
              "HR жалпы сандарды және тек өзінің диалогтарын көреді.",
              "HR can see aggregate counts and only their own conversations.",
            )}
          </p>
        </details>
      )}
      <details className={styles.help}>
        <summary>
          {t(
            "О демо-переписке",
            "Демо хат алмасу туралы",
            "About demo messaging",
          )}
        </summary>
        <p>
          {t(
            "Демо-профиль не заменяет настоящий вход. Для переписки двух людей используйте разные профили браузера или приватное окно: обычные окна делят одну сессию. Обновления приходят каждые 3 секунды, пока вкладка видима.",
            "Демо-профиль нақты жүйеге кіруді алмастырмайды. Екі адам хат алмасу үшін браузердің бөлек профильдерін немесе жеке терезені пайдаланыңыз: кәдімгі терезелер бір сессияны бөліседі. Қойынды көрініп тұрғанда жаңартулар әр 3 секунд сайын келеді.",
            "A demo profile is not real authentication. To chat as two people, use separate browser profiles or a private window: regular windows share one session. Updates arrive every 3 seconds while the tab is visible.",
          )}
        </p>
      </details>
    </>
  );
}
