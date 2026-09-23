import type { DevelopmentDropoutRow, ParticipationCounts } from '@/domain/analytics/dropout';
import type { AgentRunStatus } from '@/lib/evaluation/agent-client';
import type { AgentToolCall } from '@/lib/evaluation/agent-contracts';
import { formatNumber, translate, type Locale } from '@/lib/i18n/core';

type Copy = readonly [ru: string, kk: string, en: string];
export const agentStatusCopy: Record<AgentRunStatus, Copy> = {
  verified: ['Числа и ссылки проверены', 'Сандар мен сілтемелер тексерілді', 'Numbers and references verified'],
  no_key: ['Агент отключён: ключ не настроен', 'Агент өшірулі: кілт бапталмаған', 'Agent disabled: no API key configured'],
  blocked: ['Ответ заблокирован · показаны только полученные факты', 'Жауап бұғатталды · тек алынған деректер көрсетілді', 'Answer blocked · only retrieved facts are shown'],
  timeout: ['Время истекло · частичный результат', 'Уақыт аяқталды · жартылай нәтиже', 'Time expired · partial result'],
  step_limit: ['Достигнут лимит шагов · частичный результат', 'Қадамдар шегіне жетті · жартылай нәтиже', 'Step limit reached · partial result'],
  cancelled: ['Запрос остановлен', 'Сұрау тоқтатылды', 'Request stopped'],
};
export const agentToolCopy: Record<AgentToolCall['name'], Copy> = {
  getGaps: ['Проверил разрывы навыков', 'Дағды алшақтықтарын тексерді', 'Checked skill gaps'],
  getRecommendations: ['Получил рекомендации движка', 'Қозғалтқыш ұсыныстарын алды', 'Retrieved engine recommendations'],
  findEmployees: ['Нашёл сотрудников по фильтру', 'Сүзгі бойынша қызметкерлерді тапты', 'Found employees matching the filter'],
  getSkillCoverage: ['Проверил покрытие навыка', 'Дағдының қамтылуын тексерді', 'Checked skill coverage'],
  getCatalogGaps: ['Проверил пробелы каталога', 'Каталогтағы алшақтықтарды тексерді', 'Checked catalog gaps'],
  simulate: ['Посчитал эффект активности', 'Іс-шараның әсерін есептеді', 'Calculated the activity effect'],
};
export const dropoutTrendCopy: Record<DevelopmentDropoutRow['trend'], Copy> = {
  fewer: ['Меньше негативных исходов', 'Теріс нәтижелер азайды', 'Fewer negative outcomes'],
  more: ['Больше негативных исходов', 'Теріс нәтижелер көбейді', 'More negative outcomes'],
  unchanged: ['Количество не изменилось', 'Саны өзгерген жоқ', 'Count unchanged'],
  no_previous_history: ['Нет истории для сравнения', 'Салыстыруға арналған тарих жоқ', 'No previous history to compare'],
};
const reasons: Record<string, Copy> = {
  TOTAL_TIMEOUT: ['Истёк общий лимит времени', 'Жалпы уақыт шегі аяқталды', 'Total time budget exceeded'],
  CANCELLED: ['Запрос отменён', 'Сұрау тоқтатылды', 'Request cancelled'],
  STEP_LIMIT: ['Достигнут предел вызовов инструментов', 'Құрал шақыруларының шегіне жетті', 'Tool call limit reached'],
  REPEATED_CALL_ID: ['Модель повторила идентификатор вызова', 'Модель шақыру идентификаторын қайталады', 'The model repeated a call identifier'],
  INVALID_TOOL_ARGUMENTS_OR_RESULT: ['Некорректные аргументы или результат инструмента', 'Құрал аргументтері немесе нәтижесі қате', 'Invalid tool arguments or result'],
  AGENT_UNAVAILABLE_OR_INVALID_RESPONSE: ['Агент недоступен или вернул некорректный ответ', 'Агент қолжетімсіз немесе қате жауап берді', 'Agent unavailable or returned an invalid response'],
  INVALID_REQUEST: ['Запрос не прошёл проверку', 'Сұрау тексеруден өтпеді', 'Request validation failed'],
  AGENT_DISABLED: ['Ключ модели не настроен', 'Модель кілті бапталмаған', 'Model API key is not configured'],
  REQUEST_ABORTED: ['Запрос был прерван', 'Сұрау үзілді', 'Request was interrupted'],
  TIME_BUDGET_EXCEEDED: ['Истёк лимит ожидания ответа', 'Жауапты күту уақыты аяқталды', 'Response time budget exceeded'],
  INVALID_MODEL_OUTPUT: ['Ответ модели не соответствует формату', 'Модель жауабы пішімге сәйкес емес', 'Model response has an invalid format'],
  PROVIDER_ACCESS_DENIED: ['Провайдер отклонил доступ к модели', 'Провайдер модельге кіруді қабылдамады', 'Provider denied access to the model'],
  PROVIDER_RATE_LIMIT: ['Достигнут лимит запросов провайдера', 'Провайдер сұрауларының шегіне жетті', 'Provider request limit reached'],
  PROVIDER_BAD_REQUEST: ['Провайдер отклонил параметры запроса', 'Провайдер сұрау параметрлерін қабылдамады', 'Provider rejected the request parameters'],
  PROVIDER_UNAVAILABLE: ['Провайдер модели недоступен', 'Модель провайдері қолжетімсіз', 'Model provider is unavailable'],
  PROVIDER_CONFIG_INVALID: ['Некорректные настройки провайдера', 'Провайдер баптаулары қате', 'Invalid provider configuration'],
  INVALID_ANSWER: ['Ответ не прошёл проверку формата', 'Жауап пішім тексеруінен өтпеді', 'Answer format validation failed'],
  AMBIGUOUS_EVIDENCE: ['Доказательства имеют повторяющиеся идентификаторы', 'Дәлел идентификаторлары қайталанады', 'Evidence contains duplicate identifiers'],
  UNKNOWN_EVIDENCE: ['Утверждение ссылается на неизвестный факт', 'Тұжырым белгісіз дерекке сілтейді', 'A claim references an unknown fact'],
  FACT_MISMATCH: ['Утверждение расходится с результатом инструмента', 'Тұжырым құрал нәтижесіне сәйкес емес', 'A claim differs from the tool result'],
  DUPLICATE_CLAIM: ['Ответ повторяет одно и то же утверждение', 'Жауап бір тұжырымды қайталайды', 'Answer repeats the same claim'],
  UNKNOWN_TEXT_EVIDENCE: ['Текст ссылается на неизвестное доказательство', 'Мәтін белгісіз дәлелге сілтейді', 'Text references unknown evidence'],
  UNKNOWN_TEXT_ID: ['В тексте найден неизвестный идентификатор', 'Мәтінде белгісіз идентификатор табылды', 'Text contains an unknown identifier'],
  UNSUPPORTED_NUMERIC_NOTATION: ['Формат числа не поддерживается проверкой', 'Сан пішімі тексеруде қолдау таппайды', 'Numeric notation is not supported by the verifier'],
  UNSUPPORTED_TEXT_NUMBER: ['Число в тексте не подтверждено инструментами', 'Мәтіндегі сан құралдармен расталмады', 'A number in the text is not supported by tool results'],
};

