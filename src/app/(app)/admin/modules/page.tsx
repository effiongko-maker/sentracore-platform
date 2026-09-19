import type { Metadata } from "next";
import { ModulesView } from "@/modules/platform-admin/client/ModulesView";

export const metadata: Metadata = { title: "Modules" };

export default function Route() {
  return <ModulesView />;
}
