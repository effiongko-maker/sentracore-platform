import type { Metadata } from "next";
import { PlatformFinanceOverviewPage } from "@/modules/platform-finance";

export const metadata: Metadata = {
  title: "Finance Overview",
};

export default function PlatformFinanceRoute() {
  return <PlatformFinanceOverviewPage />;
}
