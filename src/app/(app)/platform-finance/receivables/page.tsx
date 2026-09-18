import type { Metadata } from "next";
import { PlatformFinanceReceivablesPage } from "@/modules/platform-finance/components/PlatformFinanceReceivablesPage";

export const metadata: Metadata = { title: "Receivables" };
export default function ReceivablesRoute() { return <PlatformFinanceReceivablesPage />; }
