import type { Metadata } from "next";
import { DashboardPage } from "@/modules/dashboard";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return <DashboardPage />;
}
