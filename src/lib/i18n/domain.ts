import type {
  Dataset,
  EmployeeView,
  Evidence,
  Recommendation,
} from "@/state/intelligenceAdapter";
import type { Locale } from "./core";

type Words = readonly [ru: string, kk: string, en: string];
const pick = (locale: Locale, words: Words): string =>
  words[locale === "ru" ? 0 : locale === "kk" ? 1 : 2];
const catalog = new Map<string, Words>();
function entry(id: string, en: string, ru: string, kk: string) {
  const words: Words = [ru, kk, en];
  for (const key of [id, en, ru, kk]) catalog.set(key, words);
}

// Display-only dictionary for the supplied catalog. IDs are aliases for labels,
// never rules for eligibility, scoring, replay or simulation.
const skills: readonly (readonly [string, string, string, string])[] = [
  ["SK_PYTHON", "Python", "Python", "Python"],
  ["SK_JAVA", "Java", "Java", "Java"],
  ["SK_SQL", "SQL", "SQL", "SQL"],
  ["SK_API_DESIGN", "API Design", "Проектирование API", "API жобалау"],
  [
    "SK_SYSTEM_DESIGN",
    "System Design",
    "Проектирование систем",
    "Жүйелерді жобалау",
  ],
  ["SK_CLOUD", "Cloud Platforms", "Облачные платформы", "Бұлттық платформалар"],
  [
    "SK_CONTAINERS",
    "Containers & Orchestration",
    "Контейнеры и оркестрация",
    "Контейнерлер және оларды басқару",
  ],
  ["SK_CICD", "CI/CD", "CI/CD", "CI/CD"],
  [
    "SK_APP_SECURITY",
    "Application Security",
    "Безопасность приложений",
    "Қолданбалар қауіпсіздігі",
  ],
  [
    "SK_OBSERVABILITY",
    "Observability",
    "Наблюдаемость систем",
    "Жүйелердің бақылануы",
  ],
  ["SK_JAVASCRIPT", "JavaScript", "JavaScript", "JavaScript"],
  ["SK_TYPESCRIPT", "TypeScript", "TypeScript", "TypeScript"],
  ["SK_REACT", "React", "React", "React"],
  ["SK_HTML_CSS", "HTML & CSS", "HTML и CSS", "HTML және CSS"],
  [
    "SK_WEB_PERFORMANCE",
    "Web Performance",
    "Производительность веб-приложений",
    "Веб-қолданбалардың өнімділігі",
  ],
  [
    "SK_ACCESSIBILITY",
    "Web Accessibility",
    "Доступность веб-интерфейсов",
    "Веб-интерфейстердің қолжетімділігі",
  ],
  [
    "SK_TEST_DESIGN",
    "Test Design",
    "Проектирование тестов",
    "Тестілерді жобалау",
  ],
  [
    "SK_TEST_AUTOMATION",
    "Test Automation",
    "Автоматизация тестирования",
    "Тестілеуді автоматтандыру",
  ],
  ["SK_API_TESTING", "API Testing", "Тестирование API", "API тестілеу"],
  [
    "SK_LOAD_TESTING",
    "Load Testing",
    "Нагрузочное тестирование",
    "Жүктемемен тестілеу",
  ],
  ["SK_STATISTICS", "Statistics", "Статистика", "Статистика"],
  ["SK_AB_TESTING", "A/B Testing", "A/B-тестирование", "A/B тестілеу"],
  [
    "SK_DATA_VIZ",
    "Data Visualization",
    "Визуализация данных",
    "Деректерді көрнекілеу",
  ],
  ["SK_BI_TOOLS", "BI Tools", "Инструменты BI", "BI құралдары"],
  [
    "SK_DATA_MODELING",
    "Data Modeling",
    "Моделирование данных",
    "Деректерді модельдеу",
  ],
  [
    "SK_ML_BASICS",
    "Machine Learning Fundamentals",
    "Основы машинного обучения",
    "Машиналық оқыту негіздері",
  ],
  [
    "SK_PRODUCT_DISCOVERY",
    "Product Discovery",
    "Исследование продуктовых возможностей",
    "Өнім мүмкіндіктерін зерттеу",
  ],
  [
    "SK_ROADMAPPING",
    "Roadmapping & Prioritization",
    "Планирование развития и приоритетов",
    "Дамуды және басымдықтарды жоспарлау",
  ],
  [
    "SK_PRODUCT_ANALYTICS",
    "Product Analytics",
    "Продуктовая аналитика",
    "Өнім аналитикасы",
  ],
  [
    "SK_UX_RESEARCH",
    "UX Research",
    "Исследование пользовательского опыта",
    "Пайдаланушы тәжірибесін зерттеу",
  ],
  [
    "SK_REQUIREMENTS",
    "Requirements Writing",
    "Подготовка требований",
    "Талаптарды әзірлеу",
  ],
  [
    "SK_AGILE",
    "Agile Practices",
    "Гибкие методы работы",
    "Икемді жұмыс әдістері",
  ],
  [
    "SK_PROJECT_MGMT",
    "Project Management",
    "Управление проектами",
    "Жобаларды басқару",
  ],
  [
    "SK_TALENT_ACQUISITION",
    "Talent Acquisition",
    "Подбор персонала",
    "Қызметкерлерді іріктеу",
  ],
  [
    "SK_EMPLOYEE_RELATIONS",
    "Employee Relations",
    "Отношения с сотрудниками",
    "Қызметкерлермен қарым-қатынас",
  ],
  ["SK_LABOR_LAW", "Labor Law", "Трудовое право", "Еңбек құқығы"],
  [
    "SK_HR_ANALYTICS",
    "HR Analytics",
    "Кадровая аналитика",
    "Кадрлық аналитика",
  ],
  [
    "SK_LEARNING_DESIGN",
    "Learning Program Design",
    "Разработка программ обучения",
    "Оқу бағдарламаларын әзірлеу",
  ],
  [
    "SK_COMPENSATION",
    "Compensation & Benefits",
    "Вознаграждение и льготы",
    "Сыйақы және жеңілдіктер",
  ],
  ["SK_PROSPECTING", "Prospecting", "Поиск клиентов", "Клиенттерді іздеу"],
  ["SK_NEGOTIATION", "Negotiation", "Переговоры", "Келіссөздер"],
  ["SK_CRM", "CRM Systems", "CRM-системы", "CRM жүйелері"],
  [
    "SK_ACCOUNT_MGMT",
    "Account Management",
    "Работа с ключевыми клиентами",
    "Негізгі клиенттермен жұмыс",
  ],
  [
    "SK_PRODUCT_KNOWLEDGE",
    "Product Knowledge",
    "Знание продукта",
    "Өнімді білу",
  ],
  [
    "SK_CUSTOMER_SERVICE",
    "Customer Service",
    "Обслуживание клиентов",
    "Клиенттерге қызмет көрсету",
  ],
  [
    "SK_TROUBLESHOOTING",
    "Technical Troubleshooting",
    "Решение технических проблем",
    "Техникалық мәселелерді шешу",
  ],
  ["SK_COMMUNICATION", "Communication", "Коммуникация", "Қарым-қатынас"],
  [
    "SK_PUBLIC_SPEAKING",
    "Public Speaking",
    "Публичные выступления",
    "Көпшілік алдында сөйлеу",
  ],
  [
    "SK_WRITTEN_COMMUNICATION",
    "Written Communication",
    "Письменная коммуникация",
    "Жазбаша қарым-қатынас",
  ],
  [
    "SK_STAKEHOLDER_MGMT",
    "Stakeholder Management",
    "Работа с заинтересованными сторонами",
    "Мүдделі тараптармен жұмыс",
  ],
  ["SK_LEADERSHIP", "Leadership", "Лидерство", "Көшбасшылық"],
  ["SK_MENTORING", "Mentoring", "Наставничество", "Тәлімгерлік"],
  ["SK_FEEDBACK", "Feedback", "Обратная связь", "Кері байланыс"],
  [
    "SK_CONFLICT_RESOLUTION",
    "Conflict Resolution",
    "Разрешение конфликтов",
    "Қақтығыстарды шешу",
  ],
  ["SK_TEAMWORK", "Teamwork", "Командная работа", "Командалық жұмыс"],
  [
    "SK_EMOTIONAL_INTELLIGENCE",
    "Emotional Intelligence",
    "Эмоциональный интеллект",
    "Эмоциялық интеллект",
  ],
  [
    "SK_PROBLEM_SOLVING",
    "Problem Solving",
    "Решение проблем",
    "Мәселелерді шешу",
  ],
  [
    "SK_CRITICAL_THINKING",
    "Critical Thinking",
    "Критическое мышление",
    "Сыни ойлау",
  ],
  [
    "SK_TIME_MANAGEMENT",
    "Time Management",
    "Управление временем",
    "Уақытты басқару",
  ],
  ["SK_ADAPTABILITY", "Adaptability", "Адаптивность", "Бейімделу"],
];
const events: readonly (readonly [string, string, string, string])[] = [
  [
    "EV_001",
    "Information Security Awareness",
    "Основы информационной безопасности",
    "Ақпараттық қауіпсіздік негіздері",
  ],
  [
    "EV_002",
    "Personal Data Protection",
    "Защита персональных данных",
    "Дербес деректерді қорғау",
  ],
  [
    "EV_003",
    "Code of Conduct & Workplace Safety",
    "Деловая этика и безопасность труда",
    "Іскерлік әдеп және еңбек қауіпсіздігі",
  ],
  [
    "EV_004",
    "New Employee Onboarding",
    "Адаптация новых сотрудников",
    "Жаңа қызметкерлерді бейімдеу",
  ],
  [
    "EV_005",
    "System Design Fundamentals",
    "Основы проектирования систем",
    "Жүйелерді жобалау негіздері",
  ],
  [
    "EV_006",
    "Designing High-Load Systems",
    "Проектирование высоконагруженных систем",
    "Жүктемесі жоғары жүйелерді жобалау",
  ],
  [
    "EV_007",
    "Architecture Review Circle",
    "Клуб архитектурных разборов",
    "Архитектураны талдау клубы",
  ],
  [
    "EV_008",
    "Business Writing & Documentation",
    "Деловая переписка и документация",
    "Іскерлік хат алмасу және құжаттама",
  ],
  [
    "EV_009",
    "Cloud Certification Prep",
    "Подготовка к сертификации по облачным технологиям",
    "Бұлттық технологиялар бойынша сертификаттауға дайындық",
  ],
  [
    "EV_010",
    "Kubernetes in Practice",
    "Kubernetes на практике",
    "Kubernetes тәжірибеде",
  ],
  [
    "EV_011",
    "Secure Coding Workshop",
    "Практикум безопасной разработки",
    "Қауіпсіз әзірлеу практикумы",
  ],
  ["EV_012", "Advanced Python", "Продвинутый Python", "Тереңдетілген Python"],
  [
    "EV_013",
    "TypeScript in Depth",
    "Углублённый TypeScript",
    "TypeScript тілін терең меңгеру",
  ],
  [
    "EV_014",
    "Web Performance Deep Dive",
    "Углублённая оптимизация веб-приложений",
    "Веб-қолданбаларды терең оңтайландыру",
  ],
  [
    "EV_015",
    "Web Performance Fundamentals",
    "Основы производительности веб-приложений",
    "Веб-қолданбалар өнімділігінің негіздері",
  ],
  [
    "EV_016",
    "Accessible Interfaces",
    "Доступные интерфейсы",
    "Қолжетімді интерфейстер",
  ],
  [
    "EV_017",
    "React Patterns & State Management",
    "Шаблоны React и управление состоянием",
    "React үлгілері және күйді басқару",
  ],
  [
    "EV_018",
    "Test Automation Bootcamp",
    "Интенсив по автоматизации тестирования",
    "Тестілеуді автоматтандыру бойынша қарқынды курс",
  ],
  [
    "EV_019",
    "API & Performance Testing Workshop",
    "Практикум тестирования API и производительности",
    "API және өнімділікті тестілеу практикумы",
  ],
  [
    "EV_020",
    "Applied Statistics for Analysts",
    "Прикладная статистика для аналитиков",
    "Талдаушыларға арналған қолданбалы статистика",
  ],
  [
    "EV_021",
    "A/B Testing Workshop",
    "Практикум A/B-тестирования",
    "A/B тестілеу практикумы",
  ],
  [
    "EV_022",
    "SQL & BI for Analytics",
    "SQL и BI для аналитики",
    "Аналитикаға арналған SQL және BI",
  ],
  [
    "EV_023",
    "Data Storytelling & Visualization",
    "Истории на основе данных и визуализация",
    "Деректерді түсіндіру және көрнекілеу",
  ],
  [
    "EV_024",
    "Machine Learning for Analysts",
    "Машинное обучение для аналитиков",
    "Талдаушыларға арналған машиналық оқыту",
  ],
  [
    "EV_025",
    "Dimensional Data Modeling",
    "Многомерное моделирование данных",
    "Деректерді көпөлшемді модельдеу",
  ],
  [
    "EV_026",
    "Product Discovery Lab",
    "Лаборатория продуктовых исследований",
    "Өнімді зерттеу зертханасы",
  ],
  [
    "EV_027",
    "Roadmapping & Agile Planning",
    "Дорожные карты и гибкое планирование",
    "Жол карталары және икемді жоспарлау",
  ],
  [
    "EV_028",
    "Labor Law & Employee Relations",
    "Трудовое право и отношения с сотрудниками",
    "Еңбек құқығы және қызметкерлермен қарым-қатынас",
  ],
  [
    "EV_029",
    "People Analytics & Total Rewards",
    "Кадровая аналитика и система вознаграждений",
    "Кадрлық аналитика және сыйақы жүйесі",
  ],
  [
    "EV_030",
    "Structured Interviewing",
    "Структурированное интервью",
    "Құрылымдалған сұхбат",
  ],
  [
    "EV_031",
    "Designing Learning Programs",
    "Проектирование программ обучения",
    "Оқу бағдарламаларын жобалау",
  ],
  [
    "EV_032",
    "Negotiation Masterclass",
    "Мастер-класс по переговорам",
    "Келіссөздер бойынша шеберлік сабағы",
  ],
  [
    "EV_033",
    "Consultative Selling & Prospecting",
    "Консультативные продажи и поиск клиентов",
    "Кеңес беру арқылы сату және клиенттерді іздеу",
  ],
  [
    "EV_034",
    "Handling Difficult Conversations",
    "Как вести сложные разговоры",
    "Күрделі әңгімелерді жүргізу",
  ],
  [
    "EV_035",
    "Technical Troubleshooting Academy",
    "Академия решения технических проблем",
    "Техникалық мәселелерді шешу академиясы",
  ],
  [
    "EV_036",
    "Public Speaking Club",
    "Клуб публичных выступлений",
    "Көпшілік алдында сөйлеу клубы",
  ],
  [
    "EV_037",
    "Mentor Track",
    "Программа наставничества",
    "Тәлімгерлік бағдарламасы",
  ],
  [
    "EV_038",
    "Leadership Foundations",
    "Основы лидерства",
    "Көшбасшылық негіздері",
  ],
  [
    "EV_039",
    "Time & Priority Management",
    "Управление временем и приоритетами",
    "Уақыт пен басымдықтарды басқару",
  ],
  [
    "EV_040",
    "Structured Problem Solving",
    "Системный подход к решению проблем",
    "Мәселелерді жүйелі шешу",
  ],
];
for (const row of [...skills, ...events]) entry(...row);
const otherNames: readonly (readonly [string, string, string])[] = [
  [
    "Backend Engineer",
    "Серверный разработчик",
    "Серверлік жүйелер әзірлеушісі",
  ],
  ["Frontend Engineer", "Разработчик интерфейсов", "Интерфейс әзірлеушісі"],
  ["Data Analyst", "Аналитик данных", "Деректер талдаушысы"],
  ["QA Engineer", "Инженер по качеству", "Сапаны қамтамасыз ету инженері"],
  ["Product Manager", "Менеджер продукта", "Өнім менеджері"],
  [
    "HR Business Partner",
    "Бизнес-партнёр по персоналу",
    "Персонал жөніндегі бизнес-серіктес",
  ],
  ["Sales Manager", "Менеджер по продажам", "Сату менеджері"],
  [
    "Customer Support Specialist",
    "Специалист поддержки клиентов",
    "Клиенттерді қолдау маманы",
  ],
  ["Junior", "Начальный", "Бастапқы"],
  ["Middle", "Средний", "Орта"],
  ["Senior", "Старший", "Аға"],
  ["Lead", "Ведущий", "Жетекші"],
  ["office", "В офисе", "Кеңседе"],
  ["remote", "Удалённо", "Қашықтан"],
  ["hybrid", "Гибридно", "Аралас"],
  ["online", "Онлайн", "Онлайн"],
  ["offline", "Очно", "Офлайн"],
  ["self_paced", "В своём темпе", "Өз қарқынымен"],
  ["completed", "Завершено", "Аяқталды"],
  ["in_progress", "В процессе", "Орындалуда"],
  ["dropped", "Прервано", "Тоқтатылды"],
  ["no_show", "Неявка", "Қатыспады"],
  ["declined", "Отклонено", "Бас тартылды"],
  ["overdue", "Просрочено", "Мерзімі өтті"],
  ["self", "По своей инициативе", "Өз бастамасымен"],
  ["manager", "Назначил руководитель", "Басшы тағайындады"],
  ["hr", "Назначил HR", "HR тағайындады"],
  ["compliance", "Обязательное обучение", "Міндетті оқу"],
  ["onboarding", "Адаптация", "Бейімдеу"],
  ["course", "Курс", "Курс"],
  ["workshop", "Практикум", "Практикум"],
  ["mentoring", "Наставничество", "Тәлімгерлік"],
  ["certification", "Сертификация", "Сертификаттау"],
  ["meetup", "Встреча", "Кездесу"],
  ["hard", "Профессиональные навыки", "Кәсіби дағдылар"],
  ["soft", "Гибкие навыки", "Икемді дағдылар"],
  ["passed", "Пройдено", "Сәтті өтті"],
  ["failed", "Ошибка", "Қате"],
  ["verified", "Ответ проверен", "Жауап тексерілді"],
  ["blocked", "Ответ отклонён", "Жауап қабылданбады"],
  ["timeout", "Время ожидания истекло", "Күту уақыты аяқталды"],
  ["no_key", "Без AI-ключа", "AI кілтінсіз"],
];
for (const [en, ru, kk] of otherNames) entry(en, en, ru, kk);

