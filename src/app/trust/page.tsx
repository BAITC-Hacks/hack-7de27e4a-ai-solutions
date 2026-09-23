import type { Metadata } from "next";
import { connection } from "next/server";

import { TrustCenter } from "@/components/trust/trust-center";
import { loadBundledDataset } from "@/domain/data/server";

export const metadata: Metadata = {
  title: "AI Trust Center · Career Quest",
  description: "Deterministic evaluation, evidence grounding and bounded LLM verification.",
};

export default async function TrustPage() {
  await connection();
  const dataset = await loadBundledDataset();
  return (
    <TrustCenter
      initialDataset={dataset}
      modelConfigured={Boolean(process.env.LLM_API_KEY?.trim())}
    />
  );
}
