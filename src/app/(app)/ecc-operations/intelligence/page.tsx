import type { Metadata } from "next";
import { EccIntelligencePage } from "@/modules/ecc-operations";

export const metadata: Metadata = {
  title: "ECC Intelligence",
};

export default function EccIntelligenceRoute() {
  return <EccIntelligencePage />;
}