// A few data codes need a human English label as well.
const englishLabels: Record<string, string> = {
  office: "Office",
  remote: "Remote",
  hybrid: "Hybrid",
  online: "Online",
  offline: "In person",
  self_paced: "Self-paced",
  completed: "Completed",
  in_progress: "In progress",
  dropped: "Dropped",
  no_show: "No-show",
  declined: "Declined",
  overdue: "Overdue",
  self: "Self-initiated",
  manager: "Assigned by manager",
  hr: "Assigned by HR",
  compliance: "Mandatory training",
  onboarding: "Onboarding",
  course: "Course",
  workshop: "Workshop",
  mentoring: "Mentoring",
  certification: "Certification",
  meetup: "Meetup",
  hard: "Professional skills",
  soft: "Interpersonal skills",
  passed: "Passed",
  failed: "Failed",
  verified: "Verified answer",
  blocked: "Rejected answer",
  timeout: "Timed out",
  no_key: "No AI key",
};
for (const [code, en] of Object.entries(englishLabels)) {
  const words = catalog.get(code)!;
  entry(code, en, words[0], words[1]);
}

/** Unknown imported names and personal names stay verbatim; source objects are never changed. */
export function catalogName(value: string, locale: Locale): string {
  const found = catalog.get(value);
  return found ? pick(locale, found) : value;
}

