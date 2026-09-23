"use client";

import { useMemo } from "react";

import {
  buildEmployeeExternalLearningPlan,
  loadExternalCourseCatalog,
} from "@/domain/external";
import type { NormalizedDataset } from "@/lib/contracts";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { catalogName } from "@/lib/i18n/domain";

import styles from "./external-learning-section.module.css";

const VISIBLE_SKILL_LIMIT = 3;

export interface EmployeeExternalLearningSectionProps {
  dataset: NormalizedDataset;
  employeeId: string;
}

export function EmployeeExternalLearningSection({
  dataset,
  employeeId,
}: EmployeeExternalLearningSectionProps) {
  const { locale, number, t } = useI18n();
  const plan = useMemo(() => {
    try {
      return buildEmployeeExternalLearningPlan(
        dataset,
        loadExternalCourseCatalog(dataset),
        employeeId,
      );
    } catch {
      // Imported datasets may use another skill taxonomy. The optional external layer
      // must never take down the internal recommendation experience.
      return null;
    }
  }, [dataset, employeeId]);

  if (!plan?.groups.length) return null;

  const preferredLanguageLabel = {
    ru: t("Русский", "Орыс тілі", "Russian"),
    kk: t("Казахский", "Қазақ тілі", "Kazakh"),
    en: t("Английский", "Ағылшын тілі", "English"),
  }[plan.preferredLanguage];
  const visibleGroups = plan.groups.slice(0, VISIBLE_SKILL_LIMIT);
  const hiddenGroupCount = plan.groups.length - visibleGroups.length;

  return (
    <section
      className={styles.panel}
      aria-labelledby="employee-external-learning-title"
    >
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>
            {t("Внешнее обучение", "Сыртқы оқу", "External learning")}
          </span>
          <h2 id="employee-external-learning-title">
            {t(
              "Внутри компании пока нет подходящего шага",
              "Компания ішінде әзірге сәйкес қадам жоқ",
              "There is no suitable internal step yet",
            )}
          </h2>
          <p>
            {t(
              "Курсы на предпочитаемом языке {language} идут первыми; остальные варианты явно помечены.",
              "{language} тіліндегі курстар алдымен көрсетіледі; басқа нұсқалар анық белгіленген.",
              "Courses in the preferred language {language} come first; alternatives are clearly labelled.",
              { language: preferredLanguageLabel },
            )}
          </p>
        </div>
        <span className={styles.layerBadge}>
          {t("Отдельный слой", "Бөлек қабат", "Separate layer")}
        </span>
      </div>

      <div className={styles.trustNote}>
        <span aria-hidden="true">i</span>
        <p>
          <strong>
            {t(
              "Не влияет на расчёт.",
              "Есептеуге әсер етпейді.",
              "Does not affect the calculation.",
            )}
          </strong>{" "}
          {t(
            "Внешние курсы не участвуют в top-3, score или readiness; их эффект не подтверждён данными компании.",
            "Сыртқы курстар top-3, score немесе readiness есебіне кірмейді; олардың әсері компания деректерімен расталмаған.",
            "External courses do not enter the top-3, score or readiness; their effect is not confirmed by company data.",
          )}
        </p>
      </div>

      <div className={styles.groups}>
        {visibleGroups.map((group) => (
          <section className={styles.group} key={group.gap.skillId}>
            <div className={styles.groupHeading}>
              <div>
                <span>
                  {t(
                    "Навык без внутреннего покрытия",
                    "Ішкі бағдарламамен қамтылмаған дағды",
                    "Skill without internal coverage",
                  )}
                </span>
                <h3>{catalogName(group.gap.skillId, locale)}</h3>
              </div>
              {group.gap.critical ? (
                <span className={styles.criticalBadge}>
                  {t("Критичный разрыв", "Маңызды алшақтық", "Critical gap")}
                </span>
              ) : null}
            </div>

            <div className={styles.courseGrid}>
              {group.courses.map(({ course, languageMatch, levelFit }) => (
                <article className={styles.course} key={course.id}>
                  <div className={styles.courseMeta}>
                    <span>{course.provider}</span>
                    <div className={styles.fitSignals}>
                      {languageMatch ? (
                        <span>
                          {t(
                            "Предпочитаемый язык",
                            "Қалаулы тіл",
                            "Preferred language",
                          )}
                        </span>
                      ) : null}
                      {levelFit ? (
                        <span>
                          {t("Подходит уровню", "Деңгейге сай", "Level fit")}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <h4>{course.title}</h4>
                  <div className={styles.tags}>
                    <span>
                      {number(course.durationHours)} {t("ч", "сағ", "h")}
                    </span>
                    <span>
                      {course.free
                        ? t("Бесплатно", "Тегін", "Free")
                        : t("Платно", "Ақылы", "Paid")}
                    </span>
                    <span>
                      {course.languages
                        .map((language) => language.toUpperCase())
                        .join(" · ")}
                    </span>
                  </div>
                  <p className={styles.disclaimer}>
                    {t(
                      "Внешний источник · эффект не подтверждён данными компании",
                      "Сыртқы дереккөз · әсері компания деректерімен расталмаған",
                      "External source · effect not confirmed by company data",
                    )}
                  </p>
                  <a
                    className={styles.courseLink}
                    href={course.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t(
                      "Открыть внешний курс «{title}»",
                      "«{title}» сыртқы курсын ашу",
                      "Open external course “{title}”",
                      { title: course.title },
                    )}
                  >
                    {t("Открыть курс", "Курсты ашу", "Open course")}
                    <span aria-hidden="true">↗</span>
                  </a>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      {hiddenGroupCount > 0 ? (
        <p className={styles.moreNote}>
          {t(
            "Ещё направлений без внутреннего покрытия: {count}.",
            "Ішкі қамтуы жоқ тағы бағыттар: {count}.",
            "More directions without internal coverage: {count}.",
            { count: number(hiddenGroupCount) },
          )}
        </p>
      ) : null}
    </section>
  );
}
