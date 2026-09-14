import type { Metadata } from "next";
import { WorkPage } from "@/modules/work";

export const metadata: Metadata = {
  title: "Work In Progress",
};

export default function WorkRoute() {
  return <WorkPage />;
}
