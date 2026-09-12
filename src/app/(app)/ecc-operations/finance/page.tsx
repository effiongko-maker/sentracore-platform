import type { Metadata } from "next";
import { EccFinancePage } from "@/modules/ecc-operations";

export const metadata: Metadata = {
  title: "ECC Finance",
};

export default function EccFinanceRoute() {
  return <EccFinancePage />;
}
