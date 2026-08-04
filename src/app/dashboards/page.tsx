import type { Metadata } from "next";
import { DashboardPage } from "@/modules/dashboard";

export const metadata: Metadata = {
  title: "Dashboards",
};

export default function DashboardsPage() {
  return <DashboardPage />;
}
