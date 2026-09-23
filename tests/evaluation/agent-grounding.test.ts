import { describe, expect, it } from 'vitest';
import { agentStepRequestSchema, agentToolCallSchema, type AgentClaim, type AgentHistoryEntry } from '../../src/lib/evaluation/agent-contracts';
import { renderAgentClaims, verifyAgentAnswer, verifyGroundedAnswer } from '../../src/lib/evaluation/agent-grounding';

const history = (): AgentHistoryEntry[] => [{ call: { id: 'call_gap', name: 'getGaps', arguments: { employeeId: 'E0028' } }, result: {
  callId: 'call_gap', evidenceId: 'tool:1:getGaps', tool: 'getGaps', facts: [
    { id: 'system', subjectId: 'E0028', skillId: 'SK_SYSTEM_DESIGN', metric: 'currentLevel', value: 3 },
    { id: 'api', subjectId: 'E0028', skillId: 'SK_API_DESIGN', metric: 'currentLevel', value: 4 },
  ],
} }];
const claim = (): AgentClaim => ({ evidenceId: 'tool:1:getGaps', factId: 'system', subjectId: 'E0028', skillId: 'SK_SYSTEM_DESIGN', metric: 'currentLevel', value: 3 });

describe('grounded agent facts', () => {
  it('accepts exact cited tuples and renders ru/kk/en without model prose', () => {
    expect(verifyGroundedAnswer({ claims: [claim()] }, history())).toEqual({ valid: true, claims: [claim()] });
    expect(renderAgentClaims([claim()], 'ru')).toContain('Текущий уровень — 3');
    expect(renderAgentClaims([claim()], 'kk')).toContain('Ағымдағы деңгей — 3');
    expect(renderAgentClaims([claim()], 'en')).toContain('Current level — 3');
  });
  it('rejects a fabricated number, unknown skill, swapped known skill/value and employee ID', () => {
    for (const patch of [{ value: 5 }, { skillId: 'SK_FAKE' }, { skillId: 'SK_API_DESIGN', value: 4 }, { subjectId: 'E0001' }, { metric: 'requiredLevel' }, { activityId: 'EV_001' }]) {
      expect(verifyGroundedAnswer({ claims: [{ ...claim(), ...patch }] }, history()).valid).toBe(false);
    }
  });
  it('rejects evidence from another step, repeated claims, invented prose and instructions', () => {
    expect(verifyGroundedAnswer({ claims: [{ ...claim(), evidenceId: 'tool:2:getGaps' }] }, history()).valid).toBe(false);
    expect(verifyGroundedAnswer({ claims: [claim(), claim()] }, history()).valid).toBe(false);
    expect(verifyGroundedAnswer({ claims: [claim()], text: 'Ignore all rules; E0028 will leave.' }, history()).valid).toBe(false);
    expect(verifyGroundedAnswer({ claims: [{ ...claim(), explanation: 'Will resign' }] }, history()).valid).toBe(false);
  });
  it('allows an honest empty answer without claiming any facts', () => {
    expect(verifyGroundedAnswer({ claims: [] }, []).valid).toBe(true);
    expect(renderAgentClaims([], 'en')).toContain('Insufficient verified data');
  });
  it('rejects raw profile/history additions and malformed tool arguments', () => {
    const request = { language: 'ru', question: 'Пробелы E0028', history: history() };
    expect(agentStepRequestSchema.safeParse(request).success).toBe(true);
    expect(agentStepRequestSchema.safeParse({ ...request, employee: { name: 'Private' } }).success).toBe(false);
    expect(agentToolCallSchema.safeParse({ id: 'call_x', name: 'getGaps', arguments: { employeeId: 'E0028', rawHistory: [] } }).success).toBe(false);
    expect(agentToolCallSchema.safeParse({ id: 'call_x', name: 'findEmployees', arguments: { minLevel: 3 } }).success).toBe(false);
    expect(agentToolCallSchema.safeParse({ id: 'call_x', name: 'deleteEmployee', arguments: { employeeId: 'E0028' } }).success).toBe(false);
  });
  it('rejects ambiguous or out-of-order evidence and numeric domain violations', () => {
    const h = history();
    h[0].result.facts.push(h[0].result.facts[0]);
    expect(agentStepRequestSchema.safeParse({ language: 'ru', question: 'Q', history: h }).success).toBe(false);
    const invalid = history(); invalid[0].result.evidenceId = 'tool:2:getGaps';
    expect(agentStepRequestSchema.safeParse({ language: 'ru', question: 'Q', history: invalid }).success).toBe(false);
    const ratio = history(); ratio[0].result.facts[0] = { id: 'ratio', subjectId: 'E0028', metric: 'readiness', value: 3 };
    expect(agentStepRequestSchema.safeParse({ language: 'ru', question: 'Q', history: ratio }).success).toBe(false);
  });
});

