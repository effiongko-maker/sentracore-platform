import type { Metadata } from "next";
import { PlatformFinanceReportsLanding } from "@/modules/platform-finance/components/PlatformFinanceReportsLanding";

export const metadata: Metadata = { title: "Reports" };

export default function PlatformFinanceReportsRoute() {
  return <PlatformFinanceReportsLanding />;
}
