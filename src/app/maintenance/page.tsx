import type { Metadata } from "next";
import { Wrench } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export const metadata: Metadata = {
  title: "Maintenance",
};

export default function MaintenancePage() {
  return (
    <ModulePlaceholder
      title="Maintenance"
      description="Preventive schedules, inspections, and corrective plans."
      icon={Wrench}
      moduleName="Maintenance"
    />
  );
}
