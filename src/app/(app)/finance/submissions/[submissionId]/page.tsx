import type { Metadata } from "next";
import "@/styles/finance.css";
import { SubmissionDetailPage } from "@/modules/finance/components/SubmissionDetailPage";

export const metadata: Metadata = {
  title: "Submission",
};

type PageProps = {
  params: Promise<{ submissionId: string }>;
};

export default async function SubmissionDetailRoute({ params }: PageProps) {
  const { submissionId } = await params;
  return <SubmissionDetailPage submissionId={submissionId} />;
}
