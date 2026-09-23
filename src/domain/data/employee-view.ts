import { buildEffectiveEmployeeProfile } from "@/domain/recommendation";
import { recommendSkillBuddies } from "@/domain/simulation";
import type { Employee, NormalizedDataset } from "@/lib/contracts";

function sanitizedBuddy(dataset: NormalizedDataset, employeeId: string): Employee {
  const profile = buildEffectiveEmployeeProfile(dataset, employeeId);
  const employee = profile.employee;
  return {
    id: employee.id,
    fullName: employee.fullName,
    department: employee.department,
    role: employee.role,
    grade: employee.grade,
    managerId: null,
    hireDate: dataset.meta.asOfDate,
    tenureMonths: 0,
    workFormat: employee.workFormat,
    preferredLanguage: employee.preferredLanguage,
    careerGoal: null,
    skills: profile.effectiveSkills,
    // The effective snapshot above is final; no colleague history is serialized.
    lastReviewDate: dataset.meta.asOfDate,
  };
}

/**
 * Produces the client payload for employee mode. It contains one full viewer profile and only the
 * minimum sanitized colleague directory needed by Skill Buddy; colleagues' activity history,
 * goals, managers, tenure and raw review snapshots never leave the server.
 */
export function buildPrivateEmployeeDataset(
  dataset: NormalizedDataset,
  viewerEmployeeId: string,
): NormalizedDataset {
  const viewer = dataset.employeesById[viewerEmployeeId];
  if (!viewer) throw new Error(`Unknown employee: ${viewerEmployeeId}`);

  const buddyIds = new Set<string>();
  Object.keys(dataset.skillsById).forEach((skillId) => {
    recommendSkillBuddies(dataset, viewerEmployeeId, skillId, 3).forEach((buddy) => {
      buddyIds.add(buddy.employeeId);
    });
  });

  const employeesById: Record<string, Employee> = { [viewer.id]: viewer };
  [...buddyIds].sort().forEach((employeeId) => {
    employeesById[employeeId] = sanitizedBuddy(dataset, employeeId);
  });
  const viewerHistory = [...(dataset.historyByEmployeeId[viewerEmployeeId] ?? [])];
  const historyByEmployeeId = Object.fromEntries(
    Object.keys(employeesById).map((employeeId) => [
      employeeId,
      employeeId === viewerEmployeeId ? viewerHistory : [],
    ]),
  );

  return {
    ...dataset,
    employeesById,
    history: viewerHistory,
    historyByEmployeeId,
  };
}
