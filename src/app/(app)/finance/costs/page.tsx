import type { Metadata } from "next";
import { CostRecordsPage } from "@/modules/finance";

export const metadata: Metadata = {
  title: "Cost Records",
};

export default function CostRecordsRoute() {
  return <CostRecordsPage />;
}
