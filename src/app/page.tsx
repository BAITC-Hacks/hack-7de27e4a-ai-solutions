import { connection } from "next/server";

import { CareerDashboard } from "@/components/employee/career-dashboard";
import { buildPrivateEmployeeDataset } from "@/domain/data";
import { loadBundledDataset } from "@/domain/data/server";
import { createDatasetFingerprint } from "@/state/progress-ledger";

export default async function HomePage() {
  await connection();
  const dataset = await loadBundledDataset();
  const configuredViewer = process.env.CAREER_QUEST_VIEWER_ID?.trim();
  const viewerEmployeeId =
    (configuredViewer && dataset.employeesById[configuredViewer] ? configuredViewer : null) ??
    Object.keys(dataset.employeesById).sort()[0];
  const privateDataset = buildPrivateEmployeeDataset(dataset, viewerEmployeeId);
  const ledgerDatasetFingerprint = createDatasetFingerprint(dataset);

  return (
    <CareerDashboard
      initialDataset={privateDataset}
      viewerEmployeeId={viewerEmployeeId}
      ledgerDatasetFingerprint={ledgerDatasetFingerprint}
      accessMode="employee"
      allowDatasetImport={false}
    />
  );
}
