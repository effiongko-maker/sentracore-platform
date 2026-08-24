import type { Metadata } from "next";
import { getOrganisationIntelligence } from "@/lib/intelligence";
import {
  IntelligenceLoadError,
  IntelligencePage,
} from "@/modules/intelligence";

export const metadata: Metadata = {
  title: "Intelligence",
};

export default async function IntelligenceRoute() {
  try {
    const intelligence = await getOrganisationIntelligence();
    return <IntelligencePage data={intelligence} />;
  } catch {
    return <IntelligenceLoadError />;
  }
}
