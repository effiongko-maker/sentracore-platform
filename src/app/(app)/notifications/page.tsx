import type { Metadata } from "next";
import { NotificationsPage } from "@/modules/workspace/components/NotificationsPage";

export const metadata: Metadata = {
  title: "Notifications",
};

export default function NotificationsRoute() {
  return <NotificationsPage />;
}
