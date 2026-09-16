import type { Metadata } from "next";
import { PlatformFinanceVendorBillsPage } from "@/modules/platform-finance/components/PlatformFinanceVendorBillsPage";

export const metadata: Metadata = {
  title: "Vendor Bills",
};

export default function PlatformFinanceVendorBillsRoute() {
  return <PlatformFinanceVendorBillsPage />;
}