const factors: Record<string, Words> = {
  targetGapImpact: [
    "Вклад в целевые навыки",
    "Мақсатты дағдыларға үлесі",
    "Target skill impact",
  ],
  engagementFit: ["История участия", "Қатысу тарихы", "Participation history"],
  feasibility: [
    "Доступность активности",
    "Іс-шараның қолжетімділігі",
    "Activity feasibility",
  ],
  goalAlignment: ["Связь с целью", "Мақсатқа сәйкестігі", "Goal alignment"],
  pathDiversity: [
    "Разнообразие пути",
    "Даму жолының әртүрлілігі",
    "Path diversity",
  ],
};

const messages = new Map<string, Words>();
function message(source: string, ru: string, kk: string, en: string) {
  const words: Words = [ru, kk, en];
  for (const key of new Set([source, ru, kk, en])) messages.set(key, words);
}
const fixedMessages: readonly (readonly [
  source: string,
  ru: string,
  kk: string,
  en: string,
])[] = [
  [
    "Не удалось выполнить действие",
    "Не удалось выполнить действие",
    "Әрекетті орындау мүмкін болмады",
    "Could not complete the action",
  ],
  [
    "Данные загружены. Изменения сохраняются только в текущей сессии.",
    "Данные загружены. Изменения сохраняются только в текущей сессии.",
    "Деректер жүктелді. Өзгерістер тек ағымдағы сессияда сақталады.",
    "Data loaded. Changes last only for this session.",
  ],
  [
    "Активность завершена. Навыки и рекомендации пересчитаны.",
    "Активность завершена. Навыки и рекомендации пересчитаны.",
    "Іс-шара аяқталды. Дағдылар мен ұсынымдар қайта есептелді.",
    "Activity completed. Skills and recommendations updated.",
  ],
  [
    "Движок не применил журнал завершений. Изменение отменено.",
    "Движок не применил журнал завершений. Изменение отменено.",
    "Есептеу жүйесі аяқтау журналын қолданбады. Өзгеріс жойылды.",
    "The engine did not apply the completion log. The change was cancelled.",
  ],
  [
    "Обязательное мероприятие: не является добровольной рекомендацией",
    "Обязательное мероприятие: не является добровольной рекомендацией",
    "Міндетті іс-шара: ерікті ұсынымға кірмейді",
    "Mandatory activity: excluded from voluntary recommendations",
  ],
  [
    "Не соответствует текущей роли или карьерной цели",
    "Не соответствует текущей роли или карьерной цели",
    "Қазіргі рөлге немесе мансаптық мақсатқа сәйкес келмейді",
    "Does not match the current role or career goal",
  ],
  [
    "Не соответствует текущему или целевому грейду",
    "Не соответствует текущему или целевому грейду",
    "Қазіргі немесе мақсатты деңгейге сәйкес келмейді",
    "Does not match the current or target grade",
  ],
  [
    "Не выполнены требования к навыкам для участия",
    "Не выполнены требования к навыкам для участия",
    "Қатысу үшін қажетті дағдылар талаптары орындалмаған",
    "Required participation skills are not yet met",
  ],
  [
    "Активность уже завершена",
    "Активность уже завершена",
    "Іс-шара бұрын аяқталған",
    "Activity already completed",
  ],
  [
    "Активность уже выполняется",
    "Активность уже выполняется",
    "Іс-шара қазір орындалуда",
    "Activity already in progress",
  ],
  [
    "Нет доступной сессии после даты среза",
    "Нет доступной сессии после даты среза",
    "Деректер күніне сәйкес алдағы сессия жоқ",
    "No session available on or after the snapshot date",
  ],
  [
    "Не закрывает разрыв до карьерной цели",
    "Не закрывает разрыв до карьерной цели",
    "Мансаптық мақсатқа дейінгі дағды алшақтығын қысқартпайды",
    "Does not close a gap towards the career goal",
  ],
  [
    "Некорректный уровень навыка (допустимо 0–5)",
    "Некорректный уровень навыка (допустимо 0–5)",
    "Дағды деңгейі қате (рұқсат етілгені: 0–5)",
    "Invalid skill level (allowed: 0–5)",
  ],
  [
    "Активность содержит повторяющийся навык",
    "Активность содержит повторяющийся навык",
    "Іс-шарада бір дағды қайталанған",
    "The activity contains a duplicate skill",
  ],
  [
    "Некорректные gain/max_level",
    "Некорректный прирост или предел навыка",
    "Дағды өсімі немесе шекті деңгейі қате",
    "Invalid skill gain or maximum level",
  ],
  [
    "Для сотрудника не задана карьерная цель",
    "Для сотрудника не задана карьерная цель",
    "Қызметкердің мансаптық мақсаты белгіленбеген",
    "No career goal is set for this employee",
  ],
  [
    "Обязательные мероприятия не входят в рекомендации",
    "Обязательные мероприятия не входят в рекомендации",
    "Міндетті іс-шаралар ұсынымдарға кірмейді",
    "Mandatory activities are excluded from recommendations",
  ],
  [
    "Активность больше не доступна; обновите рекомендации",
    "Активность больше не доступна; обновите рекомендации",
    "Іс-шара енді қолжетімсіз; ұсынымдарды жаңартыңыз",
    "Activity is no longer available; refresh recommendations",
  ],
  [
    "Активность не найдена",
    "Активность не найдена",
    "Іс-шара табылмады",
    "Activity not found",
  ],
  [
    "Активность не увеличивает навыки",
    "Активность не увеличивает навыки",
    "Іс-шара дағдыларды арттырмайды",
    "The activity does not increase any skills",
  ],
  [
    "Intelligence adapter is not connected",
    "Движок рекомендаций не подключён",
    "Ұсынымдар жүйесі қосылмаған",
    "Recommendation engine is not connected",
  ],
  [
    "Подключите адаптер Intelligence участника A. Импорт исходной схемы пока недоступен.",
    "Подключите движок рекомендаций. Импорт пока недоступен.",
    "Ұсынымдар жүйесін қосыңыз. Импорт әзірге қолжетімсіз.",
    "Connect the recommendation engine. Import is not available yet.",
  ],
  [
    "NormalizedDataset отсутствует в источнике адаптера",
    "В источнике адаптера нет нормализованных данных",
    "Адаптер көзінде қалыпқа келтірілген деректер жоқ",
    "The adapter source has no normalized dataset",
  ],
  [
    "Engine returned no readiness for a planned target",
    "Движок не вернул готовность для цели плана",
    "Жүйе жоспар мақсатына дайындықты қайтармады",
    "The engine returned no readiness for the planned target",
  ],
  ["Ошибка импорта", "Ошибка импорта", "Импорт қатесі", "Import error"],
  ["Invalid JSON", "Некорректный JSON", "JSON пішімі қате", "Invalid JSON"],
  ["Unknown skill", "Неизвестный навык", "Белгісіз дағды", "Unknown skill"],
  [
    "Unknown employee",
    "Неизвестный сотрудник",
    "Белгісіз қызметкер",
    "Unknown employee",
  ],
  [
    "Unknown event",
    "Неизвестная активность",
    "Белгісіз іс-шара",
    "Unknown activity",
  ],
  [
    "Unknown manager",
    "Неизвестный руководитель",
    "Белгісіз басшы",
    "Unknown manager",
  ],
  [
    "Unknown role/grade profile",
    "Неизвестный профиль роли и грейда",
    "Рөл мен деңгей бейіні белгісіз",
    "Unknown role/grade profile",
  ],
  [
    "Unknown target role/grade profile",
    "Неизвестный профиль целевой роли и грейда",
    "Мақсатты рөл мен деңгей бейіні белгісіз",
    "Unknown target role/grade profile",
  ],
  [
    "Critical skill must exist in required skills",
    "Критичный навык должен входить в требуемые навыки",
    "Маңызды дағды талап етілетін дағдылар тізімінде болуы керек",
    "A critical skill must be included in the required skills",
  ],
  [
    "Dataset files use different snapshot dates",
    "Даты среза в файлах не совпадают",
    "Файлдардағы деректер күндері сәйкес келмейді",
    "Dataset files have different snapshot dates",
  ],
  [
    "Expected ISO date YYYY-MM-DD",
    "Ожидается дата в формате ГГГГ-ММ-ДД",
    "Күн ЖЖЖЖ-АА-КК пішімінде болуы керек",
    "Expected an ISO date in YYYY-MM-DD format",
  ],
  [
    "Не удалось прочитать файлы. Выберите их повторно.",
    "Не удалось прочитать файлы. Выберите их повторно.",
    "Файлдарды оқу мүмкін болмады. Оларды қайта таңдаңыз.",
    "Could not read the files. Select them again.",
  ],
  [
    "Unable to auto-detect delimiting character; defaulted to ','",
    "Не удалось определить разделитель; использована запятая",
    "Бөлгіш анықталмады; үтір қолданылды",
    "Could not detect the delimiter; using a comma",
  ],
  [
    "Quoted field unterminated",
    "В поле не закрыты кавычки",
    "Өрістегі тырнақша жабылмаған",
    "Unterminated quoted field",
  ],
  [
    "Trailing quote on quoted field is malformed",
    "Некорректная закрывающая кавычка поля",
    "Өрістің жабушы тырнақшасы қате",
    "Malformed closing quote in a quoted field",
  ],
  ["No target", "Цель не задана", "Мақсат белгіленбеген", "No target"],
  ["unknown", "Неизвестно", "Белгісіз", "Unknown"],
  [
    "Invalid measurement counts",
    "Некорректное число измерений",
    "Өлшемдер саны қате",
    "Invalid measurement counts",
  ],
  [
    "Duplicate evaluation case IDs",
    "Повторяются идентификаторы проверок",
    "Тексеру идентификаторлары қайталанады",
    "Duplicate evaluation case IDs",
  ],
  [
    "Invalid latency",
    "Некорректное время выполнения",
    "Орындау уақыты қате",
    "Invalid execution time",
  ],
  [
    "Evaluation timeout",
    "Время проверки истекло",
    "Тексеру уақыты аяқталды",
    "Evaluation timed out",
  ],
  [
    "Проверка завершилась ошибкой или превысила время ожидания.",
    "Проверка завершилась ошибкой или превысила время ожидания.",
    "Тексеру қатемен аяқталды немесе күту уақытынан асып кетті.",
    "The check failed or exceeded its time limit.",
  ],
  [
    "Unknown recommended event",
    "Рекомендована неизвестная активность",
    "Белгісіз іс-шара ұсынылды",
    "Unknown recommended activity",
  ],
  [
    "Missing gain evidence",
    "Отсутствует обоснование прироста навыка",
    "Дағды өсімінің негіздемесі жоқ",
    "Skill gain evidence is missing",
  ],
  [
    "Unknown evidence reference",
    "Ссылка на неизвестное доказательство",
    "Белгісіз дәлелге сілтеме",
    "Unknown evidence reference",
  ],
  [
    "Duplicate candidate ID",
    "Повторяется идентификатор кандидата",
    "Үміткер идентификаторы қайталанады",
    "Duplicate candidate ID",
  ],
  [
    "Duplicate evidence ID",
    "Повторяется идентификатор доказательства",
    "Дәлел идентификаторы қайталанады",
    "Duplicate evidence ID",
  ],
  [
    "At least three distinct factors required",
    "Требуется не менее трёх разных факторов",
    "Кемінде үш түрлі фактор қажет",
    "At least three distinct factors are required",
  ],
  [
    "Gain exceeds skill cap",
    "Прирост превышает предел навыка",
    "Өсім дағдының шекті деңгейінен асады",
    "Gain exceeds the skill cap",
  ],
  ["AbortError", "Запрос отменён", "Сұрау тоқтатылды", "Request cancelled"],
  [
    "This operation was aborted",
    "Операция отменена",
    "Әрекет тоқтатылды",
    "Operation cancelled",
  ],
  [
    "The operation was aborted.",
    "Операция отменена.",
    "Әрекет тоқтатылды.",
    "Operation cancelled.",
  ],
  [
    "The user aborted a request.",
    "Запрос отменён.",
    "Сұрау тоқтатылды.",
    "Request cancelled.",
  ],
  [
    "Failed to fetch",
    "Не удалось получить ответ сервера",
    "Сервер жауабын алу мүмкін болмады",
    "Could not reach the server",
  ],
  [
    "fetch failed",
    "Не удалось получить ответ сервера",
    "Сервер жауабын алу мүмкін болмады",
    "Could not reach the server",
  ],
  [
    "INVALID_OUTPUT_SCHEMA",
    "Формат ответа не прошёл проверку",
    "Жауап пішімі тексеруден өтпеді",
    "The response format failed validation",
  ],
  [
    "RANKING_OR_ALLOWLIST_CHANGED",
    "Ответ изменяет порядок или разрешённый список",
    "Жауап ретті немесе рұқсат етілген тізімді өзгертеді",
    "The response changes the ranking or allowlist",
  ],
  [
    "MISSING_OR_DUPLICATE_REASON",
    "Объяснение отсутствует или повторяется",
    "Түсіндірме жоқ немесе қайталанады",
    "An explanation is missing or duplicated",
  ],
  [
    "UNKNOWN_CANDIDATE",
    "Неизвестный кандидат",
    "Белгісіз үміткер",
    "Unknown candidate",
  ],
  [
    "DUPLICATE_EVIDENCE",
    "Повторяющееся доказательство",
    "Қайталанатын дәлел",
    "Duplicate evidence",
  ],
  [
    "UNKNOWN_EVIDENCE",
    "Неизвестное доказательство",
    "Белгісіз дәлел",
    "Unknown evidence",
  ],
  [
    "INSUFFICIENT_FACTORS",
    "Недостаточно подтверждённых факторов",
    "Расталған факторлар жеткіліксіз",
    "Too few verified factors",
  ],
  [
    "UNSUPPORTED_CLAIM_OR_CHANGED_FACT",
    "Неподтверждённый вывод или изменённый факт",
    "Расталмаған қорытынды немесе өзгертілген факт",
    "An unsupported claim or an altered fact",
  ],
  [
    "REVIEW_ROUTE_UNAVAILABLE",
    "Сервис проверки недоступен",
    "Тексеру қызметі қолжетімсіз",
    "The review service is unavailable",
  ],
  [
    "PROVIDER_UNAVAILABLE",
    "AI-сервис недоступен",
    "AI қызметі қолжетімсіз",
    "The AI service is unavailable",
  ],
];
for (const row of fixedMessages) message(...row);

