import type { Metadata } from "next";
import { EccDailyOpsPage } from "@/modules/ecc-operations";

export const metadata: Metadata = {
  title: "ECC Daily Operations",
};

export default function EccDailyOpsRoute() {
  return <EccDailyOpsPage />;
}
