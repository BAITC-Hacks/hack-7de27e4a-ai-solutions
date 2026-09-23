import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { importCareerQuestDataset } from '@/domain/data';
import { selectDevelopmentDropoutReport } from '@/domain/analytics/dropout';
import type { AnalyticsInput, Participation } from '@/domain/analytics/types';
import { HRAgentPanel } from '@/components/hr/HRAgentPanel';
import { DropoutPanel } from '@/components/hr/DropoutPanel';
import { agentStatusCopy, agentToolCopy, localizeAgentReason, localizeDropoutRow } from '@/components/hr/panel-localization';
import { TrustIntegrationProvider, type TrustIntegration } from '@/components/trust/integration';
import { I18nProvider } from '@/lib/i18n/I18nProvider';
import { formatDate, translate, type Locale } from '@/lib/i18n/core';
import { employee, requestFixture } from './fixtures';

const read = (name: string) => readFileSync(new URL(`../../data/source/${name}`, import.meta.url), 'utf8');
const normalized = importCareerQuestDataset({ employees: read('employees.json'), skills: read('skills.json'), events: read('events.json'), activityHistoryCsv: read('activity_history.csv') });
const participation = (patch: Partial<Participation> = {}): Participation => ({ employeeId: 'E0028', activityId: 'EV_TEST', assignedBy: 'self', mandatory: false, date: '2026-08-01', status: 'no_show', ...patch });
const input: AnalyticsInput = { snapshotDate: '2026-10-01', employees: [employee()], history: [
  participation(), participation({ assignedBy: 'hr', status: 'declined' }), participation({ assignedBy: 'manager', status: 'dropped' }),
  participation({ date: '2026-01-01' }), participation({ status: 'overdue', mandatory: true }), participation({ date: undefined }),
] };
const integration: TrustIntegration = { access: 'hr', state: 'ready', analytics: input, challenge: { label: 'Test', employee: employee() },
  reviewRequest: { ...requestFixture(), language: 'ru' },
  agentSnapshot: { dataset: null, normalizedDataset: normalized, selectedEmployeeId: 'E0028', status: 'ready', views: {}, ledger: [] } };
const render = (locale: Locale, panel: 'agent' | 'dropout', access: TrustIntegration['access'] = 'hr') => renderToStaticMarkup(createElement(I18nProvider, {
  initialLocale: locale, children: createElement(TrustIntegrationProvider, {
    value: { ...integration, access }, children: panel === 'agent' ? createElement(HRAgentPanel) : createElement(DropoutPanel, { input }),
  }),
}));

describe('HR agent and development support localization', () => {
  it.each([
    ['ru', 'Кто выпадает из развития', 'Период анализа участия', 'Сотрудников для обсуждения:'],
    ['kk', 'Даму бағдарламаларынан кім шығып қалады', 'Қатысуды талдау кезеңі', 'Әңгімелесуге арналған қызметкерлер:'],
    ['en', 'Who is dropping out of development', 'Participation analysis period', 'Employees to discuss:'],
  ] as const)('renders dropout copy, dates and the same observed counts in %s', (locale, title, aria, summary) => {
    const before = JSON.stringify(input);
    const html = render(locale, 'dropout');
    expect(html).toContain(title); expect(html).toContain(`aria-label="${aria}"`); expect(html).toContain(summary);
    expect(html).toContain(formatDate('2026-04-01', locale));
    expect(html).toContain(formatDate('2026-10-01', locale));
    expect([...html.matchAll(/<strong>(\d+)<\/strong>/g)].map(match => Number(match[1]))).toEqual([1, 3, 1]);
    expect(html).toContain('E0028');
    if (locale === 'en') expect(html).not.toMatch(/[А-Яа-яЁёӘәІіҢңҒғҮүҰұҚқӨөҺһ]/);
    if (locale === 'kk') expect(html).not.toMatch(/Негативные|неявок|Действие HR|Без даты|Обязательные активности/);
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each([
    ['ru', 'Спросить HR-агента', 'Проверяем настройки', 'Получить ответ'],
    ['kk', 'HR агентіне сұрақ қою', 'Баптаулар тексерілуде', 'Жауап алу'],
    ['en', 'Ask the HR agent', 'Checking configuration', 'Get answer'],
  ] as const)('uses UI locale for the agent form and suggestions despite another review language: %s', (locale, title, status, button) => {
    const html = render(locale, 'agent');
    expect(html).toContain(title); expect(html).toContain(status); expect(html).toContain(button);
    expect(html).toContain('E0028'); expect(html).toContain('SK_SYSTEM_DESIGN');
    if (locale === 'en') expect(html).not.toMatch(/[А-Яа-яЁёӘәІіҢңҒғҮүҰұҚқӨөҺһ]/);
    if (locale === 'kk') expect(html).not.toMatch(/Покажи|критические|Проверь|Получить|Например|Ваш вопрос/);
  });

  it('renders reasons from structured fields in every language without changing counts or patterns', () => {
    const cases = [
      [participation()], [participation({ assignedBy: 'hr' })], [participation(), participation({ assignedBy: 'manager' })],
    ];
    for (const history of cases) {
      const row = selectDevelopmentDropoutReport({ ...input, history }).rows[0];
      const value = { ...row, reason: 'WRONG LANGUAGE SENTINEL', suggestedAction: 'WRONG LANGUAGE SENTINEL' };
      const before = JSON.stringify(value);
      const results = (['ru', 'kk', 'en'] as const).map(locale => localizeDropoutRow(value, locale));
      expect(new Set(results.map(result => result.suggestedAction)).size).toBe(3);
      const numbers = (text: string) => text.match(/\d+/g);
      expect(numbers(results[0].reason)).toEqual(numbers(results[1].reason));
      expect(numbers(results[0].reason)).toEqual(numbers(results[2].reason));
      for (const result of results) expect(`${result.reason} ${result.suggestedAction}`).not.toContain('SENTINEL');
      expect(`${results[2].reason} ${results[2].suggestedAction}`).not.toMatch(/[А-Яа-яЁё]/);
      expect(JSON.stringify(value)).toBe(before);
    }
  });

  it('localizes agent status, tool steps and diagnostic reasons including a safe unknown-code fallback', () => {
    for (const locale of ['ru', 'kk', 'en'] as const) {
      for (const copy of [...Object.values(agentStatusCopy), ...Object.values(agentToolCopy)]) {
        expect(translate(locale, ...copy)).not.toBe('');
        if (locale === 'en') expect(translate(locale, ...copy)).not.toMatch(/[А-Яа-яЁё]/);
      }
      for (const code of ['PROVIDER_ACCESS_DENIED', 'TOTAL_TIMEOUT', 'INVALID_TOOL_ARGUMENTS_OR_RESULT', 'UNKNOWN_TEXT_ID,UNSUPPORTED_TEXT_NUMBER', 'FUTURE_PROVIDER_DIAGNOSTIC']) {
        const result = localizeAgentReason(code, locale);
        expect(result).not.toContain(code); expect(result).not.toMatch(/[A-Z]+_[A-Z_]+/);
        if (locale === 'en') expect(result).not.toMatch(/[А-Яа-яЁё]/);
      }
      expect(render(locale, 'agent', 'employee')).toBe('');
      expect(render(locale, 'dropout', 'employee')).toBe('');
    }
  });
});
