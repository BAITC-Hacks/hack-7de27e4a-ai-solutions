import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Papa from 'papaparse';
import { beforeAll, describe, expect, it } from 'vitest';
import { importCareerQuestDataset } from '@/domain/data';
import { createEmployeeStore } from '@/state/employeeStore';
import { createRealIntelligenceAdapter, projectDataset } from '@/state/realIntelligenceAdapter';
import type { NormalizedDataset } from '@/lib/contracts';
import { projectCoreHistory } from '@/domain/analytics/core-adapter';
import { projectEmployeeStore } from '@/domain/analytics/store-adapter';
import { selectDevelopmentDropoutReport } from '@/domain/analytics/dropout';
import type { AnalyticsInput, Participation } from '@/domain/analytics/types';
import { TrustIntegrationProvider } from '@/components/trust/integration';
import { DropoutPanel } from '@/components/hr/DropoutPanel';
import { employee } from './fixtures';

const history = (patch: Partial<Participation> = {}): Participation => ({ employeeId: 'E0028', activityId: 'activity', date: '2026-08-01', status: 'no_show', mandatory: false, assignedBy: 'self', ...patch });
const input = (rows: Participation[]): AnalyticsInput => ({ employees: [employee()], history: rows, snapshotDate: '2026-10-01' });
const report = (rows: Participation[], months: 6 | 12 = 6) => selectDevelopmentDropoutReport(input(rows), { months });

describe('observed development participation for HR', () => {
  it('keeps self, manager, HR, mandatory and overdue counts separate', () => {
    const result = report([
      history(), history({ status: 'dropped', assignedBy: 'manager' }), history({ status: 'declined', assignedBy: 'hr' }),
      history({ status: 'overdue', mandatory: true, assignedBy: 'hr' }), history({ status: 'no_show', mandatory: true, assignedBy: 'manager' }),
      history({ status: 'overdue' }), history({ status: 'in_progress' }), history({ status: 'completed' }),
    ]);
    expect(result.current.negative).toBe(3);
    expect(result.current.self.negative).toBe(1);
    expect(result.current.manager.negative).toBe(1);
    expect(result.current.hr.negative).toBe(1);
    expect(result.current.mandatory.total).toBe(2);
    expect(result.current.overdue).toBe(2);
    expect(result.rows[0].current.self.statuses.in_progress).toBe(1);
  });
  it('excludes silence, completed/active history, old negatives and mandatory-only records', () => {
    expect(report([]).rows).toEqual([]);
    expect(report([history({ status: 'completed' }), history({ status: 'in_progress' }), history({ mandatory: true }), history({ status: 'overdue' }), history({ date: '2025-12-01' })]).rows).toEqual([]);
  });
  it('explains assignment-only, self and mixed patterns without diagnosing a cause', () => {
    const assigned = report([history({ assignedBy: 'hr' }), history({ status: 'completed' })]).rows[0];
    const self = report([history()]).rows[0];
    const mixed = report([history(), history({ assignedBy: 'manager' })]).rows[0];
    expect(assigned.pattern).toBe('assigned');
    expect(assigned.reason).toContain('только в назначенных');
    expect(assigned.suggestedAction).toContain('целесообразность назначений');
    expect(self.pattern).toBe('self');
    expect(self.suggestedAction).toContain('сохраняется ли интерес');
    expect(mixed.pattern).toBe('mixed');
    expect(mixed.reason).not.toBe(assigned.reason);
    expect(new Set([assigned.reason, self.reason, mixed.reason]).size).toBe(3);
  });
  it('uses snapshot-relative calendar boundaries, excluding future and stale dates', () => {
    const result = report(['2025-09-30', '2025-10-01', '2026-03-31', '2026-04-01', '2026-09-30', '2026-10-01', '2026-10-02'].map(date => history({ date })));
    expect(result.currentStart).toBe('2026-04-01');
    expect(result.previousStart).toBe('2025-10-01');
    expect(result.current.negative).toBe(3);
    expect(result.previous.negative).toBe(2);
    expect(result.excluded).toEqual({ missingDate: 0, invalidDate: 0, futureDate: 1, olderDate: 1 });
    const year = report([history({ date: '2024-10-01' }), history({ date: '2025-09-30' }), history({ date: '2025-10-01' })], 12);
    expect(year.current.negative).toBe(1);
    expect(year.previous.negative).toBe(2);
    expect(year.rows[0].trend).toBe('fewer');
  });
  it('reports missing/invalid dates explicitly and never fabricates history', () => {
    const result = report([history({ date: undefined }), history({ date: null }), history({ date: '2026-02-30' }), history({ date: '2026-2-01' })]);
    expect(result.excluded.missingDate).toBe(2);
    expect(result.excluded.invalidDate).toBe(2);
    expect(result.rows).toEqual([]);
    expect(() => selectDevelopmentDropoutReport({ ...input([]), snapshotDate: '2026-02-30' })).toThrow();
  });
  it('distinguishes count trends from missing previous history', () => {
    expect(report([history()]).rows[0].trend).toBe('no_previous_history');
    expect(report([history(), history({ date: '2026-03-01', status: 'completed' })]).rows[0].trend).toBe('more');
    expect(report([history(), history({ date: '2026-03-01' })]).rows[0].trend).toBe('unchanged');
    expect(report([history(), history({ date: '2026-03-01' }), history({ date: '2026-02-01' })]).rows[0].trend).toBe('fewer');
  });
  it('has deterministic ID ordering, no probability metrics and no mutations', () => {
    const source = { employees: [{ ...employee(), employeeId: 'Z' }, { ...employee(), employeeId: 'A' }], history: [history({ employeeId: 'Z' }), history({ employeeId: 'A' }), history({ employeeId: 'Z' })] };
    const serialized = JSON.stringify(source);
    const result = selectDevelopmentDropoutReport(source);
    expect(result.rows.map(row => row.employeeId)).toEqual(['A', 'Z']);
    expect(result).toEqual(selectDevelopmentDropoutReport({ employees: [...source.employees].reverse(), history: [...source.history].reverse() }));
    expect(JSON.stringify(source)).toBe(serialized);
    const keys = (value: unknown): string[] => value && typeof value === 'object' ? Object.entries(value).flatMap(([key, child]) => [key, ...keys(child)]) : [];
    expect(keys(result).filter(key => /probability|risk|accuracy|score|rank/i.test(key))).toEqual([]);
  });
  it('renders employee details only for the HR role', () => {
    const data = input([history()]);
    const render = (access: 'hr' | 'employee') => renderToStaticMarkup(createElement(TrustIntegrationProvider, { value: { access, state: 'ready', analytics: data }, children: createElement(DropoutPanel, { input: data }) }));
    expect(render('hr')).toContain('E0028');
    expect(render('employee')).toBe('');
    expect(renderToStaticMarkup(createElement(DropoutPanel, { input: data }))).toBe('');
  });
});

