import type { Metadata } from "next";
import { DieselUsagePage } from "@/modules/diesel-usage";

export const metadata: Metadata = {
  title: "Diesel Usage",
};

export default function DieselUsageRoute() {
  return <DieselUsagePage />;
}
