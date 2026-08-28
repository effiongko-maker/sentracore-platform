import type { Metadata } from "next";
import { RequestsPage } from "@/modules/requests/components/RequestsPage";

export const metadata: Metadata = {
  title: "Request Queue",
};

export default function RequestsRoute() {
  return <RequestsPage />;
}
