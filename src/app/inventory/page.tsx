import type { Metadata } from "next";
import { Boxes } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export const metadata: Metadata = {
  title: "Inventory",
};

export default function InventoryPage() {
  return (
    <ModulePlaceholder
      title="Inventory"
      description="Stock levels, parts, and consumable tracking."
      icon={Boxes}
      moduleName="Inventory"
    />
  );
}
