import type { Metadata } from "next";
import "@/styles/finance.css";
import { ClientPaymentFormPage } from "@/modules/finance/components/ClientPaymentFormPage";

export const metadata: Metadata = {
  title: "New client payment",
};

type PageProps = {
  searchParams: Promise<{ kind?: string }>;
};

export default async function NewClientPaymentRoute({ searchParams }: PageProps) {
  const params = await searchParams;
  return <ClientPaymentFormPage initialKind={params.kind} />;
}
