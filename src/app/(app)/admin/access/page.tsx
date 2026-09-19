import type { Metadata } from "next";
import { AccessView } from "@/modules/platform-admin/client/AccessView";

export const metadata: Metadata = { title: "Access" };

export default function Route() {
  return <AccessView />;
}
