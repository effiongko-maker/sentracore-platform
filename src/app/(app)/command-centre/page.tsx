import Link from "next/link";
import { redirect } from "next/navigation";
import { isActionError } from "@/lib/actions/errors";
import { PrivateOfficeDoorway } from "@/modules/private-office/components/PrivateOfficeDoorway";
import { canEnterPrivateOffice } from "@/modules/private-office/server/requirePrivateOfficeAccess";
import {
  requireCommandCentreAccess,
} from "@/modules/command-centre";
import { CommandCentrePage } from "@/modules/command-centre/components/CommandCentrePage";
import { CommandCentreServerService } from "@/modules/command-centre/server/CommandCentreServerService";

export default async function CommandCentreRoute() {
  let snapshot;
  let privateOfficeDoorway = false;
  try {
    const access = await requireCommandCentreAccess();
    snapshot = await new CommandCentreServerService().load(access);
    // Doorway only: a boolean from Private Office's own gate. Executive Office never loads Private Office data.
    privateOfficeDoorway = await canEnterPrivateOffice();
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
              <h1>Executive Office unavailable</h1>
              <p>
                {error.message ||
                  "You do not have Executive Office access for this organisation."}
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
      footer={privateOfficeDoorway ? <PrivateOfficeDoorway /> : null}
    />
  );
}
