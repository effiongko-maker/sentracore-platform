import type { Metadata } from "next";
import { PlatformFinanceNewInvoicePage } from "@/modules/platform-finance/components/PlatformFinanceNewInvoicePage";

export const metadata: Metadata = { title: "New Invoice" };

export default function PlatformFinanceNewInvoiceRoute() {
  return <PlatformFinanceNewInvoicePage />;
}
