import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { importCareerQuestDataset } from '@/domain/data';
import { recommendForEmployee } from '@/domain/recommendation';
import { createEmployeeStore, type EmployeeStore } from '@/state/employeeStore';
import { createRealIntelligenceAdapter, projectDataset } from '@/state/realIntelligenceAdapter';
import { createAgentTools, agentRoles } from '../../src/lib/evaluation/agent-tools';
import type { NormalizedDataset } from '@/lib/contracts';
import type { AgentToolCall } from '../../src/lib/evaluation/agent-contracts';

describe('agent tools over real imported data and committed progress', () => {
  let store: EmployeeStore, source: NormalizedDataset;
  beforeAll(() => {
    const read = (name: string) => readFileSync(new URL(`../../data/source/${name}`, import.meta.url), 'utf8');
    source = importCareerQuestDataset({ employees: read('employees.json'), skills: read('skills.json'), events: read('events.json'), activityHistoryCsv: read('activity_history.csv') });
    store = createEmployeeStore(createRealIntelligenceAdapter());
    store.getState().loadDataset(projectDataset(source)); store.getState().selectEmployee('E0028');
  });
  it('wraps all six tools and serializes no names, descriptions or raw history', () => {
    const state = store.getState(); const execute = createAgentTools(state);
    const activityId = state.views.E0028.recommendations[0].activityId;
    const calls: AgentToolCall[] = [
      { id: 'a', name: 'getGaps', arguments: { employeeId: 'E0028' } },
      { id: 'b', name: 'getRecommendations', arguments: { employeeId: 'E0028' } },
      { id: 'c', name: 'findEmployees', arguments: { skillId: 'SK_SYSTEM_DESIGN', minLevel: 4 } },
      { id: 'd', name: 'getSkillCoverage', arguments: { skillId: 'SK_SYSTEM_DESIGN' } },
      { id: 'e', name: 'getCatalogGaps', arguments: {} },
      { id: 'f', name: 'simulate', arguments: { employeeId: 'E0028', activityId } },
    ];
    for (const call of calls) {
      const result = execute(call, 1); const json = JSON.stringify(result);
      expect(result.facts.length).toBeGreaterThan(0);
      for (const employee of Object.values(source.employeesById)) expect(json).not.toContain(employee.fullName);
      for (const event of Object.values(source.eventsById)) { expect(json).not.toContain(event.title); expect(json).not.toContain(event.description); }
      expect(json).not.toContain('assignedBy'); expect(json).not.toContain('lastReviewDate');
    }
    expect(store.getState()).toBe(state); expect(state.ledger).toHaveLength(0);
  });
  it('rejects unknown IDs before executing simulation or accepting extra tool arguments', () => {
    const adapter = createRealIntelligenceAdapter(); const spy = vi.spyOn(adapter, 'evaluate');
    const execute = createAgentTools(store.getState(), adapter);
    expect(() => execute({ id: 'x', name: 'simulate', arguments: { employeeId: 'UNKNOWN', activityId: 'EV_001' } }, 1)).toThrow('INVALID_REFERENCE');
    expect(() => execute({ id: 'x', name: 'getSkillCoverage', arguments: { skillId: 'SK_UNKNOWN' } }, 1)).toThrow('INVALID_REFERENCE');
    expect(() => execute({ id: 'x', name: 'findEmployees', arguments: { minLevel: 4 } }, 1)).toThrow('INVALID_ARGUMENT');
    expect(spy).not.toHaveBeenCalled();
  });
  it('preserves recommendation rank and reports a genuine no-target empty state', () => {
    const execute = createAgentTools(store.getState());
    const result = execute({ id: 'x', name: 'getRecommendations', arguments: { employeeId: 'E0028' } }, 1);
    expect(result.facts.filter(f => f.metric === 'rank').map(f => f.activityId)).toEqual(recommendForEmployee(source, 'E0028').recommendations.map(r => r.activityId));
    const employeeId = Object.keys(source.employeesById).find(id => !store.getState().views[id].target)!;
    const empty = execute({ id: 'empty', name: 'getGaps', arguments: { employeeId } }, 1);
    expect(empty.facts).toEqual([{ id: 'f1', subjectId: employeeId, metric: 'hasTarget', value: 0 }]);
  });
  it('filters by opaque role ID without forwarding role labels', () => {
    const role = agentRoles(source)[0];
    const result = createAgentTools(store.getState())({ id: 'role', name: 'findEmployees', arguments: { roleId: role.id } }, 1);
    expect(result.facts.find(f => f.metric === 'employeeCount')?.value).toBe(Object.values(source.employeesById).filter(e => e.role === role.label).length);
    expect(JSON.stringify(result)).not.toContain(role.label);
  });
  it('uses the updated canonical snapshot after completion without mutating the store', () => {
    const state = store.getState(); const rec = state.views.E0028.recommendations[0];
    state.previewActivity(rec.activityId);
    expect(store.getState().confirmCompletion(store.getState().simulation!.requestId)).toBe(true);
    const next = store.getState(); const execute = createAgentTools(next);
    const gaps = execute({ id: 'g', name: 'getGaps', arguments: { employeeId: 'E0028' } }, 1);
    for (const fact of gaps.facts.filter(f => f.metric === 'currentLevel')) expect(fact.value).toBe(next.views.E0028.effectiveSkills[fact.skillId!]);
    const recs = execute({ id: 'r', name: 'getRecommendations', arguments: { employeeId: 'E0028' } }, 2);
    expect(recs.facts.filter(f => f.metric === 'rank').map(f => f.activityId)).toEqual(next.views.E0028.recommendations.map(r => r.activityId));
    expect(store.getState()).toBe(next);
  });
});
