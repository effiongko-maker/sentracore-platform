import type { Metadata } from "next";
import { WorkspacePage } from "@/modules/workspace";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return <WorkspacePage />;
}