describe('source CSV and current B store integration', () => {
  let data: NormalizedDataset;
  let files: { employees: string; skills: string; events: string; activityHistoryCsv: string };
  beforeAll(() => {
    const read = (name: string) => readFileSync(fileURLToPath(new URL(`../../data/source/${name}`, import.meta.url)), 'utf8');
    files = { employees: read('employees.json'), skills: read('skills.json'), events: read('events.json'), activityHistoryCsv: read('activity_history.csv') };
    data = importCareerQuestDataset(files);
  });
  it('matches independent raw CSV counts for each employee, status, assignment and period', () => {
    const rows = Papa.parse<Record<string, string>>(files.activityHistoryCsv, { header: true, skipEmptyLines: true }).data;
    const events = JSON.parse(files.events).events as { event_id: string; mandatory: boolean }[];
    const mandatory = new Set(events.filter(event => event.mandatory).map(event => event.event_id));
    const projection: AnalyticsInput = { employees: Object.keys(data.employeesById).map(employeeId => ({ ...employee(), employeeId })), history: projectCoreHistory(data), snapshotDate: data.meta.asOfDate };
    for (const months of [6, 12] as const) {
      const result = selectDevelopmentDropoutReport(projection, { months });
      const start = months === 6 ? '2026-04-01' : '2025-10-01';
      const previousStart = months === 6 ? '2025-10-01' : '2024-10-01';
      const negative = (row: Record<string, string>) => ['no_show', 'dropped', 'declined'].includes(row.status) && !mandatory.has(row.event_id);
      const current = rows.filter(row => row.date >= start && row.date <= '2026-10-01');
      const previous = rows.filter(row => row.date >= previousStart && row.date < start);
      expect(result.current.negative).toBe(current.filter(negative).length);
      expect(result.previous.negative).toBe(previous.filter(negative).length);
      expect(result.rows.map(row => row.employeeId)).toEqual([...new Set(current.filter(negative).map(row => row.employee_id))].sort());
      for (const [key, raw] of [['current', current], ['previous', previous]] as const) {
        for (const assignedBy of ['self', 'manager', 'hr'] as const) for (const status of ['completed', 'in_progress', 'no_show', 'dropped', 'declined', 'overdue'] as const) {
          expect(result[key][assignedBy].statuses[status]).toBe(raw.filter(row => row.assigned_by === assignedBy && row.status === status && !mandatory.has(row.event_id)).length);
        }
        for (const item of result.rows) expect(item[key].negative).toBe(raw.filter(row => row.employee_id === item.employeeId && negative(row)).length);
      }
    }
  });
  it('retains actual B ledger effective dates once in current normalized history', () => {
    const adapter = createRealIntelligenceAdapter();
    const store = createEmployeeStore(adapter);
    expect(store.getState().loadDataset(projectDataset(data))).toBe(true);
    const before = projectEmployeeStore(store.getState())!;
    const state = store.getState();
    const employeeId = Object.keys(state.views).find(id => state.views[id].recommendations.length)!;
    const activityId = state.views[employeeId].recommendations[0].activityId;
    store.getState().selectEmployee(employeeId);
    store.getState().previewActivity(activityId);
    expect(store.getState().confirmCompletion(store.getState().simulation!.requestId)).toBe(true);
    const afterState = store.getState();
    expect(afterState.ledger.length).toBe(1);
    const after = projectEmployeeStore(afterState)!;
    expect(after.history.length).toBe(before.history.length + 1);
    const appended = after.history.filter(row => row.historyId === `session:${afterState.ledger[0].id}`);
    expect(appended).toHaveLength(1);
    expect(appended[0].date).toBe('2026-10-01');
    const a = selectDevelopmentDropoutReport(before), b = selectDevelopmentDropoutReport(after);
    expect(b.current.self.statuses.completed).toBe(a.current.self.statuses.completed + 1);
    expect(b.current.negative).toBe(a.current.negative);
  });
});
