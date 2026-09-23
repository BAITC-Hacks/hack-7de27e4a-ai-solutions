"use client";
import { createContext, useContext, useRef, type ReactNode } from "react";
import { useStore } from "zustand";
import {
  createEmployeeStore,
  type EmployeeState,
  type EmployeeStore,
} from "./employeeStore";
const Context = createContext<EmployeeStore | null>(null);
export function EmployeeStoreProvider({
  children,
  store,
}: {
  children: ReactNode;
  store?: EmployeeStore;
}) {
  const ref = useRef<EmployeeStore | null>(null);
  if (!ref.current) ref.current = store ?? createEmployeeStore();
  return <Context.Provider value={ref.current}>{children}</Context.Provider>;
}
export function useEmployeeStore<T>(selector: (state: EmployeeState) => T): T {
  const store = useContext(Context);
  if (!store)
    throw new Error(
      "Wrap Employee, HR and Trust in the same EmployeeStoreProvider",
    );
  return useStore(store, selector);
}
export function useOptionalEmployeeStore() {
  return useContext(Context);
}
