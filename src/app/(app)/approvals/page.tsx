import type { Metadata } from "next";
import { ApprovalsPage } from "@/modules/approvals";

export const metadata: Metadata = {
  title: "Approvals",
};

export default function ApprovalsRoute() {
  return <ApprovalsPage />;
}
