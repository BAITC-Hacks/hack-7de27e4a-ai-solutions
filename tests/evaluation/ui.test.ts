import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HRPage from '../../src/app/hr/page';
import TrustPage from '../../src/app/trust/page';
import { TrustIntegrationProvider, type TrustIntegration } from '../../src/components/trust/integration';
import { dataset, employee } from './fixtures';
const integration = (): TrustIntegration => ({ access: 'hr', state: 'ready', analytics: dataset(), challenge: { label: 'Synthetic E0028 challenge', employee: employee() } });
const render = (value: TrustIntegration, page = HRPage) => renderToStaticMarkup(createElement(TrustIntegrationProvider, { value, children: createElement(page) }));
describe('HR and Trust surfaces', () => {
  it('show missing integration, loading and invalid import states', () => {
    expect(renderToStaticMarkup(createElement(HRPage))).toContain('Данные ещё не подключены');
    expect(render({ ...integration(), state: 'loading' })).toContain('Готовим данные');
    expect(render({ ...integration(), state: 'invalid' })).toContain('Файлы не прошли проверку');
  });
  it('renders aggregates for HR and hides the dashboard from employee mode', () => {
    const hr = render(integration()); expect(hr).toContain('50%'); expect(hr).toContain('SK_SYSTEM_DESIGN'); expect(hr).not.toContain('E0028');
    const denied = render({ ...integration(), access: 'employee' }); expect(denied).toContain('Раздел для HR'); expect(denied).not.toContain('SK_SYSTEM_DESIGN');
  });
  it('does not present unevaluated metrics as success', () => {
    const html = render(integration(), TrustPage); expect(html).toContain('Не измерено'); expect(html).toContain('синтетических'); expect(html).toContain('EV_MENTORING');
  });
});
