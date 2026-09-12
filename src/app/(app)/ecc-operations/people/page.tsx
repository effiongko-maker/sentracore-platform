import type { Metadata } from "next";
import { EccPeoplePage } from "@/modules/ecc-operations";

export const metadata: Metadata = {
  title: "ECC People",
};

export default function EccPeopleRoute() {
  return <EccPeoplePage />;
}
