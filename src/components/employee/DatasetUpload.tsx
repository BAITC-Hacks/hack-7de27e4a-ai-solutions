"use client";
import { useRef, useState } from "react";
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
export function DatasetUpload() {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Partial<Record<UploadName, File>>>({});
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const { importFiles, status, issues, dataset, adapterReady } =
    useEmployeeStore((s) => s);
  const busy = reading || status === "loading";
  const acceptFiles = (incoming: FileList | null) => {
    if (!incoming || busy) return;
    const next = { ...files };
    const errors: string[] = [];
    for (const file of Array.from(incoming)) {
      if (!names.includes(file.name as UploadName)) {
        errors.push(`Неизвестный файл: ${file.name}`);
        continue;
      }
      if (file.size > limit) {
        errors.push(`${file.name}: максимум 10 МБ на файл`);
        continue;
      }
      next[file.name as UploadName] = file;
    }
    setFiles(next);
    setError(errors.length ? errors.join(". ") : null);
  };
  const load = async () => {
    setReading(true);
    setError(null);
    try {
      const sources = Object.fromEntries(
        await Promise.all(
          names.map(async (name) => [name, await files[name]!.text()]),
        ),
      ) as UploadSources;
      await importFiles(sources);
    } catch {
      setError("Не удалось прочитать файлы. Выберите их повторно.");
    } finally {
      setReading(false);
    }
  };
  return (
    <section
      className={styles.upload}
      aria-labelledby="upload-title"
      aria-busy={busy}
    >
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.eyebrow}>ВАШИ ДАННЫЕ</span>
          <h2 id="upload-title">Загрузить набор</h2>
        </div>
        <span className={styles.tag}>JSON + CSV</span>
      </div>
      <p className={styles.muted}>
        Выберите четыре файла вместе или добавьте их по одному. Новый импорт
        сбросит журнал текущей сессии.
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
          ↑
        </span>
        <button
          className={styles.textButton}
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          Выбрать файлы
        </button>
        <span className={styles.muted}>
          или перетащить сюда · до 10 МБ каждый
        </span>
        <input
          ref={input}
          aria-label="Файлы набора данных"
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
                aria-label={`Убрать ${name}`}
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
      <button
        className={styles.primaryButton}
        disabled={busy || !adapterReady || names.some((name) => !files[name])}
        onClick={load}
      >
        {busy
          ? "Проверяем данные…"
          : dataset
            ? "Заменить набор и сбросить прогресс"
            : "Проверить и загрузить"}
      </button>
      {!adapterReady && (
        <p className={styles.muted}>
          Импорт будет доступен после подключения движка Intelligence.
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {!!issues.length && (
        <div aria-live="polite" className={styles.validation}>
          <strong>Результат проверки</strong>
          <ul>
            {issues.map((issue, i) => (
              <li
                key={i}
                className={issue.severity === "error" ? styles.errorText : ""}
              >
                {issue.file}
                {issue.row ? `, строка ${issue.row}` : ""}
                {issue.path ? ` · ${issue.path}` : ""}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {dataset && (
        <p className={styles.datasetSummary}>
          {dataset.employees.length} сотрудников · {dataset.activities.length}{" "}
          активностей · {dataset.skills.length} навыков ·{" "}
          {dataset.history.length} записей истории
        </p>
      )}
    </section>
  );
}
