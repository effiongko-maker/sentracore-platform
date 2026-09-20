import type { Metadata } from "next";
import { IntelligenceAccessRestricted } from "@/modules/intelligence/components/IntelligenceAccessRestricted";
import { loadIntelligenceForRoute } from "@/lib/intelligence/loadIntelligenceForRoute";
import {
  IntelligenceLoadError,
} from "@/modules/intelligence";
import { PatternsExplorationPage } from "@/modules/intelligence/experience/PatternsExplorationPage";

export const metadata: Metadata = {
  title: "Patterns · Intelligence",
};

export default async function IntelligencePatternsRoute() {
  const result = await loadIntelligenceForRoute();
  if (result.status === "forbidden") return <IntelligenceAccessRestricted />;
  if (result.status === "error") return <IntelligenceLoadError />;
  return <PatternsExplorationPage data={result.data} />;
}
