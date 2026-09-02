import type { Metadata } from "next";
import "@/styles/finance.css";
import { CostDetailPage } from "@/modules/finance/components/CostDetailPage";

export const metadata: Metadata = {
  title: "Cost record",
};

type PageProps = {
  params: Promise<{ costId: string }>;
};

export default async function CostDetailRoute({ params }: PageProps) {
  const { costId } = await params;
  return <CostDetailPage costId={decodeURIComponent(costId)} />;
}
