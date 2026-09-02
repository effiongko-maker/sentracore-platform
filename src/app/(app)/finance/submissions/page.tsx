import "@/styles/finance.css";

import type { Metadata } from "next";
import { SubmissionsPage } from "@/modules/finance/components/SubmissionsPage";

export const metadata: Metadata = {
  title: "Submissions",
};

export default function FinanceSubmissionsRoute() {
  return <SubmissionsPage />;
}