/** Diagnostics are localized presentation, not raw provider messages. Unknown future codes stay safe. */
export function localizeAgentReason(reason: string, locale: Locale): string {
  return reason.split(',').map(code => translate(locale, ...(reasons[code.trim()] ?? [
    'Ответ не удалось проверить; повторите запрос', 'Жауапты тексеру мүмкін болмады; сұрауды қайталаңыз', 'The response could not be verified; try again',
  ] as const))).join('; ');
}

/** Presentation only: use the selector's pattern and counts without recomputing inclusion or trends. */
export function localizeDropoutRow(row: DevelopmentDropoutRow, locale: Locale) {
  const intro: Record<DevelopmentDropoutRow['pattern'], Copy> = {
    assigned: ['Негативные исходы наблюдаются только в назначенных активностях.', 'Теріс нәтижелер тек тағайындалған іс-шараларда байқалады.', 'Negative outcomes occur only in assigned activities.'],
    self: ['Негативные исходы наблюдаются в самостоятельно выбранных активностях.', 'Теріс нәтижелер өз бетімен таңдалған іс-шараларда байқалады.', 'Negative outcomes occur in self-selected activities.'],
    mixed: ['Негативные исходы есть и в самостоятельно выбранных, и в назначенных активностях.', 'Теріс нәтижелер өз бетімен таңдалған және тағайындалған іс-шараларда бар.', 'Negative outcomes occur in both self-selected and assigned activities.'],
  };
  const action: Record<DevelopmentDropoutRow['pattern'], Copy> = {
    assigned: ['Обсудить с сотрудником и руководителем целесообразность назначений, формат и расписание; согласовать изменение или снятие назначения.', 'Қызметкермен және басшымен тағайындаулардың қажеттілігін, пішімі мен кестесін талқылап, өзгерту немесе алып тастауды келісу.', 'Discuss the purpose, format and schedule of assignments with the employee and manager; agree whether to change or remove an assignment.'],
    self: ['Обсудить, сохраняется ли интерес к выбранным программам, и удобны ли формат и расписание. Согласовать следующий шаг с сотрудником.', 'Таңдалған бағдарламаларға қызығушылық сақталғанын және пішімі мен кестесі қолайлы екенін талқылау. Келесі қадамды қызметкермен келісу.', 'Discuss whether the employee remains interested in the selected programs and whether the format and schedule work for them. Agree on the next step together.'],
    mixed: ['Отдельно обсудить интерес к выбранным программам и целесообразность назначений. Согласовать формат и нагрузку с сотрудником и руководителем.', 'Таңдалған бағдарламаларға қызығушылық пен тағайындаулардың қажеттілігін бөлек талқылау. Қызметкермен және басшымен пішім мен жүктемені келісу.', 'Discuss interest in selected programs and the purpose of assignments separately. Agree on format and workload with the employee and manager.'],
  };
  const describe = (group: ParticipationCounts, label: Copy) => translate(locale,
    '{label}: неявок {noShow}, прерываний {dropped}, отказов {declined}; завершено {completed}, в процессе {active}.',
    '{label}: келмегені {noShow}, тоқтатқаны {dropped}, бас тартқаны {declined}; аяқталғаны {completed}, орындалып жатқаны {active}.',
    '{label}: no-shows {noShow}, dropped {dropped}, declined {declined}; completed {completed}, in progress {active}.',
    { label: translate(locale, ...label), noShow: formatNumber(group.statuses.no_show, locale), dropped: formatNumber(group.statuses.dropped, locale), declined: formatNumber(group.statuses.declined, locale), completed: formatNumber(group.statuses.completed, locale), active: formatNumber(group.statuses.in_progress, locale) });
  return {
    reason: [translate(locale, ...intro[row.pattern]), describe(row.current.self, ['По своей инициативе', 'Өз бастамасымен', 'Self-selected']), describe(row.current.manager, ['Назначил руководитель', 'Басшы тағайындаған', 'Assigned by manager']), describe(row.current.hr, ['Назначил HR', 'HR тағайындаған', 'Assigned by HR'])].join(' '),
    suggestedAction: translate(locale, ...action[row.pattern]),
  };
}
