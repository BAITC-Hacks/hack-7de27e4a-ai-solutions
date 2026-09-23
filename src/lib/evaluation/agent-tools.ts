import { recommendForEmployee } from '@/domain/recommendation';
import { roleProfileKey, type NormalizedDataset } from '@/lib/contracts';
import type { EmployeeState } from '@/state/employeeStore';
import type { IntelligenceAdapter } from '@/state/intelligenceAdapter';
import { createRealIntelligenceAdapter } from '@/state/realIntelligenceAdapter';
import { simulateStep } from '@/domain/simulation/simulator';
import { projectEmployeeStore } from '@/domain/analytics/store-adapter';
import { selectHRAnalytics } from '@/domain/analytics/selectors';
import { agentToolCallSchema, agentToolResultSchema, type AgentFact, type AgentToolCall, type AgentToolResult } from './agent-contracts';

/** The executor captures the SAME immutable store revision as HR. No server-side dataset. */
export type AgentSnapshot = Pick<EmployeeState, 'dataset' | 'normalizedDataset' | 'views' | 'ledger' | 'selectedEmployeeId' | 'status'>;
export class AgentToolError extends Error {
  constructor(public readonly code: 'INVALID_REFERENCE' | 'INVALID_ARGUMENT' | 'UNAVAILABLE' | 'INELIGIBLE') { super(code); }
}
export function agentRoles(source: NormalizedDataset) {
  return [...new Set(Object.values(source.employeesById).map(employee => employee.role))].sort()
    .map((label, index) => ({ id: `ROLE_${String(index + 1).padStart(3, '0')}`, label }));
}

