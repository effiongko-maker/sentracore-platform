import type { Metadata } from "next";
import { FacilitiesPage } from "@/modules/facilities";

export const metadata: Metadata = {
  title: "Facilities",
};

export default function FacilitiesRoute() {
  return <FacilitiesPage />;
}
