import type { Metadata } from "next";
import { IntelligenceAccessRestricted } from "@/modules/intelligence/components/IntelligenceAccessRestricted";
import { loadIntelligenceForRoute } from "@/lib/intelligence/loadIntelligenceForRoute";
import {
  IntelligenceLoadError,
} from "@/modules/intelligence";
import { ChangesExplorationPage } from "@/modules/intelligence/experience/ChangesExplorationPage";

export const metadata: Metadata = {
  title: "What changed · Intelligence",
};

export default async function IntelligenceChangesRoute() {
  const result = await loadIntelligenceForRoute();
  if (result.status === "forbidden") return <IntelligenceAccessRestricted />;
  if (result.status === "error") return <IntelligenceLoadError />;
  return <ChangesExplorationPage data={result.data} />;
}
