import type { Metadata } from "next";
import { PlatformFinanceRequestReviewPage } from "@/modules/platform-finance/components/PlatformFinanceRequestReviewPage";

export const metadata: Metadata = {
  title: "Financial Request Review",
};

export default function PlatformFinanceRequestReviewRoute() {
  return <PlatformFinanceRequestReviewPage />;
}
