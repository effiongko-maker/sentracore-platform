import type { Metadata } from "next";
import { WorkOrdersPage } from "@/modules/work-orders";

export const metadata: Metadata = {
  title: "Work Orders",
};

export default function WorkOrdersRoute() {
  return <WorkOrdersPage />;
}
