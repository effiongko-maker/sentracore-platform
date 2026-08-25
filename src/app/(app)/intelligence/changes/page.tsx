import type { Metadata } from "next";
import { getOrganisationIntelligence } from "@/lib/intelligence";
import {
  IntelligenceLoadError,
} from "@/modules/intelligence";
import { ChangesExplorationPage } from "@/modules/intelligence/experience/ChangesExplorationPage";

export const metadata: Metadata = {
  title: "What changed · Intelligence",
};

export default async function IntelligenceChangesRoute() {
  try {
    const intelligence = await getOrganisationIntelligence();
    return <ChangesExplorationPage data={intelligence} />;
  } catch {
    return <IntelligenceLoadError />;
  }
}
