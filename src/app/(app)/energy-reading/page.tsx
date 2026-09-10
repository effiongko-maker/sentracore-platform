import type { Metadata } from "next";
import { EnergyReadingsPage } from "@/modules/energy-reading";

export const metadata: Metadata = {
  title: "Energy Reading",
};

export default function EnergyReadingRoute() {
  return <EnergyReadingsPage />;
}
