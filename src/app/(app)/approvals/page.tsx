import type { Metadata } from "next";
import { ApprovalsPage } from "@/modules/approvals";

export const metadata: Metadata = {
  title: "Payment Approvals",
};

export default function ApprovalsRoute() {
  return <ApprovalsPage />;
}