export function createAgentTools(state: AgentSnapshot, adapter: IntelligenceAdapter = createRealIntelligenceAdapter()) {
  const source = state.normalizedDataset;
  return (input: AgentToolCall, step: number): AgentToolResult => {
    if (!source || !state.dataset || state.status !== 'ready') throw new AgentToolError('UNAVAILABLE');
    const parsed = agentToolCallSchema.safeParse(input);
    if (!parsed.success || !Number.isInteger(step) || step < 1 || step > 5) throw new AgentToolError('INVALID_ARGUMENT');
    const call = parsed.data;
    const args = call.arguments as { employeeId?: string; activityId?: string; skillId?: string; roleId?: string; grade?: string; minLevel?: number };
    // References are checked BEFORE any recommendation, analytics or simulation function executes.
    if (args.employeeId && !Object.hasOwn(source.employeesById, args.employeeId)) throw new AgentToolError('INVALID_REFERENCE');
    if (args.skillId && !Object.hasOwn(source.skillsById, args.skillId)) throw new AgentToolError('INVALID_REFERENCE');
    if (args.activityId && !Object.hasOwn(source.eventsById, args.activityId)) throw new AgentToolError('INVALID_REFERENCE');
    const roles = agentRoles(source);
    const selectedRole = args.roleId ? roles.find(role => role.id === args.roleId) : undefined;
    if (args.roleId && !selectedRole) throw new AgentToolError('INVALID_REFERENCE');
    const facts: AgentFact[] = [];
    const fact = (subjectId: string, metric: AgentFact['metric'], value: number, extra: Pick<AgentFact, 'skillId' | 'activityId'> = {}) => {
      facts.push({ id: `f${facts.length + 1}`, subjectId, metric, value, ...extra });
    };
    const employeeId = args.employeeId!;
    switch (call.name) {
      case 'getGaps': {
        const result = recommendForEmployee(source, employeeId);
        fact(employeeId, 'hasTarget', Number(!!result.gapAnalysis.target));
        if (result.gapAnalysis.target) fact(employeeId, 'readiness', result.gapAnalysis.readiness);
        for (const gap of result.gapAnalysis.gaps) {
          const extra = { skillId: gap.skillId };
          fact(employeeId, 'currentLevel', gap.currentLevel, extra);
          fact(employeeId, 'requiredLevel', gap.requiredLevel, extra);
          fact(employeeId, 'gap', gap.gap, extra);
          if (gap.critical) fact(employeeId, 'criticalGap', gap.gap, extra);
        }
        break;
      }
      case 'getRecommendations': {
        const result = recommendForEmployee(source, employeeId);
        fact(employeeId, 'hasTarget', Number(!!result.gapAnalysis.target));
        fact(employeeId, 'returnedCount', result.recommendations.length);
        for (const recommendation of result.recommendations) {
          const extra = { activityId: recommendation.activityId };
          fact(employeeId, 'rank', recommendation.rank, extra);
          fact(employeeId, 'score', recommendation.totalScore, extra);
          fact(employeeId, 'projectedReadiness', recommendation.projectedReadiness, extra);
          for (const [skillId, gain] of Object.entries(recommendation.effectiveGains)) fact(employeeId, 'gain', gain, { ...extra, skillId });
        }
        break;
      }
      case 'findEmployees': {
        const matches = Object.values(source.employeesById).filter(employee =>
          (!selectedRole || employee.role === selectedRole.label) && (!args.grade || employee.grade === args.grade) &&
          (!args.skillId || (state.views[employee.id]?.effectiveSkills[args.skillId] ?? 0) >= (args.minLevel ?? 0)))
          .sort((a, b) => a.id.localeCompare(b.id));
        fact('dataset', 'employeeCount', matches.length);
        fact('dataset', 'returnedCount', Math.min(matches.length, 50));
        for (const employee of matches.slice(0, 50)) {
          fact(employee.id, 'match', 1);
          if (args.skillId) fact(employee.id, 'currentLevel', state.views[employee.id]?.effectiveSkills[args.skillId] ?? 0, { skillId: args.skillId });
        }
        break;
      }
      case 'getSkillCoverage': {
        // Requirement of CURRENT role/grade, as specified in the advanced feature brief.
        const skillId = args.skillId!;
        let eligible = 0, covered = 0, critical = 0;
        for (const employee of Object.values(source.employeesById)) {
          const profile = source.roleProfilesByKey[roleProfileKey(employee.role, employee.grade)];
          const required = profile?.requiredSkills[skillId];
          if (required === undefined) continue;
          eligible++;
          const level = state.views[employee.id]?.effectiveSkills[skillId] ?? 0;
          if (level >= required) covered++;
          else if (profile.criticalSkills.includes(skillId)) critical++;
        }
        const extra = { skillId };
        fact(skillId, 'requiredEmployeeCount', eligible, extra);
        fact(skillId, 'coveredCount', covered, extra);
        fact(skillId, 'uncoveredCount', eligible - covered, extra);
        fact(skillId, 'criticalCount', critical, extra);
        if (eligible) fact(skillId, 'coverage', covered / eligible, extra);
        break;
      }
      case 'getCatalogGaps': {
        const input = projectEmployeeStore(state);
        if (!input) throw new AgentToolError('UNAVAILABLE');
        const analytics = selectHRAnalytics(input);
        fact('dataset', 'noTargetCount', analytics.employeesWithoutTarget);
        fact('dataset', 'returnedCount', analytics.catalogGaps.length);
        for (const gap of analytics.catalogGaps) {
          fact(gap.skillId, 'employeeCount', gap.affectedEmployees, { skillId: gap.skillId });
          fact(gap.skillId, 'catalogGap', gap.noAvailableStep, { skillId: gap.skillId });
        }
        break;
      }
      case 'simulate': {
        const activityId = args.activityId!;
        let simulation;
        try { simulation = simulateStep(adapter, { dataset: state.dataset, employeeId, ledger: state.ledger }, activityId); }
        catch { throw new AgentToolError('INELIGIBLE'); }
        fact(employeeId, 'readiness', simulation.beforeView.readiness ?? 0, { activityId });
        fact(employeeId, 'projectedReadiness', simulation.afterView.readiness ?? 0, { activityId });
        for (const [skillId, gain] of Object.entries(simulation.delta)) fact(employeeId, 'gain', gain, { activityId, skillId });
        break;
      }
    }
    // Projection is an allowlist. Dataset names, descriptions and history never enter it.
    return agentToolResultSchema.parse({ callId: call.id, evidenceId: `tool:${step}:${call.name}`, tool: call.name, facts });
  };
}