const auditMessages: readonly (readonly [string, string, string, string])[] = [
  [
    "Missing recomputed employee view",
    "Отсутствует обновлённый профиль сотрудника",
    "Қызметкердің жаңартылған бейіні жоқ",
    "The updated employee view is missing",
  ],
  [
    "Duplicate completion ledger ID",
    "Повторяется идентификатор завершения",
    "Аяқтау идентификаторы қайталанады",
    "Duplicate completion log ID",
  ],
  [
    "Unknown ledger reference",
    "В журнале есть неизвестная ссылка",
    "Журналда белгісіз сілтеме бар",
    "The log contains an unknown reference",
  ],
  [
    "Unknown event in normalized history",
    "В истории есть неизвестная активность",
    "Тарихта белгісіз іс-шара бар",
    "The history contains an unknown activity",
  ],
  [
    "Duplicate employee IDs in analytics projection",
    "В аналитике повторяются идентификаторы сотрудников",
    "Аналитикада қызметкер идентификаторлары қайталанады",
    "Duplicate employee IDs in the analytics data",
  ],
  [
    "History references an unknown employee",
    "История ссылается на неизвестного сотрудника",
    "Тарих белгісіз қызметкерге сілтеме жасайды",
    "History references an unknown employee",
  ],
  [
    "Wrap Employee, HR and Trust in the same EmployeeStoreProvider",
    "Подключите все разделы к общему состоянию приложения",
    "Барлық бөлімді қолданбаның ортақ күйіне қосыңыз",
    "Connect all sections to the shared application state",
  ],
  [
    "Hard filters и критичные разрывы · проверяемое состояние",
    "Ограничения участия и критичные разрывы",
    "Қатысу шектеулері және маңызды алшақтықтар",
    "Eligibility filters and critical skill gaps",
  ],
  [
    "History replay против независимого пересчёта",
    "Учёт истории: независимая проверка",
    "Тарихты есепке алу: тәуелсіз тексеру",
    "History replay: independent verification",
  ],
  [
    "Прогноз активности не снижает готовность",
    "Прогноз активности не снижает готовность",
    "Іс-шара болжамы дайындықты төмендетпейді",
    "Activity projections do not reduce readiness",
  ],
  [
    "Все прогнозы сохраняют или повышают readiness с учётом округления.",
    "Все прогнозы сохраняют или повышают готовность с учётом округления.",
    "Дөңгелектеуді ескергенде, барлық болжам дайындықты сақтайды немесе арттырады.",
    "All projections maintain or increase readiness, allowing for rounding.",
  ],
  [
    "Один локальный вызов recommendation engine; без сети и LLM.",
    "Один локальный расчёт рекомендации, без сети и AI.",
    "Ұсыным бір рет жергілікті есептеледі, желі мен AI қолданылмайды.",
    "One local recommendation calculation, without network access or AI.",
  ],
  [
    "Факты и ссылки на evidence подтверждены",
    "Факты и ссылки на доказательства подтверждены",
    "Фактілер мен дәлел сілтемелері расталды",
    "Facts and evidence references are verified",
  ],
  [
    "Пять факторных оценок сверены с исходным evidence.",
    "Пять факторных оценок сверены с исходными доказательствами.",
    "Бес фактордың бағасы бастапқы дәлелдермен салыстырылды.",
    "Five factor scores were checked against the source evidence.",
  ],
  [
    "Неизвестная активность отклоняется",
    "Неизвестная активность отклоняется",
    "Белгісіз іс-шара қабылданбайды",
    "Unknown activities are rejected",
  ],
  [
    "Ответ вне allowlist не принимается.",
    "Ответ вне разрешённого списка не принимается.",
    "Рұқсат етілген тізімнен тыс жауап қабылданбайды.",
    "Answers outside the allowlist are rejected.",
  ],
  [
    "Изменённое число отклоняется",
    "Изменённое число отклоняется",
    "Өзгертілген сан қабылданбайды",
    "Altered numbers are rejected",
  ],
  [
    "Числовое утверждение должно совпадать с конкретным фактом.",
    "Числовое утверждение должно совпадать с конкретным фактом.",
    "Сандық тұжырым нақты фактіге сәйкес келуі керек.",
    "A numeric claim must match its specific source fact.",
  ],
  [
    "Неподтверждённая фраза отклоняется",
    "Неподтверждённая фраза отклоняется",
    "Расталмаған тұжырым қабылданбайды",
    "Unsupported statements are rejected",
  ],
  [
    "Произвольные выводы модели не попадают в объяснение.",
    "Произвольные выводы модели не попадают в объяснение.",
    "Модельдің негізсіз қорытындылары түсіндірмеге кірмейді.",
    "Unsupported model conclusions are excluded from explanations.",
  ],
  [
    "Инструкции в описании не уходят модели",
    "Инструкции из описаний не передаются модели",
    "Сипаттамадағы нұсқаулар модельге берілмейді",
    "Instructions in descriptions are not sent to the model",
  ],
  [
    "Входная strict-схема запрещает description, raw profile и history.",
    "Схема входа запрещает описания, исходные профили и историю.",
    "Кіріс схемасы сипаттамаларды, бастапқы бейіндерді және тарихты қабылдамайды.",
    "The input schema rejects descriptions, raw profiles and history.",
  ],
  [
    "Отказ провайдера сохраняет рекомендации",
    "Рекомендации сохраняются при отказе AI",
    "AI істемесе де, ұсынымдар сақталады",
    "Recommendations remain available if AI fails",
  ],
  [
    "Шаблонное объяснение остаётся доступно.",
    "Расчётное объяснение остаётся доступно.",
    "Есептеу негізіндегі түсіндірме қолжетімді болып қалады.",
    "The deterministic explanation remains available.",
  ],
  [
    "Зависший провайдер ограничен таймаутом",
    "Ожидание AI ограничено по времени",
    "AI жауабын күту уақыты шектеулі",
    "Waiting for AI has a time limit",
  ],
  [
    "После таймаута используется fallback.",
    "После таймаута используется расчётное объяснение.",
    "Күту уақыты аяқталса, есептеу негізіндегі түсіндірме беріледі.",
    "After a timeout, the deterministic explanation is used.",
  ],
  [
    "Язык выбран из preferred_language, ranking сохранён.",
    "Язык соответствует запросу; порядок рекомендаций сохранён.",
    "Тіл сұрауға сәйкес келеді; ұсынымдар реті сақталды.",
    "The language matches the request; recommendation order is preserved.",
  ],
  [
    "Рекомендации, target и заданные effective skills совпадают с размеченным эталоном.",
    "Рекомендации, цель и текущие навыки совпадают с эталоном.",
    "Ұсынымдар, мақсат және ағымдағы дағдылар эталонға сәйкес келеді.",
    "Recommendations, target and effective skills match the labelled reference.",
  ],
  [
    "Обнаружено расхождение с размеченными ожиданиями: проверьте eligibility, replay, target и top-1.",
    "Есть расхождение с эталоном: проверьте ограничения, учёт истории, цель и первый шаг.",
    "Эталонмен айырмашылық бар: шектеулерді, тарихты есепке алуды, мақсатты және бірінші қадамды тексеріңіз.",
    "The reference does not match: check eligibility, history replay, target and the top recommendation.",
  ],
];
for (const row of auditMessages) message(...row);

