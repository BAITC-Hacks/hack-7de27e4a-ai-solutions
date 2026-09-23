import type { ThreadStatus } from "./api";
type Translate = (ru: string, kk: string, en: string) => string;
export function statusLabel(status: ThreadStatus, t: Translate) {
  return {
    open: t("Ожидает ответа", "Жауап күтілуде", "Awaiting reply"),
    accepted: t("Принят", "Қабылданды", "Accepted"),
    declined: t("Отклонён", "Қабылданбады", "Declined"),
    closed: t("Закрыт", "Жабылды", "Closed"),
  }[status];
}
export function chatError(code: string, t: Translate): string {
  if (code === "AUTH_REQUIRED" || code === "SESSION_CHANGED")
    return t(
      "Профиль изменился или сессия завершена. Выберите профиль снова.",
      "Профиль өзгерді немесе сессия аяқталды. Профильді қайта таңдаңыз.",
      "Your profile changed or the session ended. Choose your profile again.",
    );
  if (code === "FORBIDDEN")
    return t(
      "Этот диалог доступен только его участникам.",
      "Бұл диалог тек қатысушыларына қолжетімді.",
      "Only participants can access this conversation.",
    );
  if (code === "NOT_FOUND")
    return t(
      "Диалог не найден. Обновите список.",
      "Диалог табылмады. Тізімді жаңартыңыз.",
      "Conversation not found. Refresh the list.",
    );
  if (code === "RATE_LIMITED")
    return t(
      "Слишком много сообщений. Попробуйте через минуту.",
      "Хабарлама тым көп. Бір минуттан кейін қайталаңыз.",
      "Too many messages. Try again in a minute.",
    );
  if (code === "THREAD_CLOSED" || code === "INVALID_STATUS")
    return t(
      "Статус запроса изменился. Обновите диалог.",
      "Сұрау күйі өзгерді. Диалогты жаңартыңыз.",
      "The request status changed. Refresh the conversation.",
    );
  if (code === "MENTOR_UNAVAILABLE")
    return t(
      "Коллега сейчас недоступен для наставничества.",
      "Әріптес қазір тәлімгерлікке қолжетімсіз.",
      "This colleague is currently unavailable for mentoring.",
    );
  if (code === "MENTOR_NOT_ELIGIBLE")
    return t(
      "Коллега больше не подходит для этого запроса. Обновите поиск.",
      "Әріптес енді бұл сұрауға сәйкес келмейді. Іздеуді жаңартыңыз.",
      "This colleague no longer matches this request. Refresh the search.",
    );
  if (code === "NO_TARGET")
    return t(
      "Для поиска по карьерной цели сначала задайте цель в профиле.",
      "Мансаптық мақсат бойынша іздеу үшін профильде мақсатты белгілеңіз.",
      "Set a career goal in your profile to search by target level.",
    );
  if (code === "SKILL_NOT_REQUIRED")
    return t(
      "Этот навык не входит в выбранную карьерную цель. Выберите другой.",
      "Бұл дағды таңдалған мансаптық мақсатқа кірмейді. Басқасын таңдаңыз.",
      "This skill is not part of your career target. Choose another skill.",
    );
  if (
    [
      "UNKNOWN_SKILL",
      "UNKNOWN_EMPLOYEE",
      "SELF_MENTOR",
      "INVALID_REQUEST",
      "INVALID_LIMIT",
      "BODY_TOO_LARGE",
    ].includes(code)
  )
    return t(
      "Проверьте навык, тему и текст запроса.",
      "Дағдыны, тақырыпты және сұрау мәтінін тексеріңіз.",
      "Check the skill, subject and request text.",
    );
  if (code === "NETWORK_ERROR" || code === "REQUEST_TIMEOUT")
    return t(
      "Нет соединения. Попробуйте снова после восстановления связи.",
      "Байланыс жоқ. Байланыс қалпына келгенде қайталаңыз.",
      "Connection lost. Try again when the connection returns.",
    );
  return t(
    "Сервис сообщений временно недоступен. Остальные разделы работают.",
    "Хабарлама қызметі уақытша қолжетімсіз. Басқа бөлімдер жұмыс істейді.",
    "Messaging is temporarily unavailable. Other sections are still available.",
  );
}
