import type { Metadata } from "next";
import { OperationalRegistersPage } from "@/modules/operational-registers";

export const metadata: Metadata = {
  title: "Operational Registers",
};

export default function OperationalRegistersRoute() {
  return <OperationalRegistersPage />;
}