function replaceKnownCatalog(
  value: string,
  locale: Locale,
  dataset?: Dataset,
): string {
  const aliases = new Map(catalog);
  // Prefer the actual imported label when an ID was reused by a custom dataset.
  for (const item of dataset?.skills ?? [])
    aliases.set(item.id, [
      catalogName(item.name, "ru"),
      catalogName(item.name, "kk"),
      catalogName(item.name, "en"),
    ]);
  for (const item of dataset?.activities ?? [])
    aliases.set(item.id, [
      catalogName(item.title, "ru"),
      catalogName(item.title, "kk"),
      catalogName(item.title, "en"),
    ]);
  const keys = [...aliases.keys()].sort((a, b) => b.length - a.length);
  const escaped = keys.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // One pass prevents translating newly inserted text again (e.g. Mentoring).
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])(?:${escaped.join("|")})(?![\\p{L}\\p{N}_])`,
    "gu",
  );
  return value.replace(pattern, (word) => pick(locale, aliases.get(word)!));
}

const typeNames: Record<string, Words> = {
  string: ["строка", "жол", "string"],
  number: ["число", "сан", "number"],
  int: ["целое число", "бүтін сан", "integer"],
  integer: ["целое число", "бүтін сан", "integer"],
  boolean: ["логическое значение", "логикалық мән", "boolean"],
  array: ["массив", "массив", "array"],
  object: ["объект", "объект", "object"],
  undefined: ["значение отсутствует", "мән жоқ", "missing value"],
  null: ["пустое значение", "бос мән", "null"],
  NaN: ["не число", "сан емес", "not a number"],
};
const typeName = (value: string, locale: Locale) =>
  typeNames[value] ? pick(locale, typeNames[value]) : value;

/** Translate the application's known messages; preserve user-authored content and numeric tokens. */
export function localizeMessage(value: string, locale: Locale): string {
  const exact = messages.get(value);
  if (exact) return pick(locale, exact);
  if (catalog.has(value)) return catalogName(value, locale);
  let match: RegExpMatchArray | null;
  if ((match = value.match(/^Invalid input: expected (\w+), received (\w+)$/)))
    return pick(locale, [
      `Ожидается ${typeName(match[1], locale)}; получено: ${typeName(match[2], locale)}`,
      `Күтілетіні: ${typeName(match[1], locale)}; алынғаны: ${typeName(match[2], locale)}`,
      `Expected ${typeName(match[1], locale)}; received ${typeName(match[2], locale)}`,
    ]);
  if (
    (match = value.match(
      /^Too (small|big): expected (\w+) to (?:be|have) ([<>]=?)([\d.]+)(.*)$/,
    ))
  ) {
    const [, size, type, sign, limit, suffix] = match;
    const unit = suffix.includes("characters")
      ? pick(locale, ["символов", "таңба", "characters"])
      : suffix.includes("items")
        ? pick(locale, ["элементов", "элемент", "items"])
        : "";
    return pick(locale, [
      `${size === "small" ? "Слишком мало" : "Слишком много"}: ${typeName(type, locale)} ${sign}${limit}${unit ? ` ${unit}` : ""}`,
      `${size === "small" ? "Тым аз" : "Тым көп"}: ${typeName(type, locale)} ${sign}${limit}${unit ? ` ${unit}` : ""}`,
      `Too ${size}: ${typeName(type, locale)} ${sign}${limit}${unit ? ` ${unit}` : ""}`,
    ]);
  }
  if ((match = value.match(/^Invalid option: expected one of (.+)$/)))
    return pick(locale, [
      `Допустимые значения: ${match[1]}`,
      `Рұқсат етілген мәндер: ${match[1]}`,
      `Allowed values: ${match[1]}`,
    ]);
  if ((match = value.match(/^Invalid input: expected (.+)$/)))
    return pick(locale, [
      `Ожидается: ${typeName(match[1], locale)}`,
      `Күтілетіні: ${typeName(match[1], locale)}`,
      `Expected: ${typeName(match[1], locale)}`,
    ]);
  if ((match = value.match(/^Duplicate identifier: (.+)$/)))
    return pick(locale, [
      `Повторяющийся идентификатор: ${match[1]}`,
      `Қайталанатын идентификатор: ${match[1]}`,
      `Duplicate identifier: ${match[1]}`,
    ]);
  if ((match = value.match(/^Unknown employee: (.+)$/)))
    return pick(locale, [
      `Неизвестный сотрудник: ${match[1]}`,
      `Белгісіз қызметкер: ${match[1]}`,
      `Unknown employee: ${match[1]}`,
    ]);
  if ((match = value.match(/^Missing role profile for career goal of (.+)$/)))
    return pick(locale, [
      `Нет профиля роли для карьерной цели ${match[1]}`,
      `${match[1]} мансаптық мақсатына арналған рөл бейіні жоқ`,
      `No role profile exists for the career goal of ${match[1]}`,
    ]);
  if ((match = value.match(/^Missing next-grade profile for (.+)$/))) {
    const target = replaceKnownCatalog(match[1], locale);
    return pick(locale, [
      `Нет профиля следующего грейда: ${target}`,
      `Келесі деңгей бейіні жоқ: ${target}`,
      `Missing next-grade profile: ${target}`,
    ]);
  }
  if ((match = value.match(/^Некорректный уровень (.+): (.+)$/)))
    return pick(locale, [
      `Некорректный уровень ${match[1]}: ${match[2]}`,
      `${match[1]} деңгейі қате: ${match[2]}`,
      `Invalid level for ${match[1]}: ${match[2]}`,
    ]);
  if (
    (match = value.match(
      /^Career Quest dataset validation failed with (\d+) issue\(s\)$/,
    ))
  )
    return pick(locale, [
      `Ошибок проверки данных Career Quest: ${match[1]}`,
      `Career Quest деректерін тексеру қателері: ${match[1]}`,
      `Career Quest data validation errors: ${match[1]}`,
    ]);
  if (
    (match = value.match(
      /^Too (many|few) fields: expected (\d+) fields but parsed (\d+)$/,
    ))
  )
    return pick(locale, [
      `Число полей не совпадает: ожидалось ${match[2]}, прочитано ${match[3]}`,
      `Өрістер саны сәйкес емес: күтілгені ${match[2]}, оқылғаны ${match[3]}`,
      `Field count mismatch: expected ${match[2]}, parsed ${match[3]}`,
    ]);
  if ((match = value.match(/^Объяснение без ключа: (ru|kk|en)$/)))
    return pick(locale, [
      `Объяснение без ключа: ${match[1]}`,
      `Кілтсіз түсіндірме: ${match[1]}`,
      `Explanation without a key: ${match[1]}`,
    ]);
  if ((match = value.match(/^Время рекомендации · (.+)$/)))
    return pick(locale, [
      `Время рекомендации · ${match[1]}`,
      `Ұсынымды есептеу уақыты · ${match[1]}`,
      `Recommendation time · ${match[1]}`,
    ]);
  if (
    (match = value.match(
      /^(\d+) рекомендаций; (\d+) нарушений\. Hard filters проверены публичной eligibility-функцией A\. Весь пакет: (\d+) мс; это не latency одного профиля\.$/,
    ))
  )
    return pick(locale, [
      `${match[1]} рекомендаций; ${match[2]} нарушений. Ограничения проверены функцией ядра. Весь набор: ${match[3]} мс; это время всех профилей.`,
      `${match[1]} ұсыным; ${match[2]} бұзушылық. Шектеулер негізгі жүйе функциясымен тексерілді. Барлық бейін: ${match[3]} мс.`,
      `${match[1]} recommendations; ${match[2]} violations. Filters checked with the core eligibility function. Full batch: ${match[3]} ms, across all profiles.`,
    ]);
  if (
    (match = value.match(
      /^Совпало (\d+) из (\d+) уровней навыков\. Эталон использует history, review date и cap, не функцию replay ядра\.$/,
    ))
  )
    return pick(locale, [
      `Совпало ${match[1]} из ${match[2]} уровней навыков. Независимый эталон использует историю, дату оценки и пределы навыков.`,
      `${match[2]} дағды деңгейінің ${match[1]} сәйкес келді. Тәуелсіз эталон тарихты, бағалау күнін және дағды шектерін қолданады.`,
      `${match[1]} of ${match[2]} skill levels match. The independent reference uses history, review dates and skill caps.`,
    ]);
  if (
    (match = value.match(
      /^Снижение readiness в (\d+) рекомендациях: (.+)\. Проверьте cap в projectedSkills ядра A\.$/,
    ))
  )
    return pick(locale, [
      `Готовность снижается в ${match[1]} рекомендациях: ${match[2]}. Проверьте пределы навыков в прогнозе ядра.`,
      `${match[1]} ұсынымда дайындық төмендейді: ${match[2]}. Негізгі жүйе болжамындағы дағды шектерін тексеріңіз.`,
      `Readiness decreases in ${match[1]} recommendations: ${match[2]}. Check skill caps in the core projection.`,
    ]);
  // JSON parser messages retain input excerpts, positions, line and column numbers.
  const jsonPhrases: readonly (readonly [string, Words])[] = [
    [
      "Expected ',' or '}' after property value in JSON",
      [
        "В JSON после значения ожидается ',' или '}'",
        "JSON ішінде мәннен кейін ',' немесе '}' күтіледі",
        "Expected ',' or '}' after property value in JSON",
      ],
    ],
    [
      "Expected ',' or ']' after array element in JSON",
      [
        "В JSON после элемента массива ожидается ',' или ']'",
        "JSON ішінде массив элементінен кейін ',' немесе ']' күтіледі",
        "Expected ',' or ']' after array element in JSON",
      ],
    ],
    [
      "Expected ':' after property name in JSON",
      [
        "В JSON после имени свойства ожидается ':'",
        "JSON ішінде қасиет атауынан кейін ':' күтіледі",
        "Expected ':' after property name in JSON",
      ],
    ],
    [
      "Bad control character in string literal in JSON",
      [
        "Недопустимый управляющий символ в строке JSON",
        "JSON жолында рұқсат етілмеген басқару таңбасы бар",
        "Bad control character in a JSON string",
      ],
    ],
    [
      "Bad escaped character in JSON",
      [
        "Некорректный экранированный символ в JSON",
        "JSON ішінде экрандалған таңба қате",
        "Bad escaped character in JSON",
      ],
    ],
    [
      "Bad Unicode escape in JSON",
      [
        "Некорректная последовательность Unicode в JSON",
        "JSON ішіндегі Unicode тізбегі қате",
        "Bad Unicode escape in JSON",
      ],
    ],
    [
      "No number after minus sign in JSON",
      [
        "В JSON после знака минус отсутствует число",
        "JSON ішінде минус таңбасынан кейін сан жоқ",
        "No number after a minus sign in JSON",
      ],
    ],
    [
      "Unterminated fractional number in JSON",
      [
        "Незавершённое дробное число в JSON",
        "JSON ішінде бөлшек сан аяқталмаған",
        "Unterminated fractional number in JSON",
      ],
    ],
    [
      "Exponent part is missing a number in JSON",
      [
        "В JSON отсутствует число в показателе степени",
        "JSON ішінде дәреже көрсеткіші жоқ",
        "The exponent is missing a number in JSON",
      ],
    ],
    [
      "Expected property name or '}' in JSON",
      [
        "В JSON ожидается имя свойства или '}'",
        "JSON ішінде қасиет атауы немесе '}' күтіледі",
        "Expected property name or '}' in JSON",
      ],
    ],
    [
      "Expected double-quoted property name in JSON",
      [
        "В JSON ожидается имя свойства в двойных кавычках",
        "JSON ішінде қос тырнақшадағы қасиет атауы күтіледі",
        "Expected double-quoted property name in JSON",
      ],
    ],
    [
      "Unexpected end of JSON input",
      [
        "Неожиданный конец JSON",
        "JSON күтпеген жерден аяқталды",
        "Unexpected end of JSON input",
      ],
    ],
    [
      "Unexpected non-whitespace character after JSON",
      [
        "Лишний символ после JSON",
        "JSON соңында артық таңба бар",
        "Unexpected non-whitespace character after JSON",
      ],
    ],
    [
      "Unterminated string in JSON",
      [
        "Незакрытая строка в JSON",
        "JSON ішінде жабылмаған жол бар",
        "Unterminated string in JSON",
      ],
    ],
    [
      "Unexpected token",
      ["Неожиданный символ", "Күтпеген таңба", "Unexpected token"],
    ],
    [
      "is not valid JSON",
      ["не является корректным JSON", "дұрыс JSON емес", "is not valid JSON"],
    ],
    ["at position", ["в позиции", "орнында", "at position"]],
  ];
  if (
    /^(?:Expected|Unexpected|Unterminated|Bad |No number|Exponent)/.test(
      value,
    ) &&
    /JSON|Unexpected token/.test(value)
  ) {
    // Engine versions can introduce new parser messages. Never leave an unknown
    // English diagnostic next to translated location labels.
    const knownDiagnostic = jsonPhrases.some(
      ([source]) => source !== "at position" && value.startsWith(source),
    );
    if (!knownDiagnostic) {
      if (locale === "en") return value;
      const locations = [
        [
          value.match(/\bat position (\d+)/)?.[1],
          pick(locale, ["позиция", "орны", "position"]),
        ],
        [
          value.match(/\bline (\d+)/)?.[1],
          pick(locale, ["строка", "жол", "line"]),
        ],
        [
          value.match(/\bcolumn (\d+)/)?.[1],
          pick(locale, ["столбец", "баған", "column"]),
        ],
      ]
        .filter(([number]) => number !== undefined)
        .map(([number, label]) => `${label} ${number}`);
      return (
        pick(locale, [
          "Ошибка формата JSON. Проверьте скобки, кавычки и запись значений",
          "JSON пішімі қате. Жақшаларды, тырнақшаларды және мәндердің жазылуын тексеріңіз",
          "Invalid JSON format. Check brackets, quotes and value syntax",
        ]) + (locations.length ? `: ${locations.join(" · ")}.` : ".")
      );
    }
    let result = value;
    for (const [source, words] of jsonPhrases)
      result = result.replace(source, pick(locale, words));
    return result
      .replace(/\bline(?=\s+\d)/g, pick(locale, ["строка", "жол", "line"]))
      .replace(
        /\bcolumn(?=\s+\d)/g,
        pick(locale, ["столбец", "баған", "column"]),
      );
  }
  // A validator may add a new English diagnostic. Keep its concrete numeric
  // bounds / quoted allowed values, but do not present untranslated system text.
  if (
    /^(?:Invalid |Too |Expected |Unrecognized |Number must|String must|Array must)/.test(
      value,
    )
  ) {
    if (locale === "en") return value;
    const details = value
      .match(/"[^"]*"|'[^']*'|[<>]=?\s*-?\d+(?:\.\d+)?|-?\d+(?:\.\d+)?/g)
      ?.join(" · ");
    return (
      pick(locale, [
        "Значение не прошло проверку. Проверьте тип, формат и допустимые значения",
        "Мән тексеруден өтпеді. Түрін, пішімін және рұқсат етілген мәндерді тексеріңіз",
        "Validation failed. Check the type, format and allowed values",
      ]) + (details ? `: ${details}` : ".")
    );
  }
  return value;
}

/** Translate the existing naive comparison verbatim; do not choose a new baseline. */
export function localizedBaseline(
  view: EmployeeView,
  dataset: Dataset,
  locale: Locale,
): string {
  if (!view.baseline)
    return pick(locale, [
      "Нет подходящего сравнения",
      "Салыстыруға лайық нұсқа жоқ",
      "No baseline comparison is available",
    ]);
  let value = view.baseline.explanation;
  const parts: readonly (readonly [string, Words])[] = [
    [
      "минимальный доступный уровень.",
      [
        "минимальный доступный уровень.",
        "қолжетімді ең төменгі деңгей.",
        "the lowest available level.",
      ],
    ],
    [
      "Навык не входит в требования целевого грейда.",
      [
        "Навык не входит в требования целевого грейда.",
        "Дағды мақсатты деңгей талаптарына кірмейді.",
        "This skill is not required by the target grade.",
      ],
    ],
    [
      "Требование по этому навыку уже закрыто.",
      [
        "Требование по этому навыку уже закрыто.",
        "Бұл дағды бойынша талап орындалған.",
        "This skill requirement is already met.",
      ],
    ],
    [
      "Baseline не учитывает приоритет критичных навыков и историю.",
      [
        "Простое сравнение не учитывает приоритет критичных навыков и историю.",
        "Қарапайым салыстыру маңызды дағдылардың басымдығын және тарихты ескермейді.",
        "The naive baseline ignores critical skill priorities and history.",
      ],
    ],
  ];
  for (const [source, words] of parts)
    value = value.replaceAll(source, pick(locale, words));
  for (const row of fixedMessages)
    value = value.replaceAll(row[0], pick(locale, [row[1], row[2], row[3]]));
  return replaceKnownCatalog(value, locale, dataset);
}

/** Evidence values keep exact numeric tokens, including raw factor contributions. */
export function localizeEvidence(
  item: Evidence,
  dataset: Dataset,
  locale: Locale,
): { label: string; value: string } {
  const labels: Record<string, Words> = {
    "Career target": ["Карьерная цель", "Мансаптық мақсат", "Career target"],
    "Similar activity history": [
      "История похожих активностей",
      "Ұқсас іс-шаралар тарихы",
      "Similar activity history",
    ],
    "Format and availability fit": [
      "Соответствие формата и доступности",
      "Формат пен қолжетімділіктің сәйкестігі",
      "Format and availability fit",
    ],
    "Projected readiness": [
      "Прогноз готовности",
      "Дайындық болжамы",
      "Projected readiness",
    ],
  };
  let label = labels[item.label]
    ? pick(locale, labels[item.label])
    : replaceKnownCatalog(item.label, locale, dataset);
  if (item.label.startsWith("Replayed "))
    label = `${pick(locale, ["Учтено по истории", "Тарих бойынша есепке алынды", "Replayed"])}: ${replaceKnownCatalog(item.label.slice(9), locale, dataset)}`;
  if (item.label.endsWith(" effective gain"))
    label = `${replaceKnownCatalog(item.label.slice(0, -15), locale, dataset)} · ${pick(locale, ["фактический прирост", "нақты өсім", "effective gain"])}`;
  if (item.label.endsWith(" contribution")) {
    const key = item.label.slice(0, -13);
    label = `${factors[key] ? pick(locale, factors[key]) : key} · ${pick(locale, ["вклад в балл", "бағаға үлесі", "score contribution"])}`;
  }
  let value = item.value;
  const counts = value.match(
    /^(\d+) positive \/ (\d+) negative; (\d+) self \/ (\d+) assigned$/,
  );
  if (counts)
    value = pick(locale, [
      `${counts[1]} положительных / ${counts[2]} отрицательных; ${counts[3]} по своей инициативе / ${counts[4]} назначенных`,
      `${counts[1]} оң / ${counts[2]} теріс; ${counts[3]} өз бастамасымен / ${counts[4]} тағайындалған`,
      `${counts[1]} positive / ${counts[2]} negative; ${counts[3]} self-initiated / ${counts[4]} assigned`,
    ]);
  else if (/ critical$/.test(value))
    value = value.replace(
      / critical$/,
      ` · ${pick(locale, ["критичный", "маңызды", "critical"])}`,
    );
  else
    value = replaceKnownCatalog(
      localizeMessage(value, locale),
      locale,
      dataset,
    );
  return { label, value };
}

const pct = (number: number | null): string =>
  number === null ? "—" : `${Number((number * 100).toFixed(2))}%`;

/** Presentation only: every numeric value comes from the existing engine projection. */
export function localizedExplanation(
  rec: Recommendation,
  view: EmployeeView,
  dataset: Dataset,
  locale: Locale,
): string {
  const gains = Object.entries(rec.expectedGains)
    .map(([id, gain]) => {
      const skill = dataset.skills.find((item) => item.id === id);
      return `${catalogName(skill?.name ?? id, locale)} +${gain}`;
    })
    .join(", ");
  const target = view.target
    ? `${catalogName(view.target.role, locale)} · ${catalogName(view.target.grade, locale)}`
    : localizeMessage("No target", locale);
  const factorText = Object.entries(rec.factorScores)
    .map(
      ([name, value]) =>
        `${factors[name] ? pick(locale, factors[name]) : name}: ${value}`,
    )
    .join("; ");
  const history = rec.evidence.find(
    (item) =>
      item.id.startsWith("history:") ||
      item.label === "Similar activity history",
  );
  const event = dataset.activities.find((item) => item.id === rec.activityId);
  const parts = [
    pick(locale, [
      `Прирост: ${gains || "—"}.`,
      `Өсім: ${gains || "—"}.`,
      `Gains: ${gains || "—"}.`,
    ]),
    pick(locale, [
      `Цель: ${target}; готовность ${pct(view.readiness)} → ${pct(rec.projectedReadiness)}.`,
      `Мақсат: ${target}; дайындық ${pct(view.readiness)} → ${pct(rec.projectedReadiness)}.`,
      `Target: ${target}; readiness ${pct(view.readiness)} → ${pct(rec.projectedReadiness)}.`,
    ]),
    `${factorText}.`,
  ];
  if (history)
    parts.push(
      `${pick(locale, ["Похожая история", "Ұқсас тарих", "Similar history"])}: ${localizeEvidence(history, dataset, locale).value}.`,
    );
  if (event)
    parts.push(
      `${catalogName(event.format, locale)} · ${event.durationHours} ${pick(locale, ["ч", "сағ", "h"])}.`,
    );
  return parts.join(" ");
}
