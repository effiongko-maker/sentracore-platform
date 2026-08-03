import type { Metadata } from "next";
import { Zap } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export const metadata: Metadata = {
  title: "Utilities",
};

export default function UtilitiesPage() {
  return (
    <ModulePlaceholder
      title="Utilities"
      description="Monitor energy, water, and utility consumption."
      icon={Zap}
      moduleName="Utilities"
    />
  );
}
