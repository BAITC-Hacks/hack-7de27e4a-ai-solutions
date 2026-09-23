import type { Metadata } from "next";

import { HrCommandCenter } from "@/components/hr/hr-command-center";
import { loadBundledDataset } from "@/domain/data/server";

export const metadata: Metadata = {
  title: "HR Command Center · Career Quest",
  description: "Aggregate skill gaps, development coverage and activity participation without employee rankings.",
};

export default async function HrPage() {
  const dataset = await loadBundledDataset();
  return <HrCommandCenter initialDataset={dataset} />;
}
