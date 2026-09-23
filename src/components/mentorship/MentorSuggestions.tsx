"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { useIdentity } from "@/components/identity/IdentityProvider";
import { searchMentors, type MentorSearchResult } from "@/domain/mentorship";
import type { NormalizedDataset } from "@/lib/contracts";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { catalogName } from "@/lib/i18n/domain";
import styles from "./mentor-suggestions.module.css";

export interface MentorSuggestionsProps {
  skillId: string;
  employeeId: string;
  /** Uploaded canonical data stays local and is never sent to the messaging server. */
  dataset?: NormalizedDataset;
}

type SearchState = {
  key: string;
  status: "loading" | "ready" | "error" | "identity";
  result?: MentorSearchResult;
};

export function MentorSuggestions({
  skillId,
  employeeId,
  dataset,
}: MentorSuggestionsProps) {
  const { locale, t, number } = useI18n();
  const {
    session,
    workspaceSource,
    openPicker,
    refresh,
    loading: identityLoading,
  } = useIdentity();
  const headingId = useId();
  const imported = workspaceSource === "import";
  const canRequest =
    !imported && !identityLoading && session?.employeeId === employeeId;
  const key = JSON.stringify([
    workspaceSource,
    employeeId,
    skillId,
    session?.employeeId,
  ]);
  const [remote, setRemote] = useState<SearchState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const local = useMemo<{
    status: "ready" | "error";
    result?: MentorSearchResult;
  } | null>(() => {
    if (!imported || !dataset) return null;
    try {
      return {
        status: "ready" as const,
        result: searchMentors(dataset, { employeeId, skillId, limit: 3 }),
      };
    } catch {
      return { status: "error" as const };
    }
  }, [imported, dataset, employeeId, skillId]);

  useEffect(() => {
    if (!canRequest) return;
    const controller = new AbortController();
    setRemote({ key, status: "loading" });
    const params = new URLSearchParams({ skillId, limit: "3" });
    void fetch(`/api/mentorship/search?${params}`, {
      signal: controller.signal,
      cache: "no-store",
      credentials: "same-origin",
      headers: { "X-Career-Identity": employeeId },
    })
      .then(async (response) => {
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 409) {
          setRemote({ key, status: "identity" });
          void refresh();
          return;
        }
        if (!response.ok) throw new Error("SEARCH_UNAVAILABLE");
        const result = (await response.json()) as MentorSearchResult;
        if (result.skillId !== skillId || !Array.isArray(result.mentors))
          throw new Error("INVALID_RESULT");
        if (!controller.signal.aborted)
          setRemote({ key, status: "ready", result });
      })
      .catch(() => {
        if (!controller.signal.aborted) setRemote({ key, status: "error" });
      });
    return () => controller.abort();
  }, [canRequest, employeeId, skillId, key, attempt, refresh]);

  // A changed identity/profile never renders the previous request's candidates.
  const current = imported
    ? local
    : canRequest && remote?.key === key
      ? remote
      : null;
  const result = current?.result;
  const loading =
    !imported &&
    (identityLoading ||
      (canRequest && (!current || current.status === "loading")));
  const needsIdentity =
    !imported && !loading && (!canRequest || current?.status === "identity");
  const chatHref = `/chat?${new URLSearchParams({ skill: skillId })}`;
  const skillName = catalogName(
    dataset?.skillsById[skillId]?.name ?? skillId,
    locale,
  );

  return (
    <section
      className={styles.panel}
      aria-labelledby={headingId}
      aria-busy={loading}
    >
      <div className={styles.heading}>
        <div>
          <h2 id={headingId}>
            {t(
              "Учиться у коллег",
              "Әріптестерден үйрену",
              "Learn from colleagues",
            )}
          </h2>
          <p className={styles.skill}>{skillName}</p>
        </div>
        {canRequest && (
          <Link className={styles.allLink} href={chatHref}>
            {t("Все коллеги", "Барлық әріптестер", "All colleagues")}{" "}
            <span aria-hidden="true">↗</span>
          </Link>
        )}
      </div>

      {loading && (
        <p className={styles.status} role="status">
          {t(
            "Ищем подходящих коллег…",
            "Лайықты әріптестерді іздеуде…",
            "Finding suitable colleagues…",
          )}
        </p>
      )}
      {needsIdentity && (
        <div className={styles.notice}>
          <p>
            {t(
              "Выберите свой профиль демо-компании, чтобы найти коллег.",
              "Әріптестерді табу үшін демо-компаниядағы өз профиліңізді таңдаңыз.",
              "Choose your demo-company profile to find colleagues.",
            )}
          </p>
          <button
            type="button"
            className={styles.button}
            onClick={() => openPicker("employee")}
          >
            {t("Выбрать профиль", "Профильді таңдау", "Choose a profile")}
          </button>
        </div>
      )}
      {current?.status === "error" && (
        <div className={styles.notice}>
          <p role="alert">
            {t(
              "Не удалось найти коллег для этого навыка.",
              "Бұл дағды бойынша әріптестерді табу мүмкін болмады.",
              "Could not find colleagues for this skill.",
            )}
          </p>
          {!imported && (
            <button
              type="button"
              className={styles.button}
              onClick={() => setAttempt((value) => value + 1)}
            >
              {t("Повторить", "Қайталау", "Retry")}
            </button>
          )}
        </div>
      )}
      {result && result.mentors.length === 0 && (
        <p className={styles.status} role="status">
          {t(
            "Пока нет коллег с нужным уровнем этого навыка.",
            "Әзірге бұл дағдының қажетті деңгейіне ие әріптес жоқ.",
            "No colleagues currently meet the required skill level.",
          )}
        </p>
      )}

      {!!result?.mentors.length && (
        <ul className={styles.cards}>
          {result.mentors.slice(0, 3).map((mentor) => (
            <li className={styles.card} key={mentor.employeeId}>
              <div className={styles.person}>
                <span className={styles.avatar} aria-hidden="true">
                  {mentor.fullName
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")}
                </span>
                <div>
                  <h3>{mentor.fullName}</h3>
                  <p>
                    {catalogName(mentor.role, locale)} ·{" "}
                    {catalogName(mentor.grade, locale)}
                  </p>
                </div>
              </div>
              <div className={styles.meta}>
                <span>
                  {t("Уровень", "Деңгей", "Level")}{" "}
                  <strong>
                    {number(mentor.skillLevel)}/{number(5)}
                  </strong>
                </span>
                <span
                  className={
                    mentor.available ? styles.available : styles.unavailable
                  }
                >
                  {mentor.available
                    ? t("Доступен", "Қолжетімді", "Available")
                    : t("Недоступен", "Қолжетімсіз", "Unavailable")}
                </span>
              </div>
              {!imported && mentor.available && (
                <Link
                  className={styles.cardLink}
                  href={`/chat?${new URLSearchParams({ skill: skillId, mentor: mentor.employeeId })}`}
                  aria-label={t(
                    "Попросить о помощи: {name}",
                    "Көмек сұрау: {name}",
                    "Ask {name} for help",
                    { name: mentor.fullName },
                  )}
                >
                  {t("Попросить о помощи", "Көмек сұрау", "Ask for help")}{" "}
                  <span aria-hidden="true">↗</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      {imported && (
        <div className={styles.importNote}>
          <p>
            {t(
              "Переписка доступна в демо компании.",
              "Хат алмасу компанияның демосында қолжетімді.",
              "Messaging is available in the company demo.",
            )}
          </p>
          <button
            type="button"
            className={styles.button}
            onClick={() => openPicker("employee")}
          >
            {t(
              "Выбрать демо-профиль",
              "Демо-профильді таңдау",
              "Choose a demo profile",
            )}
          </button>
        </div>
      )}
    </section>
  );
}
