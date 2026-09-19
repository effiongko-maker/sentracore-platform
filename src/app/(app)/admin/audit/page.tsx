import type { Metadata } from "next";
import { AuditView } from "@/modules/platform-admin/client/AuditView";

export const metadata: Metadata = { title: "Audit" };

export default function Route() {
  return <AuditView />;
}
