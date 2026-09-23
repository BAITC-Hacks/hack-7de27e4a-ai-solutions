"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { catalogName } from "@/lib/i18n/domain";
import type { NormalizedDataset } from "@/lib/contracts";
import { sharedEmployeeStore } from "@/state/sharedEmployeeStore";
import type { EmployeeState } from "@/state/employeeStore";
import { createRealIntelligenceAdapter, projectDataset } from "@/state/realIntelligenceAdapter";
import { Modal } from "@/components/employee/Modal";
import styles from "./identity.module.css";

export interface IdentitySession { employeeId: string; fullName: string; role: "employee" | "hr" }
interface Person { employeeId: string; fullName: string; role: string; grade: string; department: string; access: "employee" | "hr" }
interface IdentityContextValue {
  session: IdentitySession | null;
  loading: boolean;
  workspaceSource: "demo" | "import";
  openPicker: (access?: "employee" | "hr") => void;
  refresh: () => Promise<void>;
  loadDemo: () => Promise<void>;
  useImportedDataset: () => void;
  logout: () => Promise<void>;
}
const IdentityContext = createContext<IdentityContextValue>({
  session: null, loading: false, workspaceSource: "import", openPicker: () => {},
  refresh: async () => {}, loadDemo: async () => {}, useImportedDataset: () => {}, logout: async () => {},
});
export const useIdentity = () => useContext(IdentityContext);

function clearWorkspace() {
  sharedEmployeeStore.setState({ dataset: null, normalizedDataset: null, selectedEmployeeId: null,
    ledger: [], views: {}, simulation: null, path: null, status: "empty", issues: [], error: null,
    notice: null, revision: sharedEmployeeStore.getState().revision + 1 });
}

