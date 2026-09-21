import Link from "next/link";
import { redirect } from "next/navigation";
import { isActionError } from "@/lib/actions/errors";
import { BatcaveDoorway } from "@/modules/batcave/components/BatcaveDoorway";
import { canEnterBatcave } from "@/modules/batcave/server/requireBatcaveAccess";
import {
  requireCommandCentreAccess,
} from "@/modules/command-centre";
import { CommandCentrePage } from "@/modules/command-centre/components/CommandCentrePage";
import { CommandCentreServerService } from "@/modules/command-centre/server/CommandCentreServerService";

export default async function CommandCentreRoute() {
  let snapshot;
  let batcaveDoorway = false;
  try {
    const access = await requireCommandCentreAccess();
    snapshot = await new CommandCentreServerService().load(access);
    // Doorway only: a boolean from Batcave's own gate. Command Centre never loads Batcave data.
    batcaveDoorway = await canEnterBatcave();
  } catch (error) {
    if (isActionError(error)) {
      if (error.code === "UNAUTHENTICATED") {
        redirect("/login");
      }
      if (
        error.code === "FORBIDDEN" ||
        error.code === "ORGANISATION_NOT_FOUND" ||
        error.code === "ORGANISATION_INACTIVE" ||
        error.code === "PROFILE_NOT_FOUND"
      ) {
        return (
          <div className="scc">
            <div className="scc-access-denied" role="alert">
              <h1>Command Centre unavailable</h1>
              <p>
                {error.message ||
                  "You do not have Command Centre access for this organisation."}
              </p>
              <Link href="/">Return to Platform Home</Link>
            </div>
          </div>
        );
      }
    }
    throw error;
  }
  return (
    <CommandCentrePage
      snapshot={snapshot}
      footer={batcaveDoorway ? <BatcaveDoorway /> : null}
    />
  );
}
