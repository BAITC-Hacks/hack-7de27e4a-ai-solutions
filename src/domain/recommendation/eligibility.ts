import type {
  DevelopmentEvent,
  EffectiveEmployeeProfile,
  EligibilityResult,
  GapAnalysis,
  IneligibilityReason,
  NormalizedDataset,
} from "@/lib/contracts";

const RECURRING_EVENT_IDS = new Set(["EV_036"]);

export function evaluateEligibility(
  dataset: NormalizedDataset,
  profile: EffectiveEmployeeProfile,
  gapAnalysis: GapAnalysis,
  event: DevelopmentEvent,
): EligibilityResult {
  const reasons: IneligibilityReason[] = [];
  const target = gapAnalysis.target;
  if (!target) return { eligible: false, reasons: ["NO_TARGET_GAP_IMPACT"], effectiveGains: {} };

  if (event.mandatory) reasons.push("MANDATORY_EVENT");
  if (!event.targetRoles.includes(profile.employee.role) && !event.targetRoles.includes(target.role)) {
    reasons.push("ROLE_MISMATCH");
  }
  if (!event.targetGrades.includes(profile.employee.grade) && !event.targetGrades.includes(target.grade)) {
    reasons.push("GRADE_MISMATCH");
  }

  const prerequisitesMet = Object.entries(event.prerequisites).every(
    ([skillId, required]) => (profile.effectiveSkills[skillId] ?? 0) >= required,
  );
  if (!prerequisitesMet) reasons.push("PREREQUISITES_NOT_MET");

  const eventHistory = (dataset.historyByEmployeeId[profile.employee.id] ?? []).filter(
    (record) => record.eventId === event.id,
  );
  if (eventHistory.some((record) => record.status === "completed") && !RECURRING_EVENT_IDS.has(event.id)) {
    reasons.push("ALREADY_COMPLETED");
  }
  if (eventHistory.some((record) => record.status === "in_progress")) {
    reasons.push("ALREADY_IN_PROGRESS");
  }

  if (
    event.format !== "self_paced" &&
    !event.upcomingSessions.some((sessionDate) => sessionDate >= dataset.meta.asOfDate)
  ) {
    reasons.push("NO_UPCOMING_SESSION");
  }

  const gapsBySkill = Object.fromEntries(gapAnalysis.gaps.map((gap) => [gap.skillId, gap]));
  const effectiveGains: Record<string, number> = {};
  event.developsSkills.forEach((effect) => {
    const gap = gapsBySkill[effect.skillId];
    if (!gap || gap.gap <= 0) return;
    const current = profile.effectiveSkills[effect.skillId] ?? 0;
    const rawGain = Math.max(0, Math.min(current + effect.gain, effect.maxLevel, 5) - current);
    const usefulGain = Math.min(rawGain, gap.gap);
    if (usefulGain > 0) effectiveGains[effect.skillId] = usefulGain;
  });
  if (!Object.keys(effectiveGains).length) reasons.push("NO_TARGET_GAP_IMPACT");

  return { eligible: reasons.length === 0, reasons, effectiveGains };
}
