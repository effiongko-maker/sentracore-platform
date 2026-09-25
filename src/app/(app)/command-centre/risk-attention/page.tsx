import type { Metadata } from "next";
import { ExecutiveLensPage } from "@/modules/command-centre/components/ExecutiveLensPage";
import { getExecutiveLens } from "@/modules/command-centre/nav";
import { guardExecutiveOffice } from "@/modules/command-centre/server/guardExecutiveOffice";
import { CommandCentreServerService } from "@/modules/command-centre/server/CommandCentreServerService";

const lens = getExecutiveLens("risk-attention");

export const metadata: Metadata = { title: `${lens.label} · Executive Office` };

/** Executive Office → risk-attention lens (the same Executive Office projection and gate as the Overview; never moves the last-visit marker). */
export default async function ExecutiveRiskAttentionRoute() {
  const gate = await guardExecutiveOffice();
  if (!gate.ok) return gate.node;
  const snapshot = await new CommandCentreServerService().load(gate.access, { trackVisit: false });
  return <ExecutiveLensPage lens={lens} snapshot={snapshot} />;
}