/** Demo identity only: any listed synthetic persona may be selected. Production requires SSO. */
export function IdentityProvider({ children }: { children: ReactNode }) {
  const { locale, t } = useI18n();
  const [session, setSession] = useState<IdentitySession | null>(null);
  const sessionRef = useRef<IdentitySession | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspaceSource, setSource] = useState<"demo" | "import">("demo");
  const sourceRef = useRef<"demo" | "import">("demo");
  const [picker, setPicker] = useState<"all" | "employee" | "hr" | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const snapshots = useRef(new Map<string, EmployeeState>());
  const generation = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const demoRequest = useRef<AbortController | null>(null);

  const loadFor = useCallback(async (next: IdentitySession) => {
    demoRequest.current?.abort();
    const controller = new AbortController();
    demoRequest.current = controller;
    const response = await fetch("/api/demo-dataset", { cache: "no-store", signal: controller.signal,
      headers: { "X-Career-Identity": next.employeeId } });
    if (!response.ok) throw new Error("DATA_UNAVAILABLE");
    const body = await response.json() as { dataset: NormalizedDataset };
    if (controller.signal.aborted || sessionRef.current?.employeeId !== next.employeeId || sourceRef.current !== "demo") return;
    if (!sharedEmployeeStore.getState().loadDataset(projectDataset(body.dataset))) throw new Error("INVALID_DATA");
    // Keep already confirmed demo progress when moving between authorized personas.
    // Imported datasets are never mixed into the shared company demo.
    const ledger = new Map<string, EmployeeState["ledger"][number]>();
    for (const saved of snapshots.current.values()) for (const entry of saved.ledger) {
      if (body.dataset.employeesById[entry.employeeId]) ledger.set(entry.id, entry);
    }
    if (ledger.size) {
      sharedEmployeeStore.setState({ ledger: Object.freeze([...ledger.values()]) });
      sharedEmployeeStore.getState().connect(createRealIntelligenceAdapter());
    }
    sharedEmployeeStore.getState().selectEmployee(next.employeeId);
  }, []);

  const adopt = useCallback(async (next: IdentitySession | null, replaceWorkspace = sourceRef.current === "demo") => {
    const previous = sessionRef.current;
    if (previous?.employeeId === next?.employeeId) {
      setSession(next);
      if (!next && sourceRef.current === "demo") clearWorkspace();
      return;
    }
    if (!replaceWorkspace) {
      // Local uploads remain usable when messaging/identity is unavailable.
      sessionRef.current = next; setSession(next); return;
    }
    if (previous && sourceRef.current === "demo" && sharedEmployeeStore.getState().dataset) {
      snapshots.current.set(previous.employeeId, sharedEmployeeStore.getState());
    }
    demoRequest.current?.abort();
    clearWorkspace();
    sessionRef.current = next;
    setSession(next);
    sourceRef.current = "demo";
    setSource("demo");
    if (next) await loadFor(next);
  }, [loadFor]);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try {
      const response = await fetch("/api/identity/session", { cache: "no-store" });
      if (!response.ok) throw new Error("IDENTITY_UNAVAILABLE");
      const body = await response.json() as { session: IdentitySession | null };
      if (current !== generation.current) return;
      await adopt(body.session);
    } catch {
      if (current === generation.current) {
        await adopt(null);
        setError(true);
      }
    } finally { if (current === generation.current) setLoading(false); }
  }, [adopt]);

  useEffect(() => {
    void refresh();
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("career-quest-identity");
      channel.current.onmessage = () => { void refresh(); };
    }
    return () => { generation.current++; demoRequest.current?.abort(); channel.current?.close();
      window.removeEventListener("focus", visible); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);

  const openPicker = useCallback((access?: "employee" | "hr") => {
    setPicker(access ?? "all"); setQuery(""); setError(false);
  }, []);
  useEffect(() => {
    if (!picker) return;
    const controller = new AbortController();
    fetch("/api/identity/people", { cache: "no-store", signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json(); })
      .then((body: { people: Person[] }) => setPeople(body.people))
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [picker]);

  const choose = async (employeeId: string) => {
    setChoosing(true); setError(false); generation.current++;
    try {
      const response = await fetch("/api/identity/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId }) });
      if (!response.ok) throw new Error();
      const body = await response.json() as { session: IdentitySession };
      if (sessionRef.current?.employeeId === body.session.employeeId) {
        if (sourceRef.current === "demo" && sharedEmployeeStore.getState().dataset) snapshots.current.set(body.session.employeeId, sharedEmployeeStore.getState());
        sourceRef.current = "demo"; setSource("demo"); clearWorkspace(); await loadFor(body.session);
      } else await adopt(body.session, true);
      setPicker(null); channel.current?.postMessage("changed");
    } catch { setError(true); }
    finally { setChoosing(false); setLoading(false); }
  };
  const logout = async () => {
    generation.current++;
    try {
      const response = await fetch("/api/identity/session", { method: "DELETE" });
      if (!response.ok) throw new Error("IDENTITY_UNAVAILABLE");
      await adopt(null); snapshots.current.clear(); clearWorkspace(); channel.current?.postMessage("changed");
    } catch { openPicker(); setError(true); }
  };
  const loadDemo = async () => {
    const current = sessionRef.current;
    if (!current) { openPicker(); return; }
    if (sourceRef.current === "demo" && sharedEmployeeStore.getState().dataset) snapshots.current.set(current.employeeId, sharedEmployeeStore.getState());
    sourceRef.current = "demo"; setSource("demo");
    setLoading(true); setError(false);
    try { clearWorkspace(); await loadFor(current); }
    catch { openPicker(); setError(true); }
    finally { setLoading(false); }
  };
  const filtered = people.filter((person) => (picker === "all" || person.access === picker)
    && `${person.fullName} ${person.employeeId} ${catalogName(person.role, locale)} ${person.department}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <IdentityContext.Provider value={{ session, loading, workspaceSource, openPicker, refresh, loadDemo, logout,
    useImportedDataset: () => { demoRequest.current?.abort(); sourceRef.current = "import"; setSource("import"); } }}>
    {children}
    {picker && <Modal title={picker === "hr" ? t("Выберите HR-профиль", "HR профилін таңдаңыз", "Choose an HR profile") : t("Кто вы в демо?", "Демода кімсіз?", "Who are you in this demo?")} onClose={() => { if (!choosing) setPicker(null); }}>
      <p className={styles.intro}>{t("Выбор синтетического профиля для демо. Это не вход в корпоративный аккаунт.", "Демо үшін синтетикалық профильді таңдаңыз. Бұл корпоративтік аккаунтқа кіру емес.", "Choose a synthetic demo profile. This is not a corporate account sign-in.")}</p>
      <label className={styles.search}>{t("Найти профиль", "Профильді табу", "Find a profile")}<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Имя, роль или ID", "Аты, рөлі немесе ID", "Name, role or ID")} /></label>
      {error && <p role="alert" className={styles.error}>{t("Не удалось загрузить профиль. Проверьте доступность сервера и повторите выбор.", "Профильді жүктеу мүмкін болмады. Сервердің қолжетімділігін тексеріп, қайта таңдаңыз.", "Could not load the profile. Check server availability and choose again.")}</p>}
      <div className={styles.people} aria-busy={choosing}>
        {filtered.map((person) => <button type="button" key={person.employeeId} disabled={choosing} className={styles.person} onClick={() => void choose(person.employeeId)}>
          <span className={styles.avatar}>{person.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span>
          <span><strong>{person.fullName}</strong><small>{catalogName(person.role, locale)} · {catalogName(person.grade, locale)} · {person.employeeId}</small></span>
          {session?.employeeId === person.employeeId && <span aria-label={t("Текущий профиль", "Ағымдағы профиль", "Current profile")}>✓</span>}
        </button>)}
        {!filtered.length && <p>{t("Профили не найдены", "Профильдер табылмады", "No profiles found")}</p>}
      </div>
      <details className={styles.help}><summary>{t("Как проверить переписку вдвоём", "Екеуара хат алмасуды тексеру", "Testing a conversation with two people")}</summary><p>{t("Для второго сотрудника откройте приложение в приватном окне или другом профиле браузера. Обычные вкладки одного профиля используют общий вход.", "Екінші қызметкер үшін қолданбаны жеке терезеде немесе браузердің басқа профилінде ашыңыз. Бір профильдің қалыпты қойындылары ортақ кіруді пайдаланады.", "Open a private window or another browser profile for the second employee. Regular tabs in one browser profile share the same sign-in.")}</p></details>
    </Modal>}
  </IdentityContext.Provider>;
}
