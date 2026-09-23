import type { AnalyticsInput, HistoryStatus, Participation } from './types';

export interface ParticipationCounts {
  total: number;
  statuses: Record<HistoryStatus, number>;
  /** Only no_show, dropped and declined; never silence, active or overdue records. */
  negative: number;
}
export interface DevelopmentPeriodCounts {
  self: ParticipationCounts;
  manager: ParticipationCounts;
  hr: ParticipationCounts;
  mandatory: ParticipationCounts;
  negative: number;
  overdue: number;
}
export interface DevelopmentDropoutRow {
  employeeId: string;
  role: string;
  grade: string;
  current: DevelopmentPeriodCounts;
  previous: DevelopmentPeriodCounts;
  change: number;
  trend: 'fewer' | 'more' | 'unchanged' | 'no_previous_history';
  pattern: 'assigned' | 'self' | 'mixed';
  reason: string;
  suggestedAction: string;
}
export interface DevelopmentDropoutReport {
  months: 6 | 12;
  snapshotDate: string;
  currentStart: string;
  /** Previous period is [previousStart, currentStart); snapshot day is included in current. */
  previousStart: string;
  current: DevelopmentPeriodCounts;
  previous: DevelopmentPeriodCounts;
  rows: DevelopmentDropoutRow[];
  excluded: { missingDate: number; invalidDate: number; futureDate: number; olderDate: number };
}

const counts = (): ParticipationCounts => ({ total: 0, negative: 0,
  statuses: { completed: 0, in_progress: 0, no_show: 0, dropped: 0, declined: 0, overdue: 0 } });
const period = (): DevelopmentPeriodCounts => ({ self: counts(), manager: counts(), hr: counts(), mandatory: counts(), negative: 0, overdue: 0 });
const monthDays = (year: number, month: number) => [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= monthDays(year, month);
}
function monthsBefore(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const index = year * 12 + month - 1 - months;
  const nextYear = Math.floor(index / 12), nextMonth = index % 12 + 1;
  if (nextYear < 1) throw new Error('Snapshot date is too early');
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-${String(Math.min(day, monthDays(nextYear, nextMonth))).padStart(2, '0')}`;
}
function add(target: DevelopmentPeriodCounts, row: Participation): void {
  const group = row.mandatory ? target.mandatory : target[row.assignedBy];
  group.total++;
  group.statuses[row.status]++;
  if (row.status === 'overdue') target.overdue++;
  if (row.status === 'no_show' || row.status === 'dropped' || row.status === 'declined') {
    group.negative++;
    if (!row.mandatory) target.negative++;
  }
}
function describe(label: string, group: ParticipationCounts): string {
  return `${label}: неявок ${group.statuses.no_show}, прерываний ${group.statuses.dropped}, отказов ${group.statuses.declined}; завершено ${group.statuses.completed}, в процессе ${group.statuses.in_progress}.`;
}
const intro = {
  assigned: 'Негативные исходы наблюдаются только в назначенных активностях.',
  self: 'Негативные исходы наблюдаются в самостоятельно выбранных активностях.',
  mixed: 'Негативные исходы есть и в самостоятельно выбранных, и в назначенных активностях.',
};
const action = {
  assigned: 'Обсудить с сотрудником и руководителем целесообразность назначений, формат и расписание; согласовать изменение или снятие назначения.',
  self: 'Обсудить, сохраняется ли интерес к выбранным программам, и удобны ли формат и расписание. Согласовать следующий шаг с сотрудником.',
  mixed: 'Отдельно обсудить интерес к выбранным программам и целесообразность назначений. Согласовать формат и нагрузку с сотрудником и руководителем.',
};

/** HR-only factual read model. No score, ranking, churn prediction or causal diagnosis. */
export function selectDevelopmentDropoutReport(input: AnalyticsInput, options: { months?: 6 | 12 } = {}): DevelopmentDropoutReport {
  const months = options.months ?? 6;
  if (months !== 6 && months !== 12) throw new Error('Analysis period must be 6 or 12 months');
  const snapshotDate = input.snapshotDate ?? '2026-10-01';
  if (!validDate(snapshotDate)) throw new Error('Invalid snapshot date');
  const currentStart = monthsBefore(snapshotDate, months), previousStart = monthsBefore(snapshotDate, 2 * months);
  const byEmployee = new Map(input.employees.map(employee => [employee.employeeId, { employee, current: period(), previous: period() }]));
  if (byEmployee.size !== input.employees.length) throw new Error('Duplicate employee IDs in analytics projection');
  const report: DevelopmentDropoutReport = { months, snapshotDate, currentStart, previousStart, current: period(), previous: period(), rows: [],
    excluded: { missingDate: 0, invalidDate: 0, futureDate: 0, olderDate: 0 } };
  for (const row of input.history) {
    const employee = byEmployee.get(row.employeeId);
    if (!employee) throw new Error('History references an unknown employee');
    if (!row.date) { report.excluded.missingDate++; continue; }
    if (!validDate(row.date)) { report.excluded.invalidDate++; continue; }
    if (row.date > snapshotDate) { report.excluded.futureDate++; continue; }
    if (row.date < previousStart) { report.excluded.olderDate++; continue; }
    const key = row.date >= currentStart ? 'current' : 'previous';
    add(report[key], row); add(employee[key], row);
  }
  for (const { employee, current, previous } of byEmployee.values()) {
    // Mandatory context alone and absence of history never place a person on this list.
    if (current.negative === 0) continue;
    const assignedNegative = current.manager.negative + current.hr.negative;
    const pattern = current.self.negative ? assignedNegative ? 'mixed' : 'self' : 'assigned';
    const change = current.negative - previous.negative;
    const previousParticipation = previous.self.total + previous.manager.total + previous.hr.total;
    report.rows.push({ employeeId: employee.employeeId, role: employee.role, grade: employee.grade, current, previous, change,
      trend: !previousParticipation ? 'no_previous_history' : change < 0 ? 'fewer' : change > 0 ? 'more' : 'unchanged', pattern,
      reason: [intro[pattern], describe('По своей инициативе', current.self), describe('Назначил руководитель', current.manager), describe('Назначил HR', current.hr)].join(' '),
      suggestedAction: action[pattern] });
  }
  // Employee-ID order avoids turning a private support list into a performance ranking.
  report.rows.sort((a, b) => a.employeeId < b.employeeId ? -1 : a.employeeId > b.employeeId ? 1 : 0);
  return report;
}
