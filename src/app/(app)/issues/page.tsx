import type { Metadata } from "next";
import { IssuesPage } from "@/modules/issues";

export const metadata: Metadata = {
  title: "Issues",
};

export default function IssuesRoute() {
  return <IssuesPage />;
}
