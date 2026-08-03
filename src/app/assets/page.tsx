import type { Metadata } from "next";
import { AssetsPage } from "@/modules/assets";

export const metadata: Metadata = {
  title: "Assets",
};

export default function AssetsRoute() {
  return <AssetsPage />;
}
