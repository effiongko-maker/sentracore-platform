import type { Metadata } from "next";
import "@/styles/finance.css";
import { SubmissionWorkflowPage } from "@/modules/finance/components/SubmissionWorkflowPage";

export const metadata: Metadata = {
  title: "Edit submission",
};

type PageProps = {
  params: Promise<{ submissionId: string }>;
};

export default async function EditSubmissionRoute({ params }: PageProps) {
  const { submissionId } = await params;
  return <SubmissionWorkflowPage submissionId={submissionId} />;
}
