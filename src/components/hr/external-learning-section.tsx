"use client";

import type { HrExternalLearningPlan } from "@/domain/external";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { localeNames } from "@/lib/i18n/core";
import { catalogName } from "@/lib/i18n/domain";

import styles from "./external-learning-section.module.css";

export interface HrExternalLearningSectionProps {
  plan: HrExternalLearningPlan;
}

/** Presentation only: the bridge supplies an aggregate plan without raw employee data. */
export function HrExternalLearningSection({
  plan,
}: HrExternalLearningSectionProps) {
  const { locale, t, number } = useI18n();

  if (!plan.directions.length) return null;

  return (
    <section
      className={styles.panel}
      aria-labelledby="hr-external-learning-title"
    >
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>
            {t("Внешнее обучение", "Сыртқы оқу", "External learning")}
          </p>
          <h3 id="hr-external-learning-title">
            {t(
              "Чем закрыть пробелы вне каталога",
              "Каталогтан тыс олқылықтарды қалай жабуға болады",
              "Options beyond the internal catalog",
            )}
          </h3>
          <p>
            {t(
              "Курируемые варианты для разрывов, которые сейчас не покрывает ни одна доступная внутренняя активность.",
              "Қазір қолжетімді ішкі іс-шаралардың ешқайсысы жаппайтын алшақтықтарға арналған тексерілген нұсқалар.",
              "Curated options for gaps that no currently available internal activity covers.",
            )}
          </p>
        </div>
        <div
          className={styles.summary}
          aria-label={t(
            "Охват внешнего каталога по всей организации",
            "Ұйым бойынша сыртқы каталогтың қамтуы",
            "Organization-wide external catalog coverage",
          )}
        >
          <span>
            <strong>{number(plan.employeesWithUncoveredGaps)}</strong>
            {t(
              " профилей с непокрытым разрывом",
              " профильде жабылмаған алшақтық бар",
              " profiles with an uncovered gap",
            )}
          </span>
          <span>
            <strong>{number(plan.employeesWithCriticalHardSkillGaps)}</strong>
            {t(
              " с критичным профессиональным разрывом",
              " профильде маңызды кәсіби алшақтық бар",
              " with a critical hard-skill gap",
            )}
          </span>
        </div>
      </div>

      <p className={styles.scopeNote}>
        {t(
          "Агрегат по всей организации; персональные рейтинги не используются.",
          "Бүкіл ұйым бойынша жиынтық; қызметкерлердің жеке рейтингі қолданылмайды.",
          "Organization-wide aggregate; no individual employee ranking is used.",
        )}
      </p>

      <div className={styles.trustNote}>
        {t(
          "Внешние курсы не участвуют в ранжировании рекомендаций и не меняют готовность. Числа ниже показывают потенциальную аудиторию по языку и подходящему уровню, а не прогноз прироста навыка.",
          "Сыртқы курстар ұсынымдарды ранжирлеуге қатыспайды және дайындықты өзгертпейді. Төмендегі сандар дағды өсімінің болжамын емес, тіл мен сәйкес деңгей бойынша ықтимал аудиторияны көрсетеді.",
          "External courses do not affect recommendation ranking or readiness. The figures below show potential audience by language and level fit, not predicted skill growth.",
        )}
      </div>

      <div className={styles.directionList}>
        {plan.directions.map((direction) => (
          <article className={styles.direction} key={direction.skillId}>
            <div className={styles.directionHead}>
              <div>
                <span>
                  {direction.skillType === "hard"
                    ? t(
                        "Профессиональный навык",
                        "Кәсіби дағды",
                        "Hard skill",
                      )
                    : t("Гибкий навык", "Икемді дағды", "Soft skill")}
                </span>
                <h4>{catalogName(direction.skillId, locale)}</h4>
              </div>
              <div className={styles.reach}>
                <strong>{number(direction.affectedEmployees)}</strong>
                <span>
                  {t(
                    "сотрудников без внутреннего шага",
                    "қызметкерде ішкі қадам жоқ",
                    "employees without an internal step",
                  )}
                </span>
                {direction.criticalAffectedEmployees ? (
                  <small>
                    {t(
                      "Критичных: {count}",
                      "Маңыздысы: {count}",
                      "Critical: {count}",
                      {
                        count: number(direction.criticalAffectedEmployees),
                      },
                    )}
                  </small>
                ) : null}
              </div>
            </div>

            <div className={styles.courseList}>
              {direction.courses.map(
                ({ course, levelFitAudience, potentialAudience }) => (
                  <a
                    className={styles.course}
                    href={course.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    key={course.id}
                    aria-label={t(
                      "Открыть внешний курс «{course}»",
                      "«{course}» сыртқы курсын ашу",
                      "Open external course “{course}”",
                      { course: course.title },
                    )}
                  >
                    <div className={styles.courseCopy}>
                      <span>{course.provider}</span>
                      <strong>{course.title}</strong>
                      <small>
                        {t(
                          "Внешний источник · эффект не подтверждён данными компании",
                          "Сыртқы дереккөз · әсері компания деректерімен расталмаған",
                          "External source · impact is not validated by company data",
                        )}
                      </small>
                    </div>
                    <div className={styles.courseFacts}>
                      <span>
                        {t(
                          "{hours} ч · {price}",
                          "{hours} сағ · {price}",
                          "{hours} h · {price}",
                          {
                            hours: number(course.durationHours),
                            price: course.free
                              ? t("бесплатно", "тегін", "free")
                              : t("платно", "ақылы", "paid"),
                          },
                        )}
                      </span>
                      <span>
                        {course.languages
                          .map((language) => localeNames[language])
                          .join(" · ")}
                      </span>
                      <strong>
                        {t(
                          "{count} по языку и уровню",
                          "Тіл мен деңгей бойынша: {count}",
                          "{count} by language and level",
                          { count: number(levelFitAudience) },
                        )}
                      </strong>
                      {potentialAudience !== levelFitAudience ? (
                        <small>
                          {t(
                            "{count} по языку",
                            "Тіл бойынша: {count}",
                            "{count} by language",
                            { count: number(potentialAudience) },
                          )}
                        </small>
                      ) : null}
                    </div>
                    <span className={styles.openIcon} aria-hidden="true">
                      ↗
                    </span>
                  </a>
                ),
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
