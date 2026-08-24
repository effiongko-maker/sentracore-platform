import type { Metadata } from "next";
import { DashboardPage } from "@/modules/dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardsPage() {
  return <DashboardPage />;
}
