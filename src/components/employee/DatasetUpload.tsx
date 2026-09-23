"use client";
import { useEffect, useRef, useState } from "react";
import { DatasetValidationError } from "@/domain/data";
import {
  detectDatasetSlot,
  JudgeImportError,
  mergeDatasetTexts,
  normalizedDatasetToBundle,
  type DatasetSlot,
  type MergeMode,
  type MergeSummary,
} from "@/domain/data/judge-import";
import { useIdentity } from "@/components/identity/IdentityProvider";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { localizeMessage } from "@/lib/i18n/domain";
import {
  useEmployeeStore,
  useOptionalEmployeeStore,
} from "../../state/EmployeeStoreProvider";
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
const slotNames: Record<DatasetSlot, UploadName> = {
  employees: "employees.json",
  events: "events.json",
  skills: "skills.json",
  history: "activity_history.csv",
};
type SelectedFile = { name: string; text: string };
type UploadError = {
  kind: "unknown" | "large" | "read" | "merge" | "validation" | "changed";
  name?: string;
  message?: string;
};
export function DatasetUpload() {
  const { locale, t, date, number } = useI18n();
  const identity = useIdentity();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Partial<Record<UploadName, SelectedFile>>>(
    {},
  );
  const [mode, setMode] = useState<MergeMode>("append");
  const [summary, setSummary] = useState<MergeSummary | null>(null);
  const store = useOptionalEmployeeStore();
  const pending = useRef(false);
  const mounted = useRef(true);
  const identityId = identity.session?.employeeId ?? null;
  const identityRef = useRef(identityId);
  identityRef.current = identityId;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setFiles({});
    setSummary(null);
    setError(null);
  }, [identityId]);
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
      case "changed":
        return t(
          "Данные или профиль изменились. Выберите файлы повторно.",
          "Деректер немесе профиль өзгерді. Файлдарды қайта таңдаңыз.",
          "The workspace or profile changed. Select the files again.",
        );
      case "validation":
        return `${file ? `${file}: ` : ""}${localizeMessage(issue.message ?? "Invalid JSON", locale)}`;
      case "merge":
        return t(
          "Не удалось собрать набор. Проверьте формат {file}; для частичного импорта сначала откройте демо или полный набор.",
          "Жиынды құрастыру мүмкін болмады. {file} пішімін тексеріңіз; ішінара импорт үшін алдымен демоны немесе толық жиынды ашыңыз.",
          "Unable to assemble the dataset. Check the format of {file}; open the demo or a full dataset before importing partial files.",
          { file },
        );
    }
  };
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const { importFiles, status, issues, dataset, adapterReady, selectEmployee } =
    useEmployeeStore((s) => s);
  const busy = reading || status === "loading" || identity.loading;
  const acceptFiles = async (incoming: FileList | null) => {
    if (!incoming || busy || pending.current) return;
    pending.current = true;
    setReading(true);
    const current = store?.getState().normalizedDataset;
    const owner = identityId;
    const next = { ...files };
    const errors: UploadError[] = [];
    try {
      for (const file of Array.from(incoming)) {
        if (file.size > limit) {
          errors.push({ kind: "large", name: file.name });
          continue;
        }
        const text = await file.text();
        const detected = detectDatasetSlot(file.name, text);
        if (!detected.slot) {
          errors.push({ kind: "unknown", name: file.name });
          continue;
        }
        next[slotNames[detected.slot]] = { name: file.name, text };
      }
      if (!mounted.current) return;
      if (
        identityRef.current !== owner ||
        store?.getState().normalizedDataset !== current
      ) {
        setError([{ kind: "changed" }]);
        return;
      }
      setFiles(next);
      setSummary(null);
      setError(errors.length ? errors : null);
    } catch {
      if (mounted.current) setError([{ kind: "read" }]);
    } finally {
      pending.current = false;
      if (mounted.current) setReading(false);
    }
  };
  const load = async () => {
    if (busy || pending.current) return;
    pending.current = true;
    setReading(true);
    setError(null);
    setSummary(null);
    try {
      const current = store?.getState();
      const base = current?.normalizedDataset
        ? normalizedDatasetToBundle(current.normalizedDataset)
        : null;
      const incoming = Object.fromEntries(
        Object.entries(slotNames)
          .filter(([, name]) => files[name])
          .map(([slot, name]) => [slot, files[name]!.text]),
      );
      const result = mergeDatasetTexts({
        base,
        incoming,
        mode: base ? mode : "replace",
      });
      const sources = Object.fromEntries(
        Object.entries(slotNames).map(([slot, name]) => [
          name,
          result.bundle[slot as DatasetSlot],
        ]),
      ) as UploadSources;
      if (await importFiles(sources)) {
        identity.useImportedDataset();
        if (
          current?.selectedEmployeeId &&
          store?.getState().views[current.selectedEmployeeId]
        )
          selectEmployee(current.selectedEmployeeId);
        if (mounted.current) {
          setSummary(result.summary);
          setFiles({});
        }
      }
    } catch (cause) {
      if (cause instanceof DatasetValidationError)
        setError(
          cause.issues
            .slice(0, 10)
            .map((issue) => ({
              kind: "validation",
              name: `${issue.source} · ${issue.path}`,
              message: issue.message,
            })),
        );
      else if (cause instanceof JudgeImportError)
        setError([
          {
            kind: "merge",
            name: cause.slot ? slotNames[cause.slot] : "JSON / CSV",
          },
        ]);
      else setError([{ kind: "read" }]);
    } finally {
      pending.current = false;
      setReading(false);
    }
  };
  const loadDemo = async () => {
    if (busy) return;
    await identity.loadDemo();
  };
  const fileControls = (
    <>
      {dataset && (
        <fieldset disabled={busy}>
          <legend>{t("Режим импорта", "Импорт режимі", "Import mode")}</legend>
          <label>
            <input
              type="radio"
              name="dataset-mode"
              value="append"
              checked={mode === "append"}
              onChange={() => setMode("append")}
            />{" "}
            {t("Дополнить", "Толықтыру", "Append")}
          </label>
          {" · "}
          <label>
            <input
              type="radio"
              name="dataset-mode"
              value="replace"
              checked={mode === "replace"}
              onChange={() => setMode("replace")}
            />{" "}
            {t("Заменить", "Ауыстыру", "Replace")}
          </label>
        </fieldset>
      )}
      <p className={styles.muted}>
        {dataset
          ? mode === "append"
            ? t(
                "Добавьте профили или историю. Подтверждённый прогресс войдёт в набор; прогноз и журнал сессии начнутся заново. Совпавшие ID обновятся.",
                "Профильдерді немесе тарихты қосыңыз. Расталған ілгерілеу жиында сақталады; болжам мен сессия журналы жаңадан басталады. Бірдей ID жаңартылады.",
                "Add profiles or history. Confirmed progress becomes part of the dataset; the preview and session log restart. Matching IDs are updated.",
              )
            : t(
                "Выбранные части заменят текущие. Отсутствующие части останутся; история с неизвестными ссылками будет отклонена.",
                "Таңдалған бөліктер ағымдағы деректерді ауыстырады. Қалған бөліктер сақталады; белгісіз сілтемелері бар тарих қабылданбайды.",
                "Selected parts replace current data. Other parts remain; history with unknown references is rejected.",
              )
          : t(
              "Загрузите четыре файла или откройте демо для добавления профилей жюри. Тип определяется по содержимому; данные обрабатываются в браузере.",
              "Төрт файлды жүктеңіз немесе қазылар профильдерін қосу үшін демоны ашыңыз. Түрі мазмұны бойынша анықталады; деректер браузерде өңделеді.",
              "Upload four files or open the demo to add judge profiles. Files are detected by content and processed in your browser.",
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
              <span>
                {files[name]?.name ?? name}
                {files[name] && files[name].name !== name ? ` → ${name}` : ""}
              </span>
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
        disabled={busy || !adapterReady || !names.some((name) => files[name])}
        onClick={load}
      >
        {busy
          ? t("Проверяем данные…", "Деректер тексерілуде…", "Validating data…")
          : dataset && mode === "append"
            ? t("Дополнить набор", "Жиынды толықтыру", "Append to dataset")
            : dataset
              ? t(
                  "Проверить и заменить",
                  "Тексеріп ауыстыру",
                  "Validate and replace",
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
                " Дополнить или заменить данные ",
                " Деректерді толықтыру немесе ауыстыру ",
                " Append or replace data ",
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
      {summary && (
        <details open className={styles.methodDetails}>
          <summary>
            {t("Итог импорта", "Импорт нәтижесі", "Import summary")}
          </summary>
          <p>
            {summary.mode === "replace"
              ? t(
                  "Выбранные части набора заменены.",
                  "Жиынның таңдалған бөліктері ауыстырылды.",
                  "Selected dataset parts were replaced.",
                )
              : t(
                  "Профили: +{added}, обновлено {updated}. История: +{history}, обновлено {historyUpdated}.",
                  "Профильдер: +{added}, жаңартылғаны {updated}. Тарих: +{history}, жаңартылғаны {historyUpdated}.",
                  "Profiles: +{added}, updated {updated}. History: +{history}, updated {historyUpdated}.",
                  {
                    added: number(summary.addedEmployees),
                    updated: number(summary.updatedEmployees),
                    history: number(summary.addedHistory),
                    historyUpdated: number(summary.updatedHistory),
                  },
                )}
          </p>
          <p>
            {t(
              "Отклонено строк истории: {count}",
              "Қабылданбаған тарих жолдары: {count}",
              "Rejected history rows: {count}",
              { count: number(summary.rejectedTotal) },
            )}
          </p>
          {!!summary.rejectedRows.length && (
            <ul>
              {summary.rejectedRows.slice(0, 5).map((row, index) => (
                <li key={index}>
                  {row.source === "incoming"
                    ? t("Новый файл", "Жаңа файл", "Incoming file")
                    : t("Текущий набор", "Ағымдағы жиын", "Current dataset")}
                  {" · "}
                  {t("строка {row}", "{row}-жол", "row {row}", {
                    row: number(row.row),
                  })}
                  {row.recordId ? ` · ${row.recordId}` : ""}:{" "}
                  {row.reason.startsWith("неизвестный employee_id ")
                    ? t(
                        "Неизвестный сотрудник {id}",
                        "Белгісіз қызметкер {id}",
                        "Unknown employee {id}",
                        {
                          id: row.reason.slice(
                            "неизвестный employee_id ".length,
                          ),
                        },
                      )
                    : t(
                        "Неизвестная активность {id}",
                        "Белгісіз іс-шара {id}",
                        "Unknown activity {id}",
                        {
                          id: row.reason.slice("неизвестный event_id ".length),
                        },
                      )}
                </li>
              ))}
            </ul>
          )}
          {summary.rejectedTotal > 5 && (
            <p className={styles.muted}>
              {t(
                "Показаны первые 5 отклонённых строк.",
                "Алғашқы 5 қабылданбаған жол көрсетілген.",
                "Showing the first 5 rejected rows.",
              )}
            </p>
          )}
          {!!summary.newEmployeeIds.length && (
            <button
              className={styles.textButton}
              onClick={() => selectEmployee(summary.newEmployeeIds[0])}
            >
              {t(
                "Открыть добавленный профиль",
                "Қосылған профильді ашу",
                "Open an added profile",
              )}
            </button>
          )}
        </details>
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
