import type { Metadata } from "next";
import { IncidentsPage } from "@/modules/incidents";

export const metadata: Metadata = {
  title: "Incidents",
};

export default function IncidentsRoute() {
  return <IncidentsPage />;
}
