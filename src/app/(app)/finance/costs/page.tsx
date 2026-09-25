import type { Metadata } from "next";
import { CostRecordsPage } from "@/modules/finance";

export const metadata: Metadata = {
  title: "Cost Records",
};

export default async function CostRecordsRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return <CostRecordsPage initialView={params.view === "order_values" ? "order_values" : "costs"} />;
}
