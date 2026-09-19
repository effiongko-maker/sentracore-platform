import type { Metadata } from "next";
import { OverviewView } from "@/modules/platform-admin/client/OverviewView";

export const metadata: Metadata = { title: "Overview" };

export default function Route() {
  return <OverviewView />;
}
