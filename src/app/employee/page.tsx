"use client";
import { EmployeeWorkspace } from "../../components/employee/EmployeeWorkspace";
import {
  EmployeeStoreProvider,
  useOptionalEmployeeStore,
} from "../../state/EmployeeStoreProvider";
export default function EmployeePage() {
  const shared = useOptionalEmployeeStore();
  return shared ? (
    <EmployeeWorkspace />
  ) : (
    <EmployeeStoreProvider>
      <EmployeeWorkspace />
    </EmployeeStoreProvider>
  );
}
