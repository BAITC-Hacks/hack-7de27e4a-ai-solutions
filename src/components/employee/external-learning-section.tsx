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
      <details className={styles.disclosure}>
        <summary>
          <h2 id="employee-external-learning-title">
            {t("Внешние курсы", "Сыртқы курстар", "External courses")}
          </h2>
          <span className={styles.disclosureCount}>
            {number(plan.groups.length)}
          </span>
        </summary>
        <div className={styles.content}>
          <div className={styles.heading}>
            <div>
              <h3>
                {t(
                  "Курсы для навыков без внутреннего обучения",
                  "Ішкі оқытуы жоқ дағдыларға арналған курстар",
                  "Courses for skills without internal training",
                )}
              </h3>
              <p>
                {t(
                  "Учитываем ваш уровень и предпочитаемый язык: {language}.",
                  "Деңгейіңіз бен қалаған тіліңізді ескереміз: {language}.",
                  "We consider your level and preferred language: {language}.",
                  { language: preferredLanguageLabel },
                )}
              </p>
            </div>
            <span className={styles.layerBadge}>
              {t("Внешние курсы", "Сыртқы курстар", "External courses")}
            </span>
          </div>

          <div className={styles.trustNote}>
            <span aria-hidden="true">i</span>
            <p>
              {t(
                "Прогресс по внешним курсам не меняет карьерную готовность: их результат пока не подтверждён.",
                "Сыртқы курстардағы ілгерілеу мансаптық дайындықты өзгертпейді: олардың нәтижесі әлі расталмаған.",
                "External course progress does not change career readiness: the results have not yet been verified.",
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
                    <h4>{catalogName(group.gap.skillId, locale)}</h4>
                  </div>
                  {group.gap.critical ? (
                    <span className={styles.criticalBadge}>
                      {t(
                        "Критичный разрыв",
                        "Маңызды алшақтық",
                        "Critical gap",
                      )}
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
                              {t(
                                "Подходит уровню",
                                "Деңгейге сай",
                                "Level fit",
                              )}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <h5>{course.title}</h5>
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
        </div>
      </details>
    </section>
  );
}
