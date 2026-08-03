import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export const metadata: Metadata = {
  title: "Dashboards",
};

export default function DashboardsPage() {
  return (
    <ModulePlaceholder
      title="Dashboards"
      description="Analytics, KPIs, and operational performance views."
      icon={BarChart3}
      moduleName="Dashboards"
    />
  );
}
