import type { Metadata } from "next";
import { PlatformFinanceInvoicesPage } from "@/modules/platform-finance/components/PlatformFinanceInvoicesPage";

export const metadata: Metadata = { title: "Invoices" };

export default function PlatformFinanceInvoicesRoute() {
  return <PlatformFinanceInvoicesPage />;
}
