"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { localizeMessage } from "@/lib/i18n/domain";
import { useEmployeeStore } from "../../state/EmployeeStoreProvider";
import type {
  UploadName,
  UploadSources,
} from "../../state/intelligenceAdapter";
import styles from "./employee.module.css";
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
  const demoRequest = useRef<AbortController | null>(null);
  useEffect(() => () => demoRequest.current?.abort(), []);
  const { importFiles, status, issues, dataset, adapterReady } =
    useEmployeeStore((s) => s);
  const busy = reading || status === "loading";
  const acceptFiles = (incoming: FileList | null) => {
    if (!incoming || busy) return;
    const next = { ...files };
    const errors: UploadError[] = [];
    for (const file of Array.from(incoming)) {
      if (!names.includes(file.name as UploadName)) {
        errors.push({ kind: "unknown", name: file.name });
        continue;
      }
      if (file.size > limit) {
        errors.push({ kind: "large", name: file.name });
        continue;
      }
      next[file.name as UploadName] = file;
    }
    setFiles(next);
    setError(errors.length ? errors : null);
  };
  const importSelected = async (
    selected: Partial<Record<UploadName, File>>,
  ) => {
    const sources = Object.fromEntries(
      await Promise.all(
        names.map(async (name) => [name, await selected[name]!.text()]),
      ),
    ) as UploadSources;
    await importFiles(sources);
  };
  const load = async () => {
    setReading(true);
    setError(null);
    try {
      await importSelected(files);
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
      await importSelected(selected);
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
        {dataset
          ? t(
              "Новый набор заменит данные и сбросит прогресс текущей сессии.",
              "Жаңа жиын деректерді ауыстырып, ағымдағы сессияның ілгерілеуін өшіреді.",
              "A new dataset replaces current data and resets this session's progress.",
            )
          : t(
              "Или загрузите свои четыре файла. Данные обрабатываются в браузере.",
              "Немесе өз төрт файлыңызды жүктеңіз. Деректер браузерде өңделеді.",
              "Or upload your four files. Data is processed in your browser.",
            )}
      </p>
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
        disabled={busy || !adapterReady || names.some((name) => !files[name])}
        onClick={load}
      >
        {busy
          ? t("Проверяем данные…", "Деректер тексерілуде…", "Validating data…")
          : dataset
            ? t(
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
                " Заменить набор данных ",
                " Деректер жиынын ауыстыру ",
                " Replace dataset ",
              )}
            </summary>
            <div className={styles.uploadControls}>{fileControls}</div>
          </details>
        </>
      ) : (
        fileControls
      )}
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
