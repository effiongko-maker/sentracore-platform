import type { Metadata } from "next";
import { GeneratorLogsPage } from "@/modules/generator-log";

export const metadata: Metadata = {
  title: "Generator Log",
};

export default function GeneratorLogRoute() {
  return <GeneratorLogsPage />;
}
