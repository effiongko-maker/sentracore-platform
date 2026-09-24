import { canEnterPrivateOffice } from "@/modules/private-office/server/requirePrivateOfficeAccess";
import { PrivateOfficeDoorway } from "@/modules/private-office/components/PrivateOfficeDoorway";
import { CommandCentrePage } from "@/modules/command-centre/components/CommandCentrePage";
import { CommandCentreServerService } from "@/modules/command-centre/server/CommandCentreServerService";
import { guardExecutiveOffice } from "@/modules/command-centre/server/guardExecutiveOffice";

/** Executive Office → Overview (the evolution of the former Command Centre). */
export default async function CommandCentreRoute() {
  const gate = await guardExecutiveOffice();
  if (!gate.ok) return gate.node;
  const snapshot = await new CommandCentreServerService().load(gate.access);
  // Doorway only: a boolean from Private Office's own gate. Executive Office never loads Private Office data.
  const privateOfficeDoorway = await canEnterPrivateOffice();
  return (
    <CommandCentrePage
      snapshot={snapshot}
      footer={privateOfficeDoorway ? <PrivateOfficeDoorway /> : null}
    />
  );
}
