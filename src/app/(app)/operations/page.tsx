import type { Metadata } from "next";
import { WorkspacePage } from "@/modules/workspace";

export const metadata: Metadata = {
  title: "Operations",
};

export default function OperationsHomePage() {
  return <WorkspacePage />;
}
