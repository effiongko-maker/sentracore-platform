import type { Metadata } from "next";
import { EccIssuesPage } from "@/modules/ecc-operations";

export const metadata: Metadata = {
  title: "ECC Issues",
};

export default function EccIssuesRoute() {
  return <EccIssuesPage />;
}
