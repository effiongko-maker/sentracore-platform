import type { Metadata } from "next";
import { ExecutiveLensPage } from "@/modules/command-centre/components/ExecutiveLensPage";
import { getExecutiveLens } from "@/modules/command-centre/nav";
import { guardExecutiveOffice } from "@/modules/command-centre/server/guardExecutiveOffice";

const lens = getExecutiveLens("financial-position");

export const metadata: Metadata = { title: `${lens.label} · Executive Office` };

/** Executive Office → financial-position lens (foundation route; same server-side gate as the Overview). */
export default async function ExecutiveFinancialPositionRoute() {
  const gate = await guardExecutiveOffice();
  if (!gate.ok) return gate.node;
  return <ExecutiveLensPage lens={lens} />;
}
