import { CareerDashboard } from "@/components/employee/career-dashboard";
import { loadBundledDataset } from "@/domain/data/server";

export default async function DemoLabPage() {
  const dataset = await loadBundledDataset();

  return (
    <CareerDashboard
      initialDataset={dataset}
      accessMode="demo"
      allowDatasetImport
    />
  );
}
