import type { Metadata } from "next";
import { EccRequestsPage } from "@/modules/ecc-operations";

export const metadata: Metadata = {
  title: "ECC Requests",
};

export default function EccRequestsRoute() {
  return <EccRequestsPage />;
}