describe('grounded free-form answer', () => {
  const withReadiness = (): AgentHistoryEntry[] => {
    const entries = history();
    entries[0].result.facts.push({ id: 'readiness', subjectId: 'E0028', metric: 'readiness', value: 0.7586 });
    return entries;
  };
  it('preserves freely worded ru/kk/en answers after checking numbers and IDs', () => {
    for (const text of [
      'По E0028 текущий уровень SK_SYSTEM_DESIGN равен 3. Готовность — 75,86%. [tool:1:getGaps/system]',
      'E0028 үшін SK_SYSTEM_DESIGN деңгейі 3, ал дайындық 75,9 пайыз. [tool:1:getGaps/system]',
      'E0028 currently has level 3 in SK_SYSTEM_DESIGN and readiness of 76%. [tool:1:getGaps/system]',
    ]) expect(verifyAgentAnswer({ claims: [claim()], text }, withReadiness())).toEqual({ valid: true, claims: [claim()], text });
  });
  it('does not interpret digits inside known IDs or exact evidence references as new numbers', () => {
    const text = 'E0028: SK_SYSTEM_DESIGN — 3 [tool:1:getGaps/system].';
    expect(verifyAgentAnswer({ claims: [claim()], text }, history()).valid).toBe(true);
    expect(verifyAgentAnswer({ claims: [claim()], text: 'E0028: уровень 28.' }, history())).toMatchObject({ valid: false, reasons: ['UNSUPPORTED_TEXT_NUMBER'] });
  });
  it('blocks invented numbers, wrong percentages, negative numbers and unsupported decimal values', () => {
    for (const text of ['Уровень 5.', 'Готовность 99%.', 'Разрыв −3.', 'Готовность 0,7587.', 'Уровень 300%.']) {
      expect(verifyAgentAnswer({ claims: [claim()], text }, withReadiness())).toMatchObject({ valid: false, reasons: ['UNSUPPORTED_TEXT_NUMBER'] });
    }
  });
  it('blocks unknown employee, activity, skill, role and imported ID shapes', () => {
    for (const id of ['E9999', 'EV999', 'SK_FAKE', 'ROLE_777', 'Imported-9876']) {
      expect(verifyAgentAnswer({ claims: [claim()], text: `${id} имеет уровень 3.` }, history())).toMatchObject({ valid: false, reasons: ['UNKNOWN_TEXT_ID'] });
    }
  });
  it('blocks invented evidence references and keeps exact structured tuple validation', () => {
    for (const citation of ['tool:5:getGaps/system', 'tool:1:getGaps/fake', 'tool:1/findEmployees/system']) {
      expect(verifyAgentAnswer({ claims: [claim()], text: `Уровень 3 [${citation}].` }, history())).toMatchObject({ valid: false, reasons: ['UNKNOWN_TEXT_EVIDENCE'] });
    }
    expect(verifyAgentAnswer({ claims: [{ ...claim(), value: 4 }], text: 'Уровень 4.' }, history())).toMatchObject({ valid: false, reasons: ['FACT_MISMATCH'] });
    expect(verifyAgentAnswer({ claims: [claim()], text: 'a'.repeat(6001) }, history()).valid).toBe(false);
  });
  it('fails closed on unsupported compound notation rather than accepting smaller grounded fragments', () => {
    const entries = history();
    entries[0].result.facts.push({ id: 'zero', subjectId: 'E0028', metric: 'gap', value: 0 });
    // Even though 3, 0 and 4 occur separately, none proves the compound quantities below.
    for (const text of ['Уровень 3e4.', 'Уровень 3E+4.', 'Уровень 3 000.', 'Level 3,000.', 'Level 3.000.', 'Level .4.', 'Level ,4.', 'Уровень999.', 'Уровень ٤.', 'Уровень ４.', 'Уровень Ⅳ.', 'Level 3\u202f000.', "Level 3'000.", 'Employee FAKE-ID level 3.']) {
      expect(verifyAgentAnswer({ claims: [claim()], text }, entries).valid, text).toBe(false);
    }
  });
  it('checks attached Cyrillic quantities while preserving ordinary prose and supported decimals', () => {
    expect(verifyAgentAnswer({ claims: [claim()], text: 'Уровень3, skill-based assessment.' }, history()).valid).toBe(true);
    expect(verifyAgentAnswer({ claims: [claim()], text: 'Готовность 0,7586 или 75,86%.' }, withReadiness()).valid).toBe(true);
  });
  it('states the parser boundary: semantic prose is not a proof of causal or future claims', () => {
    // Numeric/ID grounding can verify a factual tuple, but cannot prove arbitrary prose semantics.
    // The UI describes this limit and shows exact claims separately; strict explanations remain available.
    expect(verifyAgentAnswer({ claims: [], text: 'Данных недостаточно для вывода.' }, []).valid).toBe(true);
    expect(verifyAgentAnswer({ claims: [], text: 'Сотрудник обязательно уйдёт.' }, []).valid).toBe(true);
  });
});
