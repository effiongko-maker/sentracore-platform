import type { Metadata } from "next";
import { PlatformFinanceNewVendorBillPage } from "@/modules/platform-finance/components/PlatformFinanceNewVendorBillPage";

export const metadata: Metadata = {
  title: "Create Vendor Bill",
};

export default function PlatformFinanceNewVendorBillRoute() {
  return <PlatformFinanceNewVendorBillPage />;
}
