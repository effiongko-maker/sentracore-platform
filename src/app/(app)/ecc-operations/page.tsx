import type { Metadata } from "next";
import { EccOverviewPage } from "@/modules/ecc-operations";

export const metadata: Metadata = {
  title: "ECC Operations",
};

export default function EccOperationsRoute() {
  return <EccOverviewPage />;
}
