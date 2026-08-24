import type { Metadata } from "next";
import { Settings2 } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export const metadata: Metadata = {
  title: "Platform",
};

export default function PlatformPage() {
  return (
    <ModulePlaceholder
      title="Platform"
      description="Configure modules, integrations, and enterprise settings."
      icon={Settings2}
      moduleName="Platform"
    />
  );
}
