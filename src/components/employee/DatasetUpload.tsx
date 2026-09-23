"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { localizeMessage } from "@/lib/i18n/domain";
import { useEmployeeStore } from "../../state/EmployeeStoreProvider";
import type {
  UploadName,
  UploadSources,
} from "../../state/intelligenceAdapter";
import {
  bundleToFiles,
  detectDatasetSlot,
  mergeDatasetTexts,
  type BundleTexts,
  type DatasetSlot,
  type MergeMode,
  type MergeSummary,
} from "@/domain/data/judge-import";
import styles from "./employee.module.css";

/** Жюри приносит файлы с произвольными именами; слот определяется по содержимому. */
const SLOT_TO_NAME: Record<DatasetSlot, UploadName> = {
  employees: "employees.json",
  events: "events.json",
  skills: "skills.json",
  history: "activity_history.csv",
};
const NAME_TO_SLOT: Record<UploadName, DatasetSlot> = {
  "employees.json": "employees",
  "events.json": "events",
  "skills.json": "skills",
  "activity_history.csv": "history",
};
const names: UploadName[] = [
  "employees.json",
  "events.json",
  "skills.json",
  "activity_history.csv",
];
const limit = 10 * 1024 * 1024;
type UploadError = {
  kind: "unknown" | "large" | "read" | "demo" | "invalid-demo";
  name?: string;
};
export function DatasetUpload() {
  const { locale, t, date, number } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Partial<Record<UploadName, File>>>({});
  const [error, setError] = useState<UploadError[] | null>(null);
  const errorText = (issue: UploadError) => {
    const file = issue.name ?? "";
    switch (issue.kind) {
      case "unknown":
        return t(
          "Неизвестный файл: {file}",
          "Белгісіз файл: {file}",
          "Unknown file: {file}",
          { file },
        );
      case "large":
        return t(
          "{file}: максимум 10 МБ на файл",
          "{file}: әр файл 10 МБ-тан аспауы керек",
          "{file}: maximum 10 MB per file",
          { file },
        );
      case "read":
        return t(
          "Не удалось прочитать файлы. Выберите их повторно.",
          "Файлдарды оқу мүмкін болмады. Оларды қайта таңдаңыз.",
          "Unable to read the files. Please select them again.",
        );
      case "invalid-demo":
        return t(
          "Демонстрационный набор недоступен. Вы можете загрузить свои файлы.",
          "Демо-жиын қолжетімсіз. Өз файлдарыңызды жүктей аласыз.",
          "The demo dataset is unavailable. You can upload your own files.",
        );
      default:
        return t(
          "Не удалось загрузить демо. Попробуйте ещё раз или выберите файлы.",
          "Демоны жүктеу мүмкін болмады. Қайталап көріңіз немесе файлдарды таңдаңыз.",
          "Unable to load the demo. Try again or choose files.",
        );
    }
  };
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<MergeMode>("append");
  const [summary, setSummary] = useState<MergeSummary | null>(null);
  /** Последний успешно загруженный набор — основа для частичных догрузок. */
  const baseBundle = useRef<BundleTexts | null>(null);
  const demoRequest = useRef<AbortController | null>(null);
  useEffect(() => () => demoRequest.current?.abort(), []);
  const { importFiles, status, issues, dataset, adapterReady, selectEmployee } =
    useEmployeeStore((s) => s);
  const busy = reading || status === "loading";
  const acceptFiles = async (incoming: FileList | null) => {
    if (!incoming || busy) return;
    const next = { ...files };
    const errors: UploadError[] = [];
    for (const file of Array.from(incoming)) {
      if (file.size > limit) {
        errors.push({ kind: "large", name: file.name });
        continue;
      }
      if (names.includes(file.name as UploadName)) {
        next[file.name as UploadName] = file;
        continue;
      }
      // Имя нестандартное: узнаём файл по содержимому, иначе жюри упрётся в отказ.
      const detected = detectDatasetSlot(file.name, await file.text());
      if (!detected.slot) {
        errors.push({ kind: "unknown", name: file.name });
        continue;
      }
      next[SLOT_TO_NAME[detected.slot]] = file;
    }
    setFiles(next);
    setSummary(null);
    setError(errors.length ? errors : null);
  };
  /** Пытается взять основу для догрузки: последний импорт, иначе демо-набор. */
  const resolveBase = async (): Promise<BundleTexts | null> => {
    if (baseBundle.current) return baseBundle.current;
    try {
      const response = await fetch("/api/demo-dataset");
      if (!response.ok) return null;
      const body = (await response.json()) as Record<string, unknown>;
      const fields = ["employees", "events", "skills", "history"] as const;
      if (fields.some((field) => typeof body[field] !== "string")) return null;
      return {
        employees: body.employees as string,
        events: body.events as string,
        skills: body.skills as string,
        history: body.history as string,
      };
    } catch {
      return null;
    }
  };

  const importSelected = async (
    selected: Partial<Record<UploadName, File>>,
    requestedMode: MergeMode = "replace",
  ) => {
    const chosen = names.filter((name) => selected[name]);
    const incoming: Partial<Record<DatasetSlot, string>> = {};
    for (const name of chosen) {
      incoming[NAME_TO_SLOT[name]] = await selected[name]!.text();
    }

    const complete = chosen.length === names.length;
    const base =
      complete && requestedMode === "replace" ? null : await resolveBase();
    const { bundle, summary: merged } = mergeDatasetTexts({
      base,
      incoming,
      mode: base ? requestedMode : "replace",
    });

    const files = bundleToFiles(bundle);
    await importFiles({
      "employees.json": files.employees as string,
      "events.json": files.events as string,
      "skills.json": files.skills as string,
      "activity_history.csv": files.activityHistoryCsv,
    } as UploadSources);
    baseBundle.current = bundle;
    setSummary(merged);
  };
  const load = async () => {
    setReading(true);
    setError(null);
    try {
      await importSelected(files, dataset ? mode : "replace");
    } catch {
      setError([{ kind: "read" }]);
    } finally {
      setReading(false);
    }
  };
  const loadDemo = async () => {
    if (busy) return;
    setReading(true);
    setError(null);
    const controller = new AbortController();
    demoRequest.current = controller;
    try {
      const response = await fetch("/api/demo-dataset", {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("demo");
      const body = (await response.json()) as Record<string, unknown>;
      const fields = ["employees", "events", "skills", "history"] as const;
      if (fields.some((field) => typeof body[field] !== "string"))
        throw new Error("invalid-demo");
      const selected = Object.fromEntries(
        names.map((name, index) => [
          name,
          new File([body[fields[index]] as string], name, {
            type: name.endsWith("csv") ? "text/csv" : "application/json",
          }),
        ]),
      ) as Record<UploadName, File>;
      if (controller.signal.aborted) return;
      setFiles(selected);
      await importSelected(selected, "replace");
    } catch (cause) {
      if (!controller.signal.aborted)
        setError([
          {
            kind:
              cause instanceof Error && cause.message === "invalid-demo"
                ? "invalid-demo"
                : "demo",
          },
        ]);
    } finally {
      if (!controller.signal.aborted) setReading(false);
      demoRequest.current = null;
    }
  };
  const fileControls = (
    <>
      <p className={styles.muted}>
        {!dataset
          ? t(
              "Загрузите файлы набора. Имя файла не важно — тип определяется по содержимому.",
              "Жиын файлдарын жүктеңіз. Файл аты маңызды емес — түрі мазмұны бойынша анықталады.",
              "Upload the dataset files. The file name does not matter - the type is detected from the content.",
            )
          : mode === "append"
            ? t(
                "Дополнит текущий набор: новые профили добавятся к загруженным, прогресс сессии сохранится.",
                "Ағымдағы жиынды толықтырады: жаңа профильдер қосылады, сессия ілгерілеуі сақталады.",
                "Adds to the current dataset: new profiles are appended and session progress is kept.",
              )
            : t(
                "Новый набор заменит данные и сбросит прогресс текущей сессии.",
                "Жаңа жиын деректерді ауыстырып, ағымдағы сессияның ілгерілеуін өшіреді.",
                "A new dataset replaces current data and resets this session's progress.",
              )}
      </p>
      {dataset && (
        <div className={styles.fileList} role="radiogroup">
          {(["append", "replace"] as const).map((option) => (
            <label key={option}>
              <input
                type="radio"
                name="import-mode"
                value={option}
                checked={mode === option}
                disabled={busy}
                onChange={() => setMode(option)}
              />{" "}
              {option === "append"
                ? t("Дополнить", "Толықтыру", "Append")
                : t("Заменить", "Ауыстыру", "Replace")}
            </label>
          ))}
        </div>
      )}
      <div
        className={`${styles.dropzone} ${dragging ? styles.dragging : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          acceptFiles(event.dataTransfer.files);
        }}
      >
        <span className={styles.uploadIcon} aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 16V4m0 0L8 8m4-4 4 4M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <button
          className={styles.textButton}
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {t(" Выбрать файлы ", " Файлдарды таңдау ", " Choose files ")}
        </button>
        <span className={styles.muted}>
          {t(
            "Перетащите сюда · до 10 МБ на файл",
            "Осында сүйреңіз · әр файл 10 МБ-қа дейін",
            "Drop files here · up to 10 MB each",
          )}
        </span>
        <input
          ref={input}
          aria-label={t(
            "Файлы набора данных",
            "Деректер жиынының файлдары",
            "Dataset files",
          )}
          className={styles.visuallyHidden}
          type="file"
          accept=".json,.csv"
          multiple
          disabled={busy}
          onChange={(event) => {
            acceptFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      <details className={styles.methodDetails}>
        <summary>
          {t(" Файлы набора · ", " Жиын файлдары · ", " Dataset files · ")}
          {names.filter((name) => files[name]).length}/4
        </summary>
        <ul className={styles.fileList}>
          {names.map((name) => (
            <li key={name}>
              <span
                className={files[name] ? styles.fileReady : styles.fileWaiting}
                aria-hidden="true"
              >
                {files[name] ? "✓" : "○"}
              </span>
              <span>{name}</span>
              {files[name] && (
                <button
                  className={styles.removeFile}
                  disabled={busy}
                  aria-label={t(
                    "Убрать {name}",
                    "{name} файлын алып тастау",
                    "Remove {name}",
                    { name },
                  )}
                  onClick={() =>
                    setFiles((old) => {
                      const next = { ...old };
                      delete next[name];
                      return next;
                    })
                  }
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      </details>
      <button
        className={styles.primaryButton}
        disabled={
          busy || !adapterReady || names.every((name) => !files[name])
        }
        onClick={load}
      >
        {busy
          ? t("Проверяем данные…", "Деректер тексерілуде…", "Validating data…")
          : dataset
            ? mode === "append"
              ? t(
                  "Дополнить набор",
                  "Жиынды толықтыру",
                  "Append to dataset",
                )
              : t(
                  "Заменить набор и сбросить прогресс",
                  "Жиынды ауыстырып, ілгерілеуді өшіру",
                  "Replace dataset and reset progress",
                )
            : t(
                "Проверить и загрузить",
                "Тексеріп жүктеу",
                "Validate and load",
              )}
      </button>
      {!adapterReady && (
        <p className={styles.muted}>
          {t(
            " Импорт будет доступен после подключения движка Intelligence. ",
            " Есептеу жүйесі қосылғаннан кейін импорт қолжетімді болады. ",
            " Import will be available when the recommendation engine is connected. ",
          )}
        </p>
      )}
    </>
  );
  const importSummary = summary ? (
        <details className={styles.methodDetails} open>
          <summary>
            {t("Результат импорта", "Импорт нәтижесі", "Import result")}
          </summary>
          <ul className={styles.fileList}>
            <li>
              {t("Добавлено профилей", "Профильдер қосылды", "Profiles added")}:{" "}
              {number(summary.addedEmployees)}
            </li>
            <li>
              {t("Обновлено профилей", "Профильдер жаңартылды", "Profiles updated")}:{" "}
              {number(summary.updatedEmployees)}
            </li>
            <li>
              {t("Добавлено записей истории", "Тарих жазбалары қосылды", "History rows added")}:{" "}
              {number(summary.addedHistory)}
            </li>
            <li>
              {t("Отклонено строк", "Жолдар қабылданбады", "Rows rejected")}:{" "}
              {number(summary.rejectedTotal)}
            </li>
          </ul>
          {summary.rejectedRows.length > 0 && (
            <ul className={styles.fileList}>
              {summary.rejectedRows.slice(0, 5).map((rejected) => (
                <li key={`${rejected.source}-${rejected.row}`}>
                  {t("строка", "жол", "row")} {number(rejected.row)}
                  {rejected.recordId ? ` · ${rejected.recordId}` : ""} ·{" "}
                  {rejected.reason}
                </li>
              ))}
            </ul>
          )}
          {summary.newEmployeeIds.length > 0 && (
            <button
              className={styles.textButton}
              disabled={busy}
              onClick={() => selectEmployee(summary.newEmployeeIds[0])}
            >
              {t(
                "Перейти к добавленным профилям",
                "Қосылған профильдерге өту",
                "Go to the added profiles",
              )}
            </button>
          )}
        </details>
  ) : null;

  return (
    <section
      id="data-upload"
      className={styles.upload}
      aria-labelledby="upload-title"
      aria-busy={busy}
    >
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="upload-title">
            {dataset
              ? t(
                  "Данные пространства",
                  "Жұмыс кеңістігінің деректері",
                  "Workspace data",
                )
              : t("Ваши данные", "Сіздің деректеріңіз", "Your data")}
          </h2>
        </div>
        <span className={styles.uploadHeadingIcon} aria-hidden="true">
          {dataset ? "✓" : "↥"}
        </span>
      </div>
      {!dataset && (
        <div className={styles.demoCard}>
          <div>
            <span className={styles.demoIcon} aria-hidden="true">
              ✦
            </span>
            <strong>
              {t(
                "Готовый демо-набор",
                "Дайын демо-жиын",
                "Ready-to-use demo dataset",
              )}
            </strong>
          </div>
          <p>
            {t(
              "Рекомендации, план и прогноз роста.",
              "Ұсыныстар, жоспар және даму болжамы.",
              "Recommendations, planning and projected growth.",
            )}
          </p>
          <button
            className={styles.primaryButton}
            disabled={busy || !adapterReady}
            onClick={loadDemo}
          >
            {busy
              ? t("Готовим данные…", "Деректер дайындалуда…", "Preparing data…")
              : t("Посмотреть демо", "Демоны көру", "View demo")}
            <span aria-hidden="true"> ↗</span>
          </button>
        </div>
      )}
      {dataset ? (
        <>
          <div className={styles.loadedStatus} role="status">
            <span aria-hidden="true">✓</span>
            {busy
              ? t(
                  "Проверяем новые данные…",
                  "Жаңа деректер тексерілуде…",
                  "Validating new data…",
                )
              : t("Набор загружен", "Жиын жүктелді", "Dataset loaded")}
          </div>
          <div className={styles.datasetMetrics}>
            <div>
              <strong>{number(dataset.employees.length)}</strong>
              <span>{t("профилей", "профиль", "profiles")}</span>
            </div>
            <div>
              <strong>{number(dataset.activities.length)}</strong>
              <span>{t("активностей", "іс-шара", "activities")}</span>
            </div>
          </div>
          <details className={styles.methodDetails}>
            <summary>
              {t(
                "Состав и дата среза",
                "Құрамы және деректер күні",
                "Contents and snapshot date",
              )}
            </summary>
            <p className={styles.datasetSummary}>
              {number(dataset.skills.length)}
              {t(" навыков · ", " дағды · ", " skills · ")}
              {number(dataset.history.length)}
              {t(" записей истории ", " тарих жазбасы ", " history records ")}
            </p>
            <p className={styles.muted}>
              {t("Срез: ", "Деректер күні: ", "Snapshot: ")}
              {date(dataset.snapshotDate)}
            </p>
          </details>
          <details className={styles.replaceDataset}>
            <summary>
              {t(
                " Загрузить ещё данные или заменить набор ",
                " Деректерді қосу немесе жиынды ауыстыру ",
                " Add more data or replace the dataset ",
              )}
            </summary>
            <div className={styles.uploadControls}>{fileControls}</div>
          </details>
        </>
      ) : (
        fileControls
      )}
      {importSummary}
      {error && (
        <p role="alert" className={styles.error}>
          <span>{error.map(errorText).join(" ")}</span>
          <button
            className={styles.noticeClose}
            aria-label={t(
              "Закрыть ошибку загрузки",
              "Жүктеу қатесін жабу",
              "Dismiss upload error",
            )}
            onClick={() => setError(null)}
          >
            ×
          </button>
        </p>
      )}
      {!!issues.length && (
        <div aria-live="polite" className={styles.validation}>
          <strong>
            {t("Результат проверки", "Тексеру нәтижесі", "Validation result")}
          </strong>
          <ul>
            {issues.map((issue, i) => (
              <li
                key={i}
                className={issue.severity === "error" ? styles.errorText : ""}
              >
                {issue.file === "dataset"
                  ? t("Набор данных", "Деректер жиыны", "Dataset")
                  : issue.file === "engine"
                    ? t("Движок", "Есептеу жүйесі", "Engine")
                    : issue.file}
                {issue.row
                  ? t(", строка {row}", ", {row}-жол", ", row {row}", {
                      row: number(issue.row),
                    })
                  : ""}
                {issue.path ? ` · ${issue.path}` : ""}:{" "}
                {localizeMessage(issue.message, locale)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
