import type { Metadata } from "next";
import { WorkspacePage } from "@/modules/workspace";

export const metadata: Metadata = {
  title: "Facility Management",
};

export default function OperationsHomePage() {
  return <WorkspacePage />;
}
