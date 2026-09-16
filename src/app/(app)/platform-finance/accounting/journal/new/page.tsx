import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Journal",
};

/** New Journal Entry opens as a panel on the register — not a dedicated route. */
export default function PlatformFinanceNewJournalRoute() {
  redirect("/platform-finance/accounting/journal");
}
