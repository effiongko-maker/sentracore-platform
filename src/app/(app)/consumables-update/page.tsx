import type { Metadata } from "next";
import { ConsumablesUpdatesPage } from "@/modules/consumables-update";

export const metadata: Metadata = {
  title: "Consumables Update",
};

export default function ConsumablesUpdateRoute() {
  return <ConsumablesUpdatesPage />;
}
