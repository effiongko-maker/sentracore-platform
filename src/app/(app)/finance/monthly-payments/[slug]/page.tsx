import type { Metadata } from "next";
import "@/styles/finance.css";
import { MonthlyContractPaymentDetailPage } from "@/modules/finance/components/MonthlyContractPaymentDetailPage";

export const metadata: Metadata = {
  title: "Monthly contract payment",
};

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function MonthlyContractPaymentDetailRoute({ params }: PageProps) {
  const { slug } = await params;
  return <MonthlyContractPaymentDetailPage slug={decodeURIComponent(slug)} />;
}
