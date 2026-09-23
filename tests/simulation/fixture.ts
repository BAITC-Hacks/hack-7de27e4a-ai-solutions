/** Synthetic, deliberately small contract fixture. NOT the organizer dataset or an A implementation. */
import type {
  Activity,
  Dataset,
  EmployeeView,
  IntelligenceAdapter,
  Recommendation,
} from "../../src/state/intelligenceAdapter";
export function fixtureDataset(): Dataset {
  const event = (
    id: string,
    title: string,
    skillId: string,
    gain = 1,
    maxLevel = 5,
  ): Activity => ({
    id,
    title,
    type: "mentorship",
    format: "self_paced",
    durationHours: 4,
    mandatory: false,
    recurring: false,
    gains: [{ skillId, gain, maxLevel }],
    upcomingSessions: [],
  });
  return {
    id: "synthetic-integration-fixture",
    snapshotDate: "2026-10-01",
    employees: [
      {
        id: "E0028",
        name: "Манахнбет · демо",
        role: "Backend Engineer",
        grade: "Middle",
        preferredLanguage: "kk",
        workFormat: "hybrid",
        lastReviewDate: "2026-06-24",
        skills: { SK_SYSTEM_DESIGN: 2, SK_API_DESIGN: 4, SK_CLOUD: 1 },
      },
      {
        id: "NO_HISTORY",
        name: "Профиль без истории",
        role: "Backend Engineer",
        grade: "Middle",
        preferredLanguage: "ru",
        workFormat: "remote",
        lastReviewDate: "2026-06-24",
        skills: { SK_SYSTEM_DESIGN: 2, SK_API_DESIGN: 3 },
      },
      {
        id: "NO_TARGET",
        name: "Lead без цели",
        role: "Backend Engineer",
        grade: "Lead",
        preferredLanguage: "en",
        workFormat: "office",
        lastReviewDate: "2026-06-24",
        skills: { SK_SYSTEM_DESIGN: 5, SK_API_DESIGN: 5 },
      },
    ],
    skills: [
      { id: "SK_SYSTEM_DESIGN", name: "System Design" },
      { id: "SK_API_DESIGN", name: "API Design" },
      { id: "SK_CLOUD", name: "Cloud Architecture" },
    ],
    activities: [
      event("EV_006", "Designing High-Load Systems", "SK_SYSTEM_DESIGN", 1, 4),
      event("MENTOR", "Architecture Mentorship", "SK_SYSTEM_DESIGN", 1, 4),
      event("API", "API Design Workshop", "SK_API_DESIGN", 1, 4),
      {
        ...event("CLOUD", "Cloud Architecture Lab", "SK_CLOUD", 1, 4),
        format: "online",
        upcomingSessions: ["2026-09-01", "2026-10-12", "2026-10-04"],
      },
      {
        ...event(
          "EV_036",
          "Public Speaking Club · recurring fixture",
          "SK_CLOUD",
          0.5,
          4,
        ),
        recurring: true,
        durationHours: 1,
      },
      event("ACTIVE", "Backend Learning Journey", "SK_API_DESIGN"),
      {
        ...event("MANDATORY", "Mandatory Compliance", "SK_SYSTEM_DESIGN"),
        mandatory: true,
      },
    ],
    history: [
      {
        employeeId: "E0028",
        activityId: "EV_006",
        status: "completed",
        date: "2026-09-08",
      },
      {
        employeeId: "E0028",
        activityId: "ACTIVE",
        status: "in_progress",
        completionPct: 45,
        date: "2026-09-25",
      },
    ],
  };
}
/** This test double only makes state transitions observable; production imports the real adapter. */
export function fixtureAdapter(): IntelligenceAdapter {
  return {
    async importFiles(files) {
      try {
        const employees = JSON.parse(files["employees.json"]);
        const events = JSON.parse(files["events.json"]);
        const skills = JSON.parse(files["skills.json"]);
        if (
          !Array.isArray(employees.employees) ||
          !Array.isArray(events.activities) ||
          !Array.isArray(skills.skills)
        )
          throw new Error("Используйте синтетический набор стенда");
        return {
          ok: true,
          dataset: {
            ...fixtureDataset(),
            employees: employees.employees,
            activities: events.activities,
            skills: skills.skills,
          },
          issues: [],
        };
      } catch (error) {
        return {
          ok: false,
          issues: [
            {
              file: "employees.json",
              path: "employees",
              severity: "error",
              message:
                error instanceof Error ? error.message : "Invalid fixture",
            },
          ],
        };
      }
    },
    evaluate({ dataset, employeeId, ledger, overlay }) {
      const employee = dataset.employees.find((e) => e.id === employeeId);
      if (!employee) throw new Error("Employee missing");
      const history = dataset.history.filter(
        (h) => h.employeeId === employeeId,
      );
      const replayed = history.some(
        (h) => h.activityId === "EV_006" && h.status === "completed",
      );
      const committed = ledger.filter((e) => e.employeeId === employeeId);
      const skills = overlay?.skills ??
        committed.at(-1)?.after ?? {
          ...employee.skills,
          ...(replayed ? { SK_SYSTEM_DESIGN: 3 } : {}),
        };
      const completed = [
        ...new Set([
          ...history
            .filter((h) => h.status === "completed")
            .map((h) => h.activityId),
          ...committed.map((e) => e.activityId),
          ...(overlay?.completedActivityIds ?? []),
        ]),
      ];
      const active = history
        .filter((h) => h.status === "in_progress")
        .map((h) => h.activityId);
      const target =
        employee.grade === "Lead"
          ? null
          : { role: "Backend Engineer", grade: "Senior" };
      const readiness = (levels: Readonly<Record<string, number>>) =>
        Math.min(
          1,
          ((levels.SK_SYSTEM_DESIGN ?? 0) * 2 +
            (levels.SK_API_DESIGN ?? 0) +
            (levels.SK_CLOUD ?? 0)) /
            16,
        );
      const recs: Recommendation[] = target
        ? dataset.activities
            .filter(
              (a) =>
                !a.mandatory &&
                !active.includes(a.id) &&
                (a.recurring || !completed.includes(a.id)) &&
                a.gains.some((g) => (skills[g.skillId] ?? 0) < g.maxLevel),
            )
            .map((a, i) => {
              const after = { ...skills },
                expectedGains: Record<string, number> = {};
              for (const g of a.gains) {
                expectedGains[g.skillId] = Math.max(
                  0,
                  Math.min((skills[g.skillId] ?? 0) + g.gain, g.maxLevel, 5) -
                    (skills[g.skillId] ?? 0),
                );
                after[g.skillId] =
                  (skills[g.skillId] ?? 0) + expectedGains[g.skillId];
              }
              return {
                activityId: a.id,
                rank: i + 1,
                totalScore:
                  a.id === "MENTOR" ? 0.92 : a.id === "API" ? 0.84 : 0.65,
                projectedReadiness: readiness(after),
                factorScores: {
                  "Цель и разрыв": 0.9,
                  "История участия": 0.7,
                  Доступность: 1,
                },
                evidence: [
                  {
                    id: `${a.id}-gap`,
                    label: "Критичный навык",
                    value: `System Design: ${skills.SK_SYSTEM_DESIGN ?? 0}/4`,
                  },
                  {
                    id: `${a.id}-history`,
                    label: "История",
                    value: "EV_006 уже учтён и не предлагается повторно",
                  },
                  {
                    id: `${a.id}-availability`,
                    label: "Доступность",
                    value: "Тестовый кандидат доступен",
                  },
                ],
                expectedGains,
                deterministicExplanation:
                  a.id === "MENTOR"
                    ? "Синтетический пример: System Design нужен для Senior, прежний курс уже завершён, менторство доступно в своём темпе."
                    : "Синтетический пример: активность развивает навыки, учитывает цель и доступность формата.",
              };
            })
            .sort(
              (a, b) =>
                b.totalScore - a.totalScore ||
                a.activityId.localeCompare(b.activityId),
            )
            .map((r, i) => ({ ...r, rank: i + 1 }))
        : [];
      const view: EmployeeView = {
        employeeId,
        target,
        effectiveSkills: { ...skills },
        readiness: target ? readiness(skills) : null,
        gaps: target
          ? ["SK_SYSTEM_DESIGN", "SK_API_DESIGN", "SK_CLOUD"].map((id) => ({
              skillId: id,
              current: skills[id] ?? 0,
              required: 4,
              critical: id !== "SK_CLOUD",
            }))
          : [],
        recommendations: recs.slice(0, 3),
        candidates: recs,
        completedActivityIds: completed,
        activeActivityIds: active,
        replayedActivityIds: replayed ? ["EV_006"] : [],
        baseline: {
          activityId: "CLOUD",
          explanation:
            "Упрощённый baseline выбирает Cloud (1/5), тогда как критичному System Design остаётся один уровень до цели.",
        },
        excluded: replayed
          ? [
              {
                activityId: "EV_006",
                title: "Designing High-Load Systems",
                reasons: [
                  "Активность уже завершена 8 сентября 2026 года",
                  "Прирост System Design 2 → 3 уже учтён после последней оценки",
                ],
              },
            ]
          : [],
        explanationStatus: "deterministic",
        engineVersion: "synthetic-fixture/not-production",
      };
      return view;
    },
  };
}
