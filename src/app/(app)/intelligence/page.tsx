import type { Metadata } from "next";
import { IntelligenceAccessRestricted } from "@/modules/intelligence/components/IntelligenceAccessRestricted";
import { loadIntelligenceForRoute } from "@/lib/intelligence/loadIntelligenceForRoute";
import {
  IntelligenceLoadError,
  IntelligencePage,
} from "@/modules/intelligence";

export const metadata: Metadata = {
  title: "Intelligence",
};

export default async function IntelligenceRoute() {
  const result = await loadIntelligenceForRoute();
  if (result.status === "forbidden") return <IntelligenceAccessRestricted />;
  if (result.status === "error") return <IntelligenceLoadError />;
  return <IntelligencePage data={result.data} />;
}
