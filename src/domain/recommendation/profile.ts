import {
  GRADES,
  type DevelopmentEvent,
  type EffectiveEmployeeProfile,
  type GapAnalysis,
  type NormalizedDataset,
  type ProficiencyLevel,
  type SkillGap,
  type SkillReplayEvidence,
  type TargetResolution,
  roleProfileKey,
} from "@/lib/contracts";

function toLevel(value: number): ProficiencyLevel {
  return Math.max(0, Math.min(5, Math.round(value))) as ProficiencyLevel;
}

export function applyEventEffects(
  skills: Record<string, ProficiencyLevel>,
  event: DevelopmentEvent,
): { skills: Record<string, ProficiencyLevel>; changes: Record<string, number> } {
  const next = { ...skills };
  const changes: Record<string, number> = {};
  event.developsSkills.forEach((effect) => {
    const before = next[effect.skillId] ?? 0;
    const after = toLevel(Math.min(before + effect.gain, effect.maxLevel, 5));
    if (after > before) {
      next[effect.skillId] = after;
      changes[effect.skillId] = after - before;
    }
  });
  return { skills: next, changes };
}

export function buildEffectiveEmployeeProfile(
  dataset: NormalizedDataset,
  employeeId: string,
): EffectiveEmployeeProfile {
  const employee = dataset.employeesById[employeeId];
  if (!employee) throw new Error(`Unknown employee: ${employeeId}`);

  let effectiveSkills = { ...employee.skills };
  const replayEvidence: SkillReplayEvidence[] = [];
  const records = (dataset.historyByEmployeeId[employeeId] ?? [])
    .filter((record) => record.status === "completed" && record.date > employee.lastReviewDate)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  records.forEach((record) => {
    const event = dataset.eventsById[record.eventId];
    if (!event) return;
    event.developsSkills.forEach((effect) => {
      const before = effectiveSkills[effect.skillId] ?? 0;
      const after = toLevel(Math.min(before + effect.gain, effect.maxLevel, 5));
      if (after <= before) return;
      effectiveSkills[effect.skillId] = after;
      replayEvidence.push({
        historyRecordId: record.id,
        eventId: event.id,
        skillId: effect.skillId,
        date: record.date,
        before,
        gain: after - before,
        after,
        maxLevel: effect.maxLevel,
      });
    });
  });

  return { employee, effectiveSkills, replayEvidence };
}

export function resolveTarget(
  dataset: NormalizedDataset,
  effectiveProfile: EffectiveEmployeeProfile,
): TargetResolution | null {
  const { employee } = effectiveProfile;
  if (employee.careerGoal) {
    const profile = dataset.roleProfilesByKey[
      roleProfileKey(employee.careerGoal.targetRole, employee.careerGoal.targetGrade)
    ];
    if (!profile) throw new Error(`Missing role profile for career goal of ${employee.id}`);
    return {
      role: employee.careerGoal.targetRole,
      grade: employee.careerGoal.targetGrade,
      source: "career_goal",
      profile,
    };
  }

  const currentIndex = GRADES.indexOf(employee.grade);
  const nextGrade = GRADES[currentIndex + 1];
  if (!nextGrade) return null;
  const profile = dataset.roleProfilesByKey[roleProfileKey(employee.role, nextGrade)];
  if (!profile) throw new Error(`Missing next-grade profile for ${employee.role} ${nextGrade}`);
  return { role: employee.role, grade: nextGrade, source: "next_grade", profile };
}

export function analyzeGaps(
  effectiveProfile: EffectiveEmployeeProfile,
  target: TargetResolution | null,
): GapAnalysis {
  if (!target) {
    return {
      target: null,
      gaps: [],
      readiness: 0,
      promotionEligible: false,
      weightedRemainingGap: 0,
      weightedRequirements: 0,
    };
  }

  const critical = new Set(target.profile.criticalSkills);
  let weightedRemainingGap = 0;
  let weightedRequirements = 0;
  const gaps: SkillGap[] = Object.entries(target.profile.requiredSkills)
    .map(([skillId, requiredLevel]) => {
      const currentLevel = effectiveProfile.effectiveSkills[skillId] ?? 0;
      const gap = Math.max(0, requiredLevel - currentLevel);
      const isCritical = critical.has(skillId);
      const weight = isCritical ? 2 : 1;
      weightedRequirements += requiredLevel * weight;
      weightedRemainingGap += gap * weight;
      return {
        skillId,
        currentLevel,
        requiredLevel,
        gap,
        critical: isCritical,
        weight,
      };
    })
    .sort((a, b) => Number(b.critical) - Number(a.critical) || b.gap - a.gap || a.skillId.localeCompare(b.skillId));

  const readiness = weightedRequirements
    ? Math.max(0, Math.min(1, 1 - weightedRemainingGap / weightedRequirements))
    : 1;
  return {
    target,
    gaps,
    readiness,
    promotionEligible: gaps.every((gap) => gap.gap === 0),
    weightedRemainingGap,
    weightedRequirements,
  };
}
