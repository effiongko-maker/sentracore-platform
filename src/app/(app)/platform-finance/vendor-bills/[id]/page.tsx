import type { Metadata } from "next";
import { PlatformFinanceVendorBillDetailPage } from "@/modules/platform-finance/components/PlatformFinanceVendorBillDetailPage";

export const metadata: Metadata = {
  title: "Vendor Bill",
};

export default function PlatformFinanceVendorBillDetailRoute() {
  return <PlatformFinanceVendorBillDetailPage />;
}
