import type { Metadata } from "next";
import { PlatformFinanceInvoiceDocumentPage } from "@/modules/platform-finance/components/PlatformFinanceInvoiceDocumentPage";

export const metadata: Metadata = { title: "Invoice document" };

export default function PlatformFinanceInvoiceDocumentRoute() {
  return <PlatformFinanceInvoiceDocumentPage />;
}
