import type { Metadata } from "next";
import { ReportsPage } from "@/modules/reports";

export const metadata: Metadata = {
  title: "Reports",
};

export default function ReportsRoutePage() {
  return <ReportsPage />;
}
