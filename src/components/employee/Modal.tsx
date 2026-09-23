"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import styles from "./employee.module.css";
export function Modal({
  title,
  onClose,
  children,
  drawer = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  drawer?: boolean;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`${styles.dialog} ${drawer ? styles.drawer : ""}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.dialogContent}>
        <div className={styles.dialogHeading}>
          <div>
            <h2>{title}</h2>
          </div>
          <button
            autoFocus
            className={styles.closeButton}
            onClick={onClose}
            aria-label={t("Закрыть", "Жабу", "Close")}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="m6 6 12 12M18 6 6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
