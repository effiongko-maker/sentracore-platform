import type { Metadata } from "next";
import { ExecutiveLensPage } from "@/modules/command-centre/components/ExecutiveLensPage";
import { getExecutiveLens } from "@/modules/command-centre/nav";
import { guardExecutiveOffice } from "@/modules/command-centre/server/guardExecutiveOffice";

const lens = getExecutiveLens("commitments");

export const metadata: Metadata = { title: `${lens.label} · Executive Office` };

/** Executive Office → commitments lens (foundation route; same server-side gate as the Overview). */
export default async function ExecutiveCommitmentsRoute() {
  const gate = await guardExecutiveOffice();
  if (!gate.ok) return gate.node;
  return <ExecutiveLensPage lens={lens} />;
}
