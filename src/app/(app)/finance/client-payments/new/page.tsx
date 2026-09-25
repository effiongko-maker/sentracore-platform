import type { Metadata } from "next";
import "@/styles/finance.css";
import { ClientPaymentFormPage } from "@/modules/finance/components/ClientPaymentFormPage";

export const metadata: Metadata = {
  title: "Payment request",
};

type PageProps = {
  searchParams: Promise<{ kind?: string; workOrder?: string }>;
};

export default async function NewClientPaymentRoute({ searchParams }: PageProps) {
  const params = await searchParams;
  return <ClientPaymentFormPage initialKind={params.kind} workOrderId={params.workOrder} />;
}
