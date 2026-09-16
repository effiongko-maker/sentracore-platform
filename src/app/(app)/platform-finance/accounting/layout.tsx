import type { ReactNode } from "react";
import { PlatformFinanceAccountingShell } from "@/modules/platform-finance/components/PlatformFinanceAccountingShell";

export default function AccountingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <PlatformFinanceAccountingShell>{children}</PlatformFinanceAccountingShell>
  );
}
