import type { Metadata } from "next";
import { PlatformFinanceFoundationPage } from "@/modules/platform-finance";

export const metadata: Metadata = {
  title: "Platform Finance",
};

export default function PlatformFinanceRoute() {
  return <PlatformFinanceFoundationPage />;
}
