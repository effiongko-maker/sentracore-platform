import type { Metadata } from "next";
import { getOrganisationIntelligence } from "@/lib/intelligence";
import {
  IntelligenceLoadError,
} from "@/modules/intelligence";
import { PatternsExplorationPage } from "@/modules/intelligence/experience/PatternsExplorationPage";

export const metadata: Metadata = {
  title: "Patterns · Intelligence",
};

export default async function IntelligencePatternsRoute() {
  try {
    const intelligence = await getOrganisationIntelligence();
    return <PatternsExplorationPage data={intelligence} />;
  } catch {
    return <IntelligenceLoadError />;
  }
}
