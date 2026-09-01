import type { Metadata } from "next";
import { FinancePage } from "@/modules/finance";

export const metadata: Metadata = {
  title: "Finance",
};

export default function FinanceRoute() {
  return <FinancePage />;
}
