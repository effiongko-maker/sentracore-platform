import type { Metadata } from "next";
import { PlatformFinanceRequestsPage } from "@/modules/platform-finance/components/PlatformFinanceRequestsPage";

export const metadata: Metadata = {
  title: "Financial Requests",
};

export default function PlatformFinanceRequestsRoute() {
  return <PlatformFinanceRequestsPage />;
}
