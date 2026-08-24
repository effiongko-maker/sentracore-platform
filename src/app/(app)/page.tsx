import type { Metadata } from "next";
import { PlatformHomePage } from "@/modules/platform";

export const metadata: Metadata = {
  title: "SentraCore",
};

export default function PlatformHomeRoute() {
  return <PlatformHomePage />;
}
