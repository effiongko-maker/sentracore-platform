import type { Metadata } from "next";
import "@/styles/finance.css";
import { SubmissionWorkflowPage } from "@/modules/finance/components/SubmissionWorkflowPage";

export const metadata: Metadata = {
  title: "Create submission",
};

type PageProps = {
  searchParams: Promise<{ costId?: string }>;
};

export default async function NewSubmissionRoute({ searchParams }: PageProps) {
  const params = await searchParams;
  return <SubmissionWorkflowPage initialCostId={params.costId} />;
}
