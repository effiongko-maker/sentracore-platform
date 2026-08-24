import type { Metadata } from "next";
import { MaintenancePage } from "@/modules/maintenance";

export const metadata: Metadata = {
  title: "Maintenance",
};

export default function MaintenanceRoute() {
  return <MaintenancePage />;
}
