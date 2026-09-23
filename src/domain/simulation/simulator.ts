import type {
  Activity,
  EmployeeView,
  EvaluationInput,
  IntelligenceAdapter,
  SkillLevels,
} from "../../state/intelligenceAdapter";

export function applyGains(skills: SkillLevels, activity: Activity) {
  const after: Record<string, number> = { ...skills };
  const delta: Record<string, number> = {};
  for (const value of Object.values(skills)) {
    if (!Number.isFinite(value) || value < 0 || value > 5)
      throw new Error("Некорректный уровень навыка (допустимо 0–5)");
  }
  const seen = new Set<string>();
  for (const item of activity.gains) {
    if (seen.has(item.skillId))
      throw new Error("Активность содержит повторяющийся навык");
    seen.add(item.skillId);
    if (
      !Number.isFinite(item.gain) ||
      item.gain < 0 ||
      !Number.isFinite(item.maxLevel) ||
      item.maxLevel < 0 ||
      item.maxLevel > 5
    )
      throw new Error("Некорректные gain/max_level");
    const current = skills[item.skillId] ?? 0;
    const gain = Math.max(
      0,
      Math.min(current + item.gain, item.maxLevel, 5) - current,
    );
    after[item.skillId] = current + gain;
    if (gain > 0) delta[item.skillId] = gain;
  }
  return { before: { ...skills }, delta, after };
}

export function assertEligible(view: EmployeeView, activity: Activity) {
  if (!view.target) throw new Error("Для сотрудника не задана карьерная цель");
  if (activity.mandatory)
    throw new Error("Обязательные мероприятия не входят в рекомендации");
  if (view.activeActivityIds.includes(activity.id))
    throw new Error("Активность уже выполняется");
  if (!activity.recurring && view.completedActivityIds.includes(activity.id))
    throw new Error("Активность уже завершена");
  if (
    !view.candidates.some((candidate) => candidate.activityId === activity.id)
  )
    throw new Error("Активность больше не доступна; обновите рекомендации");
}

export function simulateStep(
  adapter: IntelligenceAdapter,
  input: EvaluationInput,
  activityId: string,
) {
  const beforeView = adapter.evaluate(input);
  const activity = input.dataset.activities.find(
    (item) => item.id === activityId,
  );
  if (!activity) throw new Error("Активность не найдена");
  assertEligible(beforeView, activity);
  const transition = applyGains(beforeView.effectiveSkills, activity);
  if (Object.keys(transition.delta).length === 0)
    throw new Error("Активность не увеличивает навыки");
  const completedActivityIds = [
    ...new Set([...beforeView.completedActivityIds, activityId]),
  ];
  const overlay = {
    skills: transition.after,
    completedActivityIds,
    simulatedActivityIds: [
      ...(input.overlay?.simulatedActivityIds ?? []),
      activityId,
    ],
  };
  const afterView = adapter.evaluate({ ...input, overlay });
  return { activityId, ...transition, beforeView, afterView, overlay };
}
export type SimulationStep = ReturnType<typeof simulateStep>;

export function nearestSession(
  activity: Activity,
  snapshotDate: string,
): string | null {
  if (activity.format === "self_paced") return null;
  const start = Date.parse(snapshotDate);
  return (
    [...activity.upcomingSessions]
      .filter(
        (date) =>
          Number.isFinite(Date.parse(date)) && Date.parse(date) >= start,
      )
      .sort((a, b) => Date.parse(a) - Date.parse(b) || a.localeCompare(b))[0] ??
    null
  );
}
