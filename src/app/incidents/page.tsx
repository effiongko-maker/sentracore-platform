import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export const metadata: Metadata = {
  title: "Incidents",
};

export default function IncidentsPage() {
  return (
    <ModulePlaceholder
      title="Incidents"
      description="Capture, escalate, and resolve safety and operational events."
      icon={AlertTriangle}
      moduleName="Incidents"
    />
  );
}
