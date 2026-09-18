import type { Metadata } from "next";
import { PlatformFinanceInvoiceDetailPage } from "@/modules/platform-finance/components/PlatformFinanceInvoiceDetailPage";

export const metadata: Metadata = { title: "Invoice" };

export default function PlatformFinanceInvoiceDetailRoute() {
  return <PlatformFinanceInvoiceDetailPage />;
}
