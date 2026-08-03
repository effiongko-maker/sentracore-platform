import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export const metadata: Metadata = {
  title: "Work Orders",
};

export default function WorkOrdersPage() {
  return (
    <ModulePlaceholder
      title="Work Orders"
      description="Create, assign, and track operational work requests."
      icon={ClipboardList}
      moduleName="Work Orders"
    />
  );
}
