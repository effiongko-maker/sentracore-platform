import type { Metadata } from "next";
import { EccReportingPage } from "@/modules/ecc-operations";

export const metadata: Metadata = {
  title: "ECC Reporting",
};

export default function EccReportingRoute() {
  return <EccReportingPage />;
}
