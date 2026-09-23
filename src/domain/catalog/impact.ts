import {
  analyzeGaps,
  buildEffectiveEmployeeProfile,
  evaluateEligibility,
  resolveTarget,
} from "@/domain/recommendation";
import type { DevelopmentEvent, NormalizedDataset } from "@/lib/contracts";

export interface HrEventImpactPreview {
  eventId: string;
  eligibleEmployeeIds: string[];
  eligibleEmployeeCount: number;
  criticalAffectedEmployeeIds: string[];
  criticalAffectedEmployeeCount: number;
  newlyCoveredSkillIds: string[];
  criticalUncoveredEmployeeIdsBefore: string[];
  criticalUncoveredEmployeeIdsAfter: string[];
  criticalUncoveredEmployeesBefore: number;
  criticalUncoveredEmployeesAfter: number;
}

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
  const values = map.get(key) ?? new Set<string>();
  values.add(value);
  map.set(key, values);
}

/**
 * Runs the proposed event through the same gap and eligibility primitives as
 * recommendations. It is read-only, deterministic, and safe to call before a
 * draft is committed to the session catalog.
 */
export function previewHrEventImpact(
  dataset: NormalizedDataset,
  event: DevelopmentEvent,
): HrEventImpactPreview {
  const eligibleEmployeeIds = new Set<string>();
  const criticalAffectedEmployeeIds = new Set<string>();
  const criticalUncoveredBefore = new Set<string>();
  const criticalUncoveredAfter = new Set<string>();
  const unservedBySkillBefore = new Map<string, Set<string>>();
  const unservedBySkillAfter = new Map<string, Set<string>>();
  const catalogEvents = Object.values(dataset.eventsById);

  Object.keys(dataset.employeesById)
    .sort()
    .forEach((employeeId) => {
      const profile = buildEffectiveEmployeeProfile(dataset, employeeId);
      const gapAnalysis = analyzeGaps(profile, resolveTarget(dataset, profile));
      const proposedEligibility = evaluateEligibility(dataset, profile, gapAnalysis, event);

      if (proposedEligibility.eligible) {
        eligibleEmployeeIds.add(employeeId);
        if (
          gapAnalysis.gaps.some(
            (gap) =>
              gap.critical &&
              gap.gap > 0 &&
              (proposedEligibility.effectiveGains[gap.skillId] ?? 0) >= gap.gap,
          )
        ) {
          criticalAffectedEmployeeIds.add(employeeId);
        }
      }

      const existingBestGain = new Map<string, number>();
      catalogEvents.forEach((catalogEvent) => {
        const eligibility = evaluateEligibility(
          dataset,
          profile,
          gapAnalysis,
          catalogEvent,
        );
        if (!eligibility.eligible) return;
        Object.entries(eligibility.effectiveGains).forEach(([skillId, gain]) => {
          existingBestGain.set(
            skillId,
            Math.max(existingBestGain.get(skillId) ?? 0, gain),
          );
        });
      });

      gapAnalysis.gaps
        .filter((gap) => gap.gap > 0)
        .forEach((gap) => {
          const gainBefore = existingBestGain.get(gap.skillId) ?? 0;
          const proposedGain =
            proposedEligibility.eligible &&
            (proposedEligibility.effectiveGains[gap.skillId] ?? 0) > 0
              ? proposedEligibility.effectiveGains[gap.skillId] ?? 0
              : 0;
          // Catalog coverage means one currently eligible activity can close
          // the remaining gap. A partial gain is useful, but it must remain in
          // the HR "multiple steps" bucket instead of being reported as closed.
          const servedBefore = gainBefore >= gap.gap;
          const servedAfter = Math.max(gainBefore, proposedGain) >= gap.gap;
          if (!servedBefore) {
            addToSetMap(unservedBySkillBefore, gap.skillId, employeeId);
            if (gap.critical) criticalUncoveredBefore.add(employeeId);
          }
          if (!servedAfter) {
            addToSetMap(unservedBySkillAfter, gap.skillId, employeeId);
            if (gap.critical) criticalUncoveredAfter.add(employeeId);
          }
        });
    });

  const newlyCoveredSkillIds = [...unservedBySkillBefore.keys()]
    .filter((skillId) => !unservedBySkillAfter.has(skillId))
    .sort();
  const eligible = [...eligibleEmployeeIds].sort();
  const criticalAffected = [...criticalAffectedEmployeeIds].sort();
  const before = [...criticalUncoveredBefore].sort();
  const after = [...criticalUncoveredAfter].sort();

  return {
    eventId: event.id,
    eligibleEmployeeIds: eligible,
    eligibleEmployeeCount: eligible.length,
    criticalAffectedEmployeeIds: criticalAffected,
    criticalAffectedEmployeeCount: criticalAffected.length,
    newlyCoveredSkillIds,
    criticalUncoveredEmployeeIdsBefore: before,
    criticalUncoveredEmployeeIdsAfter: after,
    criticalUncoveredEmployeesBefore: before.length,
    criticalUncoveredEmployeesAfter: after.length,
  };
}
