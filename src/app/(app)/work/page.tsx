import type { Metadata } from "next";
import { WorkPage } from "@/modules/work";

export const metadata: Metadata = {
  title: "Work",
};

export default function WorkRoute() {
  return <WorkPage />;
}
